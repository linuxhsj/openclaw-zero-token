import { chromium } from "playwright-core";
import type { BrowserContext, Page } from "playwright-core";
import type { ModelDefinitionConfig } from "../config/types.models.js";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import {
  launchOpenClawChrome,
  stopOpenClawChrome,
  getChromeWebSocketUrl,
  type RunningChrome,
} from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";
import crypto from "node:crypto";

export interface XiaomiMimoWebClientOptions {
  cookie: string;
  userAgent?: string;
}

const XIAOMIMO_BASE_URL = "https://aistudio.xiaomimimo.com";

/** 模型名映射 */
const MODEL_MAP: Record<string, string> = {
  "xiaomimo-chat": "mimo-v2-flash-studio",
  "mimo-v2-pro": "mimo-v2-flash-studio",
};

/** 允许的工具列表(核心工具) */
const ALLOWED_TOOLS = [
  "read", "write", "edit", "exec", "process", "browser", "web_search", "web_fetch",
  "glob", "grep", "todowrite", "question",
];

export class XiaomiMimoWebClientBrowser {
  private cookie: string;
  private browser: BrowserContext | null = null;
  private page: Page | null = null;
  private running: RunningChrome | null = null;
  private conversationId: string | null = null;

  constructor(options: XiaomiMimoWebClientOptions | string) {
    if (typeof options === "string") {
      try {
        const parsed = JSON.parse(options) as XiaomiMimoWebClientOptions;
        this.cookie = parsed.cookie;
      } catch {
        this.cookie = options;
      }
    } else {
      this.cookie = options.cookie;
    }
  }

  private async ensureBrowser() {
    if (this.browser && this.page) return { browser: this.browser, page: this.page };

    const rootConfig = loadConfig();
    const browserConfig = resolveBrowserConfig(rootConfig.browser, rootConfig);
    const profile = resolveProfile(browserConfig, browserConfig.defaultProfile);
    if (!profile) throw new Error(`No browser profile`);

    let wsUrl: string | null = null;
    if (browserConfig.attachOnly) {
      for (let i = 0; i < 10; i++) {
        wsUrl = await getChromeWebSocketUrl(profile.cdpUrl, 2000);
        if (wsUrl) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!wsUrl) throw new Error(`Cannot connect to Chrome`);
    } else {
      this.running = await launchOpenClawChrome(browserConfig, profile);
      for (let i = 0; i < 10; i++) {
        wsUrl = await getChromeWebSocketUrl(`http://127.0.0.1:${this.running.cdpPort}`, 2000);
        if (wsUrl) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!wsUrl) throw new Error(`Cannot connect to Chrome`);
    }

    this.browser = (
      await chromium.connectOverCDP(wsUrl!, { headers: getHeadersWithAuth(wsUrl!) })
    ).contexts()[0]!;

    const pages = this.browser!.pages();
    let mimoPage = pages.find((p) => p.url().includes("xiaomimimo.com"));
    if (mimoPage) {
      this.page = mimoPage;
    } else {
      this.page = await this.browser!.newPage();
    }

    if (!this.page.url().includes("xiaomimimo.com")) {
      await this.page.goto(`${XIAOMIMO_BASE_URL}/`, { waitUntil: "domcontentloaded" });
    }

    // 设置 cookies
    const rawCookies = this.cookie
      .split(";")
      .filter((c) => c.trim().includes("="))
      .map((c) => {
        const [name, ...values] = c.trim().split("=");
        let value = values.join("=").trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        return { name: name!.trim(), value, domain: ".xiaomimimo.com", path: "/" };
      })
      .filter((c) => c.name.length > 0);

    if (rawCookies.length > 0) {
      try { await this.browser!.addCookies(rawCookies); } catch {}
    }

    return { browser: this.browser, page: this.page };
  }

  async init() {
    await this.ensureBrowser();
  }

  async chatCompletions(params: {
    conversationId?: string;
    message: string;
    model: string;
    signal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array>> {
    const { page } = await this.ensureBrowser();

    const modelInternal = MODEL_MAP[params.model] || params.model;
    const convId = params.conversationId || this.conversationId || "0";
    const msgId = crypto.randomUUID().replace(/-/g, "");

    console.log(`[XiaomiMimo] Model: ${params.model} -> ${modelInternal}`);
    console.log(`[XiaomiMimo] Conversation: ${convId}`);

    const result = await page.evaluate(
      async ({ message, modelInternal, convId, msgId }: {
        message: string;
        modelInternal: string;
        convId: string;
        msgId: string;
      }) => {
        const botPhMatch = document.cookie.match(/xiaomichatbot_ph=([^;]+)/);
        const botPh = botPhMatch?.[1] || "";
        
        const url = `/open-apis/bot/chat?xiaomichatbot_ph=${encodeURIComponent(botPh)}`;
        
        const body = {
          msgId,
          conversationId: convId,
          query: message,
          isEditedQuery: false,
          modelConfig: {
            enableThinking: false,
            webSearchStatus: "disabled",
            model: modelInternal,
            temperature: 0.8,
            topP: 0.95,
          },
          multiMedias: [],
        };

        console.log("[MiMo XHR] Sending to:", url);
        console.log("[MiMo XHR] Body:", JSON.stringify(body).substring(0, 200));

        return new Promise<{ ok: boolean; data: string; convId?: string; error?: string }>((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", url, true);
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.setRequestHeader("Accept", "text/event-stream, */*");
          xhr.withCredentials = true;

          let resolved = false;
          const timer = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.log("[MiMo XHR] Timeout, got:", xhr.responseText.length, "bytes");
              resolve({ ok: xhr.responseText.length > 0, data: xhr.responseText });
            }
          }, 30000);

          xhr.onprogress = () => {
            // 实时记录收到的数据
            if (xhr.responseText.length > 0 && !resolved) {
              console.log("[MiMo XHR] Receiving:", xhr.responseText.length, "bytes");
            }
          };

          xhr.onload = () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              console.log("[MiMo XHR] Loaded, status:", xhr.status, "length:", xhr.responseText.length);
              
              // 尝试从响应中提取 conversationId
              let newConvId: string | undefined;
              const convMatch = xhr.responseText.match(/conversationId['":\s]+['"]?([a-f0-9]+)/);
              if (convMatch) newConvId = convMatch[1];

              if (xhr.status >= 200 && xhr.status < 300) {
                resolve({ ok: true, data: xhr.responseText, convId: newConvId });
              } else {
                resolve({ ok: false, data: "", error: `HTTP ${xhr.status}` });
              }
            }
          };

          xhr.onerror = () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              console.log("[MiMo XHR] Error");
              resolve({ ok: false, data: "", error: "XHR error" });
            }
          };

          xhr.send(JSON.stringify(body));
        });
      },
      { message: params.message, modelInternal, convId, msgId },
    );

    console.log(`[XiaomiMimo] Result: ok=${result.ok}, len=${result.data?.length || 0}`);
    console.log(`[XiaomiMimo] Response: ${result.data?.substring(0, 300)}`);

    // 保存 conversationId 以便后续复用
    if (result.convId) {
      this.conversationId = result.convId;
      console.log(`[XiaomiMimo] Saved conversationId: ${result.convId}`);
    }

    if (!result.ok && !result.data) {
      throw new Error(`XiaomiMimo API error: ${result.error || "No response"}`);
    }

    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        if (result.data) {
          controller.enqueue(encoder.encode(result.data));
        }
        controller.close();
      },
    });
  }

  async close() {
    if (this.running) {
      await stopOpenClawChrome(this.running);
      this.running = null;
    }
    this.browser = null;
    this.page = null;
  }

  async discoverModels(): Promise<ModelDefinitionConfig[]> {
    return [
      { id: "xiaomimo-chat", name: "MiMo Chat", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096 },
      { id: "mimo-v2-pro", name: "MiMo V2 Pro", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
    ];
  }
}
