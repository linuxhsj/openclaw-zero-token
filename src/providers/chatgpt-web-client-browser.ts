import { randomUUID } from "node:crypto";
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

export interface ChatGPTWebClientOptions {
  accessToken: string;
  cookie?: string;
  userAgent?: string;
}

export interface ChatGPTConversation {
  id: string;
  title: string;
  created_at?: number;
}

/**
 * ChatGPT Web Client using Playwright browser context
 */
export class ChatGPTWebClientBrowser {
  private accessToken: string;
  private cookie: string;
  private userAgent: string;
  private baseUrl = "https://chatgpt.com";
  private browser: BrowserContext | null = null;
  private page: Page | null = null;
  private running: RunningChrome | null = null;

  constructor(options: ChatGPTWebClientOptions | string) {
    if (typeof options === "string") {
      const parsed = JSON.parse(options) as ChatGPTWebClientOptions;
      this.accessToken = parsed.accessToken;
      this.cookie = parsed.cookie || `__Secure-next-auth.session-token=${parsed.accessToken}`;
      this.userAgent = parsed.userAgent || "Mozilla/5.0";
    } else {
      this.accessToken = options.accessToken;
      this.cookie = options.cookie || `__Secure-next-auth.session-token=${options.accessToken}`;
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
      console.log(`[ChatGPT Web Browser] Connecting to existing Chrome at ${profile.cdpUrl}`);

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

      this.browser = (
        await chromium.connectOverCDP(wsUrl, {
          headers: getHeadersWithAuth(wsUrl),
        })
      ).contexts()[0]!;

      const pages = this.browser!.pages();
      const chatgptPage = pages.find((p) => p.url().includes("chatgpt.com"));

      if (chatgptPage) {
        console.log(`[ChatGPT Web Browser] Found existing ChatGPT page: ${chatgptPage.url()}`);
        this.page = chatgptPage;
      } else {
        console.log(`[ChatGPT Web Browser] No ChatGPT page found, creating new one...`);
        this.page = await this.browser.newPage();
        await this.page.goto("https://chatgpt.com/", { waitUntil: "load" });
      }

      await this.ensureChatGptPageReady();
      console.log(`[ChatGPT Web Browser] Connected to existing Chrome successfully`);
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

      this.browser = (
        await chromium.connectOverCDP(wsUrl, {
          headers: getHeadersWithAuth(wsUrl),
        })
      ).contexts()[0]!;

      this.page = this.browser!.pages()[0] || (await this.browser!.newPage());
      if (!this.page.url().includes("chatgpt.com")) {
        await this.page.goto("https://chatgpt.com/", { waitUntil: "load" });
      }
      await this.ensureChatGptPageReady();
    }

    const cookieStr = typeof this.cookie === "string" ? this.cookie.trim() : "";
    if (cookieStr && !cookieStr.startsWith("{")) {
      const rawCookies = cookieStr.split(";").map((c) => {
        const [name, ...valueParts] = c.trim().split("=");
        return {
          name: name?.trim() ?? "",
          value: valueParts.join("=").trim(),
          domain: ".chatgpt.com",
          path: "/",
        };
      });
      const cookies = rawCookies.filter((c) => c.name.length > 0);
      if (cookies.length > 0) {
        try {
          await this.browser!.addCookies(cookies);
        } catch (err) {
          console.warn(
            `[ChatGPT Web Browser] addCookies failed (page may already have session): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    return { browser: this.browser, page: this.page };
  }

  /** 确保 chatgpt.com 页面已加载且 oaistatic Sentinel 脚本已就绪 */
  private async ensureChatGptPageReady() {
    if (!this.page) return;
    if (!this.page.url().includes("chatgpt.com")) {
      await this.page.goto("https://chatgpt.com/", { waitUntil: "load" });
    }
    try {
      await this.page.waitForFunction(
        () => {
          const scripts = Array.from(document.scripts);
          return scripts.some((s) => s.src?.includes("oaistatic.com") && s.src?.endsWith(".js"));
        },
        { timeout: 15000 },
      );
    } catch {
      console.warn("[ChatGPT Web Browser] oaistatic script not found in 15s, continuing anyway");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  /**
   * DOM 模拟：通过真实浏览器交互发送消息，绕过 403 风控
   * 参考：zsodur/chatgpt-api-by-browser-script 等 DOM 模拟实现
   */
  private async chatCompletionsViaDOM(params: {
    message: string;
    signal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array>> {
    const { page } = await this.ensureBrowser();

    const sent = await page.evaluate((msg: string) => {
      // 多备选选择器适配 ChatGPT 不同版本 UI
      const inputSelectors = [
        "#prompt-textarea",
        "textarea[placeholder]",
        "textarea",
        '[contenteditable="true"][data-placeholder]',
        "[contenteditable='true']",
      ];
      let inputEl: HTMLTextAreaElement | HTMLElement | null = null;
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
        (inputEl as HTMLElement).textContent = msg;
        (inputEl as HTMLElement).dispatchEvent(new Event("input", { bubbles: true }));
      }

      const sendSelectors = [
        "#composer-submit-button",
        'button[data-testid="send-button"]',
        "button.btn.relative.btn-primary",
        "button.mb-1.mr-1.flex.h-8.w-8.items-center.justify-center.rounded-full.bg-black",
        'button[aria-label*="Send"]',
        'button[type="submit"]',
        "form button[type=submit]",
      ];
      let sendBtn: HTMLElement | null = null;
      for (const sel of sendSelectors) {
        sendBtn = document.querySelector(sel);
        if (sendBtn && !(sendBtn as HTMLButtonElement).disabled) break;
      }
      if (!sendBtn) return { ok: false, error: "找不到发送按钮" };
      (sendBtn as HTMLElement).click();
      return { ok: true };
    }, params.message);

    if (!sent.ok) {
      throw new Error(`ChatGPT DOM 模拟失败: ${sent.error}`);
    }

    // 轮询等待回复完成（最多约 90 秒，降低频率减少封号风险）
    const maxWaitMs = 90000;
    const pollIntervalMs = 2000;
    let lastText = "";
    let stableCount = 0;
    const signal = params.signal;

    for (let elapsed = 0; elapsed < maxWaitMs; elapsed += pollIntervalMs) {
      if (signal?.aborted) throw new Error("ChatGPT 请求已取消");

      await new Promise((r) => setTimeout(r, pollIntervalMs));

      const result = await page.evaluate(() => {
        const clean = (t: string) => t.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
        const els = document.querySelectorAll(
          'div[data-message-author-role="assistant"], .agent-turn [data-message-author-role="assistant"], [class*="markdown"], [class*="assistant"]',
        );
        const last = els.length > 0 ? els[els.length - 1] : null;
        const text = last ? clean(last.textContent ?? "") : "";
        const stopBtn = document.querySelector('button.bg-black .icon-lg, [aria-label*="Stop"]');
        const isStreaming = !!stopBtn;
        return { text, isStreaming };
      });

      if (result.text && result.text !== lastText) {
        lastText = result.text;
        stableCount = 0;
      } else if (result.text) {
        stableCount++;
        if (!result.isStreaming && stableCount >= 2) {
          break;
        }
      }
    }

    if (!lastText) {
      throw new Error(
        "ChatGPT DOM 模拟：未检测到回复。请确保 chatgpt.com 页面已打开并登录，且输入框可见。",
      );
    }

    const fakeSse = `data: ${JSON.stringify({
      message: { id: "dom-fallback", content: { parts: [lastText] } },
    })}\n\ndata: [DONE]\n\n`;
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(fakeSse));
        controller.close();
      },
    });
  }

  async init() {
    await this.ensureBrowser();
  }

  async chatCompletions(params: {
    conversationId?: string;
    parentMessageId?: string;
    message: string;
    model?: string;
    signal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array>> {
    const { page } = await this.ensureBrowser();

    const conversationId = params.conversationId || randomUUID();
    const parentMessageId = params.parentMessageId || randomUUID();
    const messageId = randomUUID();

    console.log(`[ChatGPT Web Browser] Sending message`);
    console.log(`[ChatGPT Web Browser] Conversation ID: ${conversationId}`);
    console.log(`[ChatGPT Web Browser] Model: ${params.model || "gpt-4"}`);

    const body = {
      action: "next",
      messages: [
        {
          id: messageId,
          author: { role: "user" },
          content: {
            content_type: "text",
            parts: [params.message],
          },
        },
      ],
      parent_message_id: parentMessageId,
      model: params.model || "gpt-4",
      timezone_offset_min: new Date().getTimezoneOffset(),
      conversation_id: conversationId === "new" ? undefined : conversationId,
      history_and_training_disabled: false,
      conversation_mode: { kind: "primary_assistant", plugin_ids: null },
      force_paragen: false,
      force_paragen_model_slug: "",
      force_rate_limit: false,
      reset_rate_limits: false,
      force_use_sse: true,
    };

    const pageUrl = page.url();

    const responseData = await page.evaluate(
      async ({ body, pageUrl }) => {
        const baseHeaders = (accessToken: string | undefined, deviceId: string) => ({
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "oai-device-id": deviceId,
          "oai-language": "en-US",
          Referer: pageUrl || "https://chatgpt.com/",
          "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"macOS"',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        });

        async function warmupSentinel(accessToken: string | undefined, deviceId: string) {
          const h = baseHeaders(accessToken, deviceId);
          await fetch("https://chatgpt.com/backend-api/conversation/init", {
            method: "POST",
            headers: h,
            body: "{}",
            credentials: "include",
          }).catch(() => {});
          await fetch("https://chatgpt.com/backend-api/sentinel/chat-requirements/prepare", {
            method: "POST",
            headers: h,
            body: "{}",
            credentials: "include",
          }).catch(() => {});
          await fetch("https://chatgpt.com/backend-api/sentinel/chat-requirements/finalize", {
            method: "POST",
            headers: h,
            body: "{}",
            credentials: "include",
          }).catch(() => {});
        }

        async function getSession() {
          const r = await fetch("https://chatgpt.com/api/auth/session", { credentials: "include" });
          return r.ok ? r.json() : null;
        }

        async function tryFetchWithSentinel(accessToken: string | undefined, deviceId: string) {
          const scripts = Array.from(document.scripts);
          const assetSrc = scripts
            .map((s) => s.src)
            .find((s) => s?.includes("oaistatic.com") && s.endsWith(".js"));
          const assetUrl = assetSrc || "https://cdn.oaistatic.com/assets/i5bamk05qmvsi6c3.js";

          try {
            const g = await import(/* @vite-ignore */ assetUrl);
            if (typeof g.bk !== "function" || typeof g.fX !== "function") {
              return { error: `Sentinel asset missing bk/fX (asset: ${assetUrl})` };
            }
            const z = await g.bk();
            const turnstileKey = z?.turnstile?.bx ?? z?.turnstile?.dx;
            if (!turnstileKey) return { error: "Sentinel chat-requirements missing turnstile" };
            const r = await g.bi(turnstileKey);
            let arkose: unknown = null;
            try {
              arkose = await g.bl?.getEnforcementToken?.(z);
            } catch {
              // Arkose may fail (captcha), continue with null
            }
            let p: unknown = null;
            try {
              p = await g.bm?.getEnforcementToken?.(z);
            } catch {
              // Proof token may fail, continue with null
            }
            const extraHeaders = await g.fX(z, arkose, r, p, null);

            const headers: Record<string, string> = {
              ...baseHeaders(accessToken, deviceId),
              ...(typeof extraHeaders === "object" ? extraHeaders : {}),
            };

            const res = await fetch("https://chatgpt.com/backend-api/conversation", {
              method: "POST",
              headers,
              body: JSON.stringify(body),
              credentials: "include",
            });
            return { res };
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return { error: `Sentinel token failed: ${msg}` };
          }
        }

        const session = await getSession();
        const accessToken = session?.accessToken;
        const deviceId =
          (session as { oaiDeviceId?: string })?.oaiDeviceId ??
          globalThis.crypto?.randomUUID?.() ??
          Math.random().toString(36).slice(2);

        const sentinelResult = await tryFetchWithSentinel(accessToken, deviceId);
        const res =
          sentinelResult.res ??
          (await fetch("https://chatgpt.com/backend-api/conversation", {
            method: "POST",
            headers: baseHeaders(accessToken, deviceId),
            body: JSON.stringify(body),
            credentials: "include",
          }));

        const sentinelError = "error" in sentinelResult ? sentinelResult.error : undefined;

        if (!res.ok) {
          const errorText = await res.text();
          return { ok: false, status: res.status, error: errorText, sentinelError };
        }

        const reader = res.body?.getReader();
        if (!reader) return { ok: false, status: 500, error: "No response body", sentinelError };

        const decoder = new TextDecoder();
        let fullText = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
        }
        return { ok: true, data: fullText };
      },
      { body, pageUrl },
    );

    if (!responseData.ok) {
      if (responseData.status === 403) {
        console.log(
          "[ChatGPT Web Browser] 403 风控，尝试 DOM 模拟 fallback（请求由真实浏览器发起，不易触发风控）",
        );
        return this.chatCompletionsViaDOM({
          message: params.message,
          signal: params.signal,
        });
      }
      const sentinelHint = responseData.sentinelError
        ? ` Sentinel: ${responseData.sentinelError}`
        : " 若持续 403，需在 chatgpt.com 控制台检查 oaistatic 脚本导出名是否变更。";
      if (responseData.status === 401) {
        throw new Error("ChatGPT 认证失败，请重新运行 ./onboard.sh 刷新 session。");
      }
      throw new Error(
        `ChatGPT API 错误 ${responseData.status}: ${responseData.error?.slice(0, 200) || ""}`,
      );
    }

    console.log(`[ChatGPT Web Browser] Response length: ${responseData.data?.length || 0} bytes`);
    const sample = responseData.data?.slice(0, 1800) ?? "";
    console.log(
      `[ChatGPT Web Browser] SSE sample:\n${sample}${(responseData.data?.length ?? 0) > 1800 ? "\n...(truncated)" : ""}`,
    );

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
        id: "gpt-4",
        name: "GPT-4",
        api: "chatgpt-web",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 8192,
        maxTokens: 4096,
      },
    ] as ModelDefinitionConfig[];
  }
}
