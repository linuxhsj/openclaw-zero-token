import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import { getChromeWebSocketUrl, launchOpenClawChrome } from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";

export interface ManusWebClientOptions {
  cookie: string;
  userAgent: string;
  headless?: boolean;
}

export class ManusWebClientBrowser {
  private options: ManusWebClientOptions;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private initialized = false;

  constructor(options: ManusWebClientOptions) {
    this.options = options;
  }

  private parseCookies(): Array<{ name: string; value: string; domain: string; path: string }> {
    return this.options.cookie
      .split(";")
      .filter((c) => c.trim().includes("="))
      .map((cookie) => {
        const [name, ...valueParts] = cookie.trim().split("=");
        return {
          name: name?.trim() ?? "",
          value: valueParts.join("=").trim(),
          domain: ".manus.im",
          path: "/",
        };
      })
      .filter((c) => c.name.length > 0);
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const rootConfig = loadConfig();
    const browserConfig = resolveBrowserConfig(rootConfig.browser, rootConfig);
    const profile = resolveProfile(browserConfig, browserConfig.defaultProfile);
    if (!profile) {
      throw new Error(`Could not resolve browser profile '${browserConfig.defaultProfile}'`);
    }

    let wsUrl: string | null = null;

    if (browserConfig.attachOnly) {
      console.log(`[Manus Web Browser] Connecting to existing Chrome at ${profile.cdpUrl}`);
      for (let i = 0; i < 10; i++) {
        wsUrl = await getChromeWebSocketUrl(profile.cdpUrl, 2000);
        if (wsUrl) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!wsUrl) {
        throw new Error(
          `Failed to connect to Chrome at ${profile.cdpUrl}. ` +
            `Make sure Chrome is running in debug mode (./start-chrome-debug.sh)`,
        );
      }
    } else {
      const running = await launchOpenClawChrome(browserConfig, profile);
      const cdpUrl = `http://127.0.0.1:${running.cdpPort}`;
      for (let i = 0; i < 10; i++) {
        wsUrl = await getChromeWebSocketUrl(cdpUrl, 2000);
        if (wsUrl) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!wsUrl) {
        throw new Error(`Failed to resolve Chrome WebSocket URL from ${cdpUrl}`);
      }
    }

    const connectedBrowser = await chromium.connectOverCDP(wsUrl, {
      headers: getHeadersWithAuth(wsUrl),
    });
    this.browser = connectedBrowser;
    this.context = connectedBrowser.contexts()[0];

    const pages = this.context.pages();
    const manusPage = pages.find((p) => p.url().includes("manus.im"));
    if (manusPage) {
      console.log(`[Manus Web Browser] Found existing Manus page`);
      this.page = manusPage;
    } else {
      this.page = await this.context.newPage();
      await this.page.goto("https://manus.im/app", { waitUntil: "domcontentloaded" });
    }

    const cookies = this.parseCookies();
    if (cookies.length > 0) {
      try {
        await this.context.addCookies(cookies);
      } catch (e) {
        console.warn("[Manus Web Browser] Failed to add some cookies:", e);
      }
    }

    this.initialized = true;
  }

  async chatCompletions(params: {
    conversationId?: string;
    message: string;
    model: string;
    signal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array>> {
    if (!this.page) {
      throw new Error("ManusWebClientBrowser not initialized");
    }

    const { conversationId, message, model } = params;

    const streamResponse = await this.page.evaluate(
      async ({ conversationId, message, model }) => {
        const response = await fetch("https://manus.im/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            conversation_id: conversationId || undefined,
            message,
            model,
          }),
        });

        if (!response.ok) {
          throw new Error(`Manus API error: ${response.status} ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const chunks: number[][] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(Array.from(value));
        }

        return chunks;
      },
      { conversationId, message, model },
    );

    let index = 0;
    return new ReadableStream({
      pull(controller) {
        if (index < streamResponse.length) {
          controller.enqueue(new Uint8Array(streamResponse[index]));
          index++;
        } else {
          controller.close();
        }
      },
    });
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.initialized = false;
  }
}
