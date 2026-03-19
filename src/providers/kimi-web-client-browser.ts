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

export interface KimiWebClientOptions {
  cookie: string;
  userAgent?: string;
}

/**
 * Kimi Web Client using CDP attach
 * 使用 Connect RPC 纯 API（/apiv2/kimi.gateway.chat.v1.ChatService/Chat），kimi-auth 从 Cookie 提取
 */
export class KimiWebClientBrowser {
  private cookie: string;
  private userAgent: string;
  private baseUrl = "https://www.kimi.com";
  private browser: BrowserContext | null = null;
  private page: Page | null = null;
  private running: RunningChrome | null = null;

  constructor(options: KimiWebClientOptions | string) {
    if (typeof options === "string") {
      try {
        const parsed = JSON.parse(options) as KimiWebClientOptions;
        this.cookie = parsed.cookie;
        this.userAgent = parsed.userAgent || "Mozilla/5.0";
      } catch {
        this.cookie = options;
        this.userAgent = "Mozilla/5.0";
      }
    } else {
      this.cookie = options.cookie;
      this.userAgent = options.userAgent || "Mozilla/5.0";
    }
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
      let wsUrl: string | null = null;
      for (let i = 0; i < 10; i++) {
        wsUrl = await getChromeWebSocketUrl(profile.cdpUrl, 2000);
        if (wsUrl) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!wsUrl) {
        throw new Error(
          `Failed to connect to Chrome at ${profile.cdpUrl}. Make sure Chrome is running in debug mode (./start-chrome-debug.sh)`,
        );
      }

      this.browser = (
        await chromium.connectOverCDP(wsUrl, { headers: getHeadersWithAuth(wsUrl) })
      ).contexts()[0]!;

      const pages = this.browser!.pages();
      let kimiPage = pages.find(
        (p) => p.url().includes("kimi.com") || p.url().includes("moonshot.cn"),
      );
      if (kimiPage) {
        this.page = kimiPage;
      } else {
        this.page = await this.browser!.newPage();
        await this.page.goto(`${this.baseUrl}/`, { waitUntil: "domcontentloaded" });
      }
    } else {
      this.running = await launchOpenClawChrome(browserConfig, profile);
      const cdpUrl = `http://127.0.0.1:${this.running.cdpPort}`;
      let wsUrl: string | null = null;
      for (let i = 0; i < 10; i++) {
        wsUrl = await getChromeWebSocketUrl(cdpUrl, 2000);
        if (wsUrl) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!wsUrl) throw new Error(`Failed to resolve Chrome WebSocket URL from ${cdpUrl}`);

      this.browser = (
        await chromium.connectOverCDP(wsUrl, { headers: getHeadersWithAuth(wsUrl) })
      ).contexts()[0]!;
      this.page = this.browser!.pages()[0] || (await this.browser!.newPage());
    }

    if (this.cookie.trim()) {
      const pageUrl = this.page?.url() ?? this.baseUrl;
      const domain = pageUrl.includes("moonshot.cn") ? ".moonshot.cn" : ".kimi.com";

      const rawCookies = this.cookie.split(";").map((c) => {
        const [name, ...valueParts] = c.trim().split("=");
        const nameStr = name?.trim() ?? "";
        const valueStr = valueParts.join("=").trim();
        if (!nameStr) return null;
        const cookie: {
          name: string;
          value: string;
          domain: string;
          path: string;
          secure?: boolean;
        } = {
          name: nameStr,
          value: valueStr,
          domain,
          path: "/",
        };
        if (nameStr.startsWith("__Secure-") || nameStr.startsWith("__Host-")) {
          cookie.secure = true;
        }
        return cookie;
      });
      const cookies = rawCookies.filter((c): c is NonNullable<typeof c> => c !== null);
      if (cookies.length > 0) {
        try {
          await this.browser!.addCookies(cookies);
        } catch (err) {
          console.warn(
            `[Kimi Web] addCookies failed (page may already have session): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
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
    const { browser, page } = await this.ensureBrowser();

    const cookies = await browser.cookies([this.baseUrl]);
    const kimiAuth = cookies.find((c) => c.name === "kimi-auth")?.value;
    if (!kimiAuth) {
      throw new Error("Kimi: 未找到 kimi-auth Cookie，请在 Chrome 中登录 www.kimi.com 后再试");
    }

    const result = await page.evaluate(
      async ({
        baseUrl,
        message,
        kimiAuthToken,
        scenario,
      }: {
        baseUrl: string;
        message: string;
        kimiAuthToken: string;
        scenario: string;
      }) => {
        const req = {
          scenario,
          message: {
            role: "user" as const,
            blocks: [{ message_id: "", text: { content: message } }],
            scenario,
          },
          options: { thinking: false },
        };
        const enc = new TextEncoder().encode(JSON.stringify(req));
        const buf = new ArrayBuffer(5 + enc.byteLength);
        const dv = new DataView(buf);
        dv.setUint8(0, 0x00);
        dv.setUint32(1, enc.byteLength, false);
        new Uint8Array(buf, 5).set(enc);

        const res = await fetch(`${baseUrl}/apiv2/kimi.gateway.chat.v1.ChatService/Chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/connect+json",
            "Connect-Protocol-Version": "1",
            Accept: "*/*",
            Origin: baseUrl,
            Referer: `${baseUrl}/`,
            "X-Language": "zh-CN",
            "X-Msh-Platform": "web",
            Authorization: `Bearer ${kimiAuthToken}`,
          },
          body: buf,
        });

        if (!res.ok) {
          const text = await res.text();
          return { ok: false as const, error: text.slice(0, 400) };
        }
        const arr = await res.arrayBuffer();
        const u8 = new Uint8Array(arr);
        const texts: string[] = [];
        let o = 0;
        while (o + 5 <= u8.length) {
          const len = new DataView(u8.buffer, u8.byteOffset + o + 1, 4).getUint32(0, false);
          if (o + 5 + len > u8.length) break;
          const chunk = u8.slice(o + 5, o + 5 + len);
          try {
            const obj = JSON.parse(new TextDecoder().decode(chunk));
            if (obj.error) {
              return {
                ok: false as const,
                error:
                  obj.error.message || obj.error.code || JSON.stringify(obj.error).slice(0, 200),
              };
            }
            if (obj.block?.text?.content && ["set", "append"].includes(obj.op || "")) {
              texts.push(obj.block.text.content);
            }
            if (obj.done) break;
          } catch {
            // ignore parse errors for non-JSON chunks
          }
          o += 5 + len;
        }
        return { ok: true as const, text: texts.join("") };
      },
      {
        baseUrl: this.baseUrl,
        message: params.message,
        kimiAuthToken: kimiAuth,
        scenario: params.model.includes("search")
          ? "SCENARIO_SEARCH"
          : params.model.includes("research")
            ? "SCENARIO_RESEARCH"
            : params.model.includes("k1")
              ? "SCENARIO_K1"
              : "SCENARIO_K2",
      },
    );

    if (!result.ok) {
      throw new Error(`Kimi API 错误: ${result.error}`);
    }

    const escaped = JSON.stringify(result.text);
    const sse = `data: {"text":${escaped}}\n\ndata: [DONE]\n\n`;
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sse));
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
      {
        id: "moonshot-v1-32k",
        name: "Moonshot v1 32K",
        api: "kimi-web",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32000,
        maxTokens: 4096,
      },
    ] as ModelDefinitionConfig[];
  }
}
