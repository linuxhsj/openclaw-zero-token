import crypto from "node:crypto";
import { chromium } from "playwright-core";
import type { BrowserContext, Page } from "playwright-core";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import {
  launchOpenClawChrome,
  stopOpenClawChrome,
  getChromeWebSocketUrl,
  type RunningChrome,
} from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";
import type { ModelDefinitionConfig } from "../config/types.models.js";

export interface QwenCNWebClientOptions {
  cookie: string;
  xsrfToken: string;
  userAgent?: string;
  deviceId?: string;
  ut?: string;
}

/**
 * Qwen CN Web Client (qianwen.com 国内版) using Playwright browser context
 */
export class QwenCNWebClientBrowser {
  private cookie: string;
  private xsrfToken: string;
  private userAgent: string;
  private deviceId: string;
  private ut: string;
  private baseUrl = "https://chat2.qianwen.com";
  private browser: BrowserContext | null = null;
  private page: Page | null = null;
  private running: RunningChrome | null = null;

  constructor(options: QwenCNWebClientOptions | string) {
    let finalOptions: QwenCNWebClientOptions;
    if (typeof options === "string") {
      try {
        finalOptions = JSON.parse(options);
      } catch {
        finalOptions = { cookie: options, xsrfToken: "" };
      }
    } else {
      finalOptions = options;
    }

    this.cookie = finalOptions.cookie || "";
    this.xsrfToken = finalOptions.xsrfToken || "";
    this.userAgent =
      finalOptions.userAgent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    this.ut = finalOptions.ut || "";

    if (!this.ut && this.cookie) {
      const match = this.cookie.match(/(?:^|;\\s*)b-user-id=([^;]+)/i);
      if (match) {
        this.ut = match[1];
      }
    }
    this.deviceId =
      finalOptions.deviceId || this.ut || "random-" + Math.random().toString(36).slice(2);
  }

  private async ensureBrowser() {
    if (this.browser && this.page) {
      return { browser: this.browser, page: this.page };
    }

    const rootConfig = loadConfig();
    const browserConfig = resolveBrowserConfig(rootConfig.browser, rootConfig);
    const profile = resolveProfile(browserConfig, browserConfig.defaultProfile);
    if (!profile) {
      throw new Error(`Could not resolve browser profile '${browserConfig.defaultProfile}'`);
    }

    if (browserConfig.attachOnly) {
      console.log(`[Qwen CN Web Browser] Connecting to existing Chrome at ${profile.cdpUrl}`);

      let wsUrl: string | null = null;
      for (let i = 0; i < 10; i++) {
        wsUrl = await getChromeWebSocketUrl(profile.cdpUrl, 2000);
        if (wsUrl) {
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (!wsUrl) {
        throw new Error(
          `Failed to connect to Chrome at ${profile.cdpUrl}. ` +
            `Make sure Chrome is running in debug mode`,
        );
      }

      this.browser = await chromium
        .connectOverCDP(wsUrl, {
          headers: getHeadersWithAuth(wsUrl),
        })
        .then((b) => b.contexts()[0]);

      const pages = this.browser.pages();
      let qwenPage = pages.find((p) => p.url().includes("qianwen.com"));

      if (qwenPage) {
        console.log(`[Qwen CN Web Browser] Found existing Qwen CN page`);
        this.page = qwenPage;
      } else {
        console.log(`[Qwen CN Web Browser] Creating new page`);
        this.page = await this.browser.newPage();
        await this.page.goto("https://www.qianwen.com/", { waitUntil: "domcontentloaded" });
      }

      console.log(`[Qwen CN Web Browser] Connected successfully`);
    } else {
      this.running = await launchOpenClawChrome(browserConfig, profile);

      const cdpUrl = `http://127.0.0.1:${this.running.cdpPort}`;
      let wsUrl: string | null = null;

      for (let i = 0; i < 10; i++) {
        wsUrl = await getChromeWebSocketUrl(cdpUrl, 2000);
        if (wsUrl) {
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (!wsUrl) {
        throw new Error(`Failed to resolve Chrome WebSocket URL from ${cdpUrl}`);
      }

      this.browser = await chromium
        .connectOverCDP(wsUrl, {
          headers: getHeadersWithAuth(wsUrl),
        })
        .then((b) => b.contexts()[0]);

      this.page = this.browser.pages()[0] || (await this.browser.newPage());
    }

    const cookies = this.cookie
      .split(";")
      .filter((c) => c.trim().includes("="))
      .map((c) => {
        const [name, ...valueParts] = c.trim().split("=");
        return {
          name: name?.trim() ?? "",
          value: valueParts.join("=").trim(),
          domain: ".qianwen.com",
          path: "/",
        };
      })
      .filter((c) => c.name.length > 0);

    if (cookies.length > 0) {
      try {
        await this.browser.addCookies(cookies);
      } catch (err) {
        console.warn(
          `[Qwen CN Web Browser] addCookies failed (page may already have session): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { browser: this.browser, page: this.page };
  }

  async init() {
    await this.ensureBrowser();
  }

  async chatCompletions(params: {
    sessionId?: string;
    message: string;
    model?: string;
    parentMessageId?: string;
    signal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array>> {
    const { page } = await this.ensureBrowser();

    const model = params.model || "Qwen3.5-Plus";
    const sessionId =
      params.sessionId ||
      Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

    console.log(`[Qwen CN Web Browser] Sending message`);
    console.log(`[Qwen CN Web Browser] Model: ${model}`);
    console.log(`[Qwen CN Web Browser] Session ID: ${sessionId}`);

    const timestamp = Date.now();
    const nonce = Math.random().toString(36).slice(2);

    const responseData = await page.evaluate(
      async ({
        baseUrl,
        sessionId,
        model,
        message,
        parentMessageId,
        ut,
        xsrfToken,
        deviceId,
        nonce,
        timestamp,
      }) => {
        try {
          const url = `${baseUrl}/api/v2/chat?biz_id=ai_qwen&chat_client=h5&device=pc&fr=pc&pr=qwen&nonce=${nonce}&timestamp=${timestamp}&ut=${ut}`;

          const bodyObj: Record<string, unknown> = {
            model: model,
            messages: [
              {
                content: message,
                mime_type: "text/plain",
                meta_data: {
                  ori_query: message,
                },
              },
            ],
            session_id: sessionId,
            parent_req_id: parentMessageId || "0",
            deep_search: "0",
            req_id: "req-" + Math.random().toString(36).slice(2),
            scene: "chat",
            sub_scene: "chat",
            temporary: false,
            from: "default",
            scene_param: parentMessageId ? "continue_chat" : "first_turn",
            chat_client: "h5",
            client_tm: timestamp.toString(),
            protocol_version: "v2",
            biz_id: "ai_qwen",
          };

          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream, text/plain, */*",
              "x-xsrf-token": xsrfToken,
              "x-deviceid": deviceId,
              "x-platform": "pc_tongyi",
            },
            body: JSON.stringify(bodyObj),
          });

          if (!res.ok) {
            const errorText = await res.text();
            return { ok: false, status: res.status, error: errorText };
          }

          const reader = res.body?.getReader();
          if (!reader) {
            return { ok: false, status: 500, error: "No response body" };
          }

          const decoder = new TextDecoder();
          let fullText = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;
          }

          return { ok: true, data: fullText };
        } catch (err) {
          return { ok: false, status: 500, error: String(err) };
        }
      },
      {
        baseUrl: this.baseUrl,
        sessionId,
        model,
        message: params.message,
        parentMessageId: params.parentMessageId,
        ut: this.ut,
        xsrfToken: this.xsrfToken,
        deviceId: this.deviceId,
        nonce,
        timestamp,
      },
    );
    console.log(
      `[Qwen CN Web Browser] Response data: ok=${responseData?.ok}, status=${responseData?.status}, data length=${responseData?.data?.length}`,
    );
    if (responseData?.data && responseData.data.length > 0) {
      console.log(
        `[Qwen CN Web Browser] Response preview: ${responseData.data.substring(0, 200)}...`,
      );
    }
    if (!responseData || !responseData.ok) {
      throw new Error(
        `Qwen CN API error: ${responseData?.status || "unknown"} - ${responseData?.error || "Request failed"}`,
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(responseData.data));
        controller.close();
      },
    });

    return stream;
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
      {
        id: "Qwen3.5-Plus",
        name: "Qwen 3.5 Plus (国内版)",
        provider: "qwen-cn-web",
        api: "qwen-cn-web",
        contextWindow: 128000,
        maxOutputTokens: 4096,
      },
      {
        id: "Qwen3.5-Turbo",
        name: "Qwen 3.5 Turbo (国内版)",
        provider: "qwen-cn-web",
        api: "qwen-cn-web",
        contextWindow: 32768,
        maxOutputTokens: 4096,
      },
    ];
  }
}
