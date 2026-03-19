import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import { getChromeWebSocketUrl, launchOpenClawChrome } from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";

export interface GrokWebClientOptions {
  cookie: string;
  userAgent: string;
  headless?: boolean;
}

export class GrokWebClientBrowser {
  private options: GrokWebClientOptions;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private initialized = false;
  lastConversationId: string | undefined;
  lastResponseId: string | undefined;

  constructor(options: GrokWebClientOptions) {
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
          domain: ".grok.com",
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
      console.log(`[Grok Web Browser] Connecting to existing Chrome at ${profile.cdpUrl}`);
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
    const grokPage = pages.find((p) => p.url().includes("grok.com"));
    if (grokPage) {
      console.log(`[Grok Web Browser] Found existing Grok page`);
      this.page = grokPage;
    } else {
      this.page = await this.context.newPage();
      await this.page.goto("https://grok.com", { waitUntil: "domcontentloaded" });
    }

    const cookies = this.parseCookies();
    if (cookies.length > 0) {
      try {
        await this.context.addCookies(cookies);
      } catch (e) {
        console.warn("[Grok Web Browser] Failed to add some cookies:", e);
      }
    }

    this.initialized = true;
  }

  /**
   * DOM 模拟：通过真实浏览器交互发送消息，绕过 403 anti-bot
   * 参考 ChatGPT Web 的 chatCompletionsViaDOM 实现
   */
  private async chatCompletionsViaDOM(params: {
    message: string;
    signal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array>> {
    if (!this.page) throw new Error("GrokWebClientBrowser not initialized");

    const sent = await this.page.evaluate((msg: string) => {
      const inputSelectors = [
        '[contenteditable="true"]',
        "textarea[placeholder]",
        "textarea",
        'div[role="textbox"]',
        'div[contenteditable="true"]',
      ];
      let inputEl: HTMLElement | null = null;
      for (const sel of inputSelectors) {
        inputEl = document.querySelector(sel);
        if (inputEl && inputEl.offsetParent !== null) break;
      }
      if (!inputEl) return { ok: false, error: "找不到输入框" };

      inputEl.focus();
      if (inputEl.tagName === "TEXTAREA" || (inputEl as HTMLInputElement).tagName === "INPUT") {
        (inputEl as HTMLTextAreaElement).value = msg;
        (inputEl as HTMLTextAreaElement).dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        (inputEl as HTMLElement).innerText = msg;
        (inputEl as HTMLElement).dispatchEvent(new Event("input", { bubbles: true }));
        (inputEl as HTMLElement).dispatchEvent(new Event("change", { bubbles: true }));
      }

      const sendSelectors = [
        'button[aria-label*="Send"]',
        'button[aria-label*="send"]',
        'button[type="submit"]',
        'button[data-testid*="send"]',
        "form button[type=submit]",
        "button:has(svg)",
        ".send-button",
        "[class*='send']",
      ];
      let sendBtn: HTMLElement | null = null;
      for (const sel of sendSelectors) {
        sendBtn = document.querySelector(sel);
        if (sendBtn && !(sendBtn as HTMLButtonElement).disabled) break;
      }
      if (sendBtn) {
        (sendBtn as HTMLElement).click();
        return { ok: true };
      }
      const textarea = inputEl.closest("form")?.querySelector("button[type=submit]");
      if (textarea) {
        (textarea as HTMLElement).click();
        return { ok: true };
      }
      const keyEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
      });
      inputEl.dispatchEvent(keyEvent);
      return { ok: true };
    }, params.message);

    if (!sent.ok) {
      throw new Error(`Grok DOM 模拟失败: ${sent.error}`);
    }

    console.log("[Grok Web Browser] DOM 模拟已发送，轮询等待回复...");

    const maxWaitMs = 90000;
    const pollIntervalMs = 2000;
    let lastText = "";
    let stableCount = 0;
    const signal = params.signal;

    for (let elapsed = 0; elapsed < maxWaitMs; elapsed += pollIntervalMs) {
      if (signal?.aborted) throw new Error("Grok 请求已取消");

      await new Promise((r) => setTimeout(r, pollIntervalMs));

      const result = await this.page.evaluate(() => {
        const clean = (t: string) => t.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
        const selectors = [
          '[data-role="assistant"]',
          '[class*="assistant"]',
          '[class*="response"]',
          '[class*="message"]',
          "article",
          "[class*='markdown']",
          ".prose",
        ];
        let text = "";
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          const last = els.length > 0 ? els[els.length - 1] : null;
          if (last) {
            const t = clean((last as HTMLElement).textContent ?? "");
            if (t.length > 10) {
              text = t;
              break;
            }
          }
        }
        if (!text) {
          const all = document.querySelectorAll("p, div[class]");
          for (let i = all.length - 1; i >= 0; i--) {
            const el = all[i];
            const t = clean((el as HTMLElement).textContent ?? "");
            if (t.length > 20 && !t.includes("Ask Grok")) {
              text = t;
              break;
            }
          }
        }
        const stopBtn = document.querySelector('[aria-label*="Stop"], [aria-label*="stop"]');
        const isStreaming = !!stopBtn;
        return { text, isStreaming };
      });

      console.log(
        `[Grok Browser] Poll ${elapsed}: textLen=${result.text?.length || 0}, isStreaming=${result.isStreaming}, stableCount=${stableCount}`,
      );

      if (result.text && result.text !== lastText) {
        lastText = result.text;
        stableCount = 0;
        console.log(`[Grok Browser] New text detected, length: ${result.text.length}`);
      } else if (result.text) {
        stableCount++;
        console.log(`[Grok Browser] Text stable, count: ${stableCount}`);
        if (!result.isStreaming && stableCount >= 2) {
          console.log(`[Grok Browser] Breaking - not streaming and stable`);
          break;
        }
      } else {
        console.log(`[Grok Browser] No text detected`);
      }
    }

    if (!lastText) {
      throw new Error(
        "Grok DOM 模拟：未检测到回复。请确保 grok.com 页面已打开、已登录，且输入框可见。",
      );
    }

    const ndjsonLine = JSON.stringify({ contentDelta: lastText }) + "\n";
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(ndjsonLine));
        controller.close();
      },
    });
  }

  async chatCompletions(params: {
    conversationId?: string;
    parentResponseId?: string;
    message: string;
    model: string;
    signal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array>> {
    if (!this.page) {
      throw new Error("GrokWebClientBrowser not initialized");
    }

    const { conversationId, parentResponseId, message, model } = params;
    console.log(
      `[Grok Web Browser] Sending request... conversationId=${conversationId ?? "(将从页面或 API 获取)"} messageLen=${message.length}`,
    );

    const evalPromise = this.page.evaluate(
      async ({
        conversationId,
        parentResponseId,
        message,
        model,
      }: {
        conversationId?: string;
        parentResponseId?: string;
        message: string;
        model: string;
      }) => {
        let convId = conversationId;
        let parentId = parentResponseId;

        if (!convId) {
          const m = window.location.pathname.match(/\/c\/([a-f0-9-]{36})/);
          convId = m?.[1] ?? undefined;
        }
        if (!convId) {
          const urls = [
            "https://grok.com/rest/app-chat/conversations?limit=1",
            "https://grok.com/rest/app-chat/conversations",
          ];
          for (const url of urls) {
            const listRes = await fetch(url, { credentials: "include" });
            if (listRes.ok) {
              const list = await listRes.json();
              convId = list?.conversations?.[0]?.conversationId ?? null;
              if (convId) break;
            }
          }
        }

        // 如果没有现有对话，创建一个新对话
        if (!convId) {
          console.log("[Grok] 没有现有对话，创建新对话...");
          const createRes = await fetch("https://grok.com/rest/app-chat/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({}),
          });
          if (createRes.ok) {
            const createData = await createRes.json();
            convId = createData?.conversationId ?? createData?.id ?? null;
            if (convId) {
              console.log(`[Grok] 新对话创建成功: ${convId}`);
            }
          }
        }

        if (!convId) {
          throw new Error(
            `需要 conversationId。当前页面: ${window.location.href}。请先在 grok.com 中打开或新建一个对话（点击 New chat），再重试。`,
          );
        }

        const body: Record<string, unknown> = {
          message,
          parentResponseId:
            parentId ?? globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2),
          disableSearch: false,
          enableImageGeneration: true,
          imageAttachments: [],
          returnImageBytes: false,
          returnRawGrokInXaiRequest: false,
          fileAttachments: [],
          enableImageStreaming: true,
          imageGenerationCount: 2,
          forceConcise: false,
          toolOverrides: {},
          enableSideBySide: true,
          sendFinalMetadata: true,
          isReasoning: false,
          metadata: { request_metadata: { mode: "auto" } },
          disableTextFollowUps: false,
          disableArtifact: false,
          isFromGrokFiles: false,
          disableMemory: false,
          forceSideBySide: false,
          modelMode: "MODEL_MODE_AUTO",
          isAsyncChat: false,
          skipCancelCurrentInflightRequests: false,
          isRegenRequest: false,
          disableSelfHarmShortCircuit: false,
          deviceEnvInfo: {
            darkModeEnabled: false,
            devicePixelRatio: 1,
            screenWidth: 2560,
            screenHeight: 1440,
            viewportWidth: 1440,
            viewportHeight: 719,
          },
        };

        const response = await fetch(
          `https://grok.com/rest/app-chat/conversations/${convId}/responses`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
          },
        );

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(
            `Grok API error: ${response.status} ${response.statusText} - ${errText.slice(0, 300)}`,
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const chunks: number[][] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(Array.from(value));
        }

        return { chunks, conversationId: convId };
      },
      { conversationId, parentResponseId, message, model },
    );

    const timeoutMs = 120000;
    const result = await Promise.race([
      evalPromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Grok 请求超时（${timeoutMs / 1000}秒）。请确保 grok.com 已登录且页面可访问。`,
              ),
            ),
          timeoutMs,
        ),
      ),
    ]).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("403") || msg.includes("anti-bot")) {
        console.log(
          "[Grok Web Browser] 403 anti-bot 触发，切换到 DOM 模拟（由真实浏览器交互发起，不易触发风控）",
        );
        return this.chatCompletionsViaDOM({
          message: params.message,
          signal: params.signal,
        });
      }
      console.error(`[Grok Web Browser] evaluate error:`, msg);
      throw err;
    });

    if (result instanceof ReadableStream) return result;

    const apiResult = result as { chunks: number[][]; conversationId?: string };
    this.lastConversationId = apiResult.conversationId ?? undefined;

    const fullBytes = apiResult.chunks.flatMap((c) => c);
    const fullText = new TextDecoder().decode(new Uint8Array(fullBytes));
    console.log(`[Grok Web Browser] Response length: ${fullBytes.length} bytes`);
    console.log(
      `[Grok Web Browser] NDJSON sample:\n${fullText.slice(0, 1200)}${fullText.length > 1200 ? "\n...(truncated)" : ""}`,
    );

    // Parse NDJSON lines and extract content
    const lines = fullText.split("\n").filter((line) => line.trim());
    const parsedChunks: string[] = [];
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        const content =
          data.contentDelta ?? data.textDelta ?? data.content ?? data.text ?? data.delta;
        if (content) {
          parsedChunks.push(content);
        }
      } catch {
        // Skip unparseable lines
      }
    }

    let index = 0;
    return new ReadableStream({
      pull(controller) {
        if (index < parsedChunks.length) {
          const line = JSON.stringify({ contentDelta: parsedChunks[index] }) + "\n";
          controller.enqueue(new TextEncoder().encode(line));
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
