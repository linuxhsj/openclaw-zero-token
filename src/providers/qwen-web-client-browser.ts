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

export interface QwenWebClientOptions {
  sessionToken: string;
  cookie?: string;
  userAgent?: string;
}

/**
 * Qwen Web Client using Playwright browser context
 */
export class QwenWebClientBrowser {
  private sessionToken: string;
  private cookie: string;
  private userAgent: string;
  private baseUrl = "https://chat.qwen.ai";
  private browser: BrowserContext | null = null;
  private page: Page | null = null;
  private running: RunningChrome | null = null;

  constructor(options: QwenWebClientOptions | string) {
    if (typeof options === "string") {
      const parsed = JSON.parse(options) as QwenWebClientOptions;
      this.sessionToken = parsed.sessionToken;
      this.cookie = parsed.cookie || `qwen_session=${parsed.sessionToken}`;
      this.userAgent = parsed.userAgent || "Mozilla/5.0";
    } else {
      this.sessionToken = options.sessionToken;
      this.cookie = options.cookie || `qwen_session=${options.sessionToken}`;
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
      console.log(`[Qwen Web Browser] Connecting to existing Chrome at ${profile.cdpUrl}`);

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
      let qwenPage = pages.find((p) => p.url().includes("qwen.ai"));

      if (qwenPage) {
        console.log(`[Qwen Web Browser] Found existing Qwen page`);
        this.page = qwenPage;
      } else {
        console.log(`[Qwen Web Browser] Creating new page`);
        this.page = await this.browser.newPage();
        await this.page.goto("https://chat.qwen.ai/", { waitUntil: "domcontentloaded" });
      }

      console.log(`[Qwen Web Browser] Connected successfully`);
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
    }

    const cookies = this.cookie.split(";").map((c) => {
      const [name, ...valueParts] = c.trim().split("=");
      return {
        name: name.trim(),
        value: valueParts.join("=").trim(),
        domain: ".qwen.ai",
        path: "/",
      };
    });

    await this.browser!.addCookies(cookies);

    return { browser: this.browser, page: this.page };
  }

  async init() {
    await this.ensureBrowser();
  }

  async chatCompletions(params: {
    conversationId?: string;
    message: string;
    model?: string;
    signal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array>> {
    const { page } = await this.ensureBrowser();

    const model = params.model || "qwen3.5-plus";

    console.log(`[Qwen Web Browser] Sending message`);
    console.log(`[Qwen Web Browser] Model: ${model}`);
    console.log(`[Qwen Web Browser] Message: ${params.message.substring(0, 100)}...`);

    // Step 1: Create a new chat session to get chat_id（30s 超时）
    const createChatTimeoutMs = 30_000;
    const createChatResult = await page.evaluate(
      async ({ baseUrl, timeoutMs }) => {
        let timer: ReturnType<typeof setTimeout> | undefined = undefined;
        try {
          const url = `${baseUrl}/api/v2/chats/new`;
          console.log(`[Browser] Creating chat: ${url}`);

          const controller = new AbortController();
          timer = setTimeout(() => controller.abort(), timeoutMs);

          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
            signal: controller.signal,
          });

          clearTimeout(timer);

          console.log(`[Browser] Create chat response status: ${res.status}`);
          console.log(
            `[Browser] Create chat response headers:`,
            Object.fromEntries(res.headers.entries()),
          );

          if (!res.ok) {
            const errorText = await res.text();
            console.log(`[Browser] Create chat error response: ${errorText.substring(0, 500)}`);
            return { ok: false, status: res.status, error: errorText };
          }

          const data = await res.json();
          const chatId = data.data?.id ?? data.chat_id ?? data.id ?? data.chatId;
          console.log(`[Browser] Chat created, chat ID:`, chatId);
          return { ok: true, chatId, fullData: data };
        } catch (err) {
          if (typeof timer !== "undefined") clearTimeout(timer);
          const msg = String(err);
          if (msg.includes("aborted") || msg.includes("signal")) {
            return { ok: false, status: 408, error: `Create chat timed out after ${timeoutMs}ms` };
          }
          console.error(`[Browser] Create chat exception:`, err);
          return { ok: false, status: 500, error: msg };
        }
      },
      { baseUrl: this.baseUrl, timeoutMs: createChatTimeoutMs },
    );

    console.log(`[Qwen Web Browser] Create chat result:`, JSON.stringify(createChatResult));

    if (!createChatResult.ok || !createChatResult.chatId) {
      console.error(`[Qwen Web Browser] Failed to create chat`);
      console.error(`[Qwen Web Browser] Error: ${createChatResult.error}`);
      console.error(`[Qwen Web Browser] Full result:`, JSON.stringify(createChatResult));
      throw new Error(
        `Failed to create Qwen chat: ${createChatResult.error || "No chat_id in response"}`,
      );
    }

    const chatId = createChatResult.chatId;
    console.log(`[Qwen Web Browser] Chat ID: ${chatId}`);

    // Step 2: Send message using the chat_id（加入 fetch 超时，默认 5 分钟，避免长时间无响应导致 run 级 timeout）
    const fetchTimeoutMs = 300_000;
    const fid = crypto.randomUUID();
    const responseData = await page.evaluate(
      async ({ baseUrl, chatId, model, message, fid, timeoutMs }) => {
        let timer: ReturnType<typeof setTimeout> | undefined = undefined;
        try {
          const url = `${baseUrl}/api/v2/chat/completions?chat_id=${chatId}`;
          console.log(`[Browser] Sending message: ${url} (timeout: ${timeoutMs}ms)`);

          const controller = new AbortController();
          timer = setTimeout(() => controller.abort(), timeoutMs);
          const requestBody = {
            stream: true,
            version: "2.1",
            incremental_output: true,
            chat_id: chatId,
            chat_mode: "normal",
            model: model,
            parent_id: null,
            messages: [
              {
                fid,
                parentId: null,
                childrenIds: [],
                role: "user",
                content: message,
                user_action: "chat",
                files: [],
                timestamp: Math.floor(Date.now() / 1000),
                models: [model],
                chat_type: "t2t",
                feature_config: { thinking_enabled: true, output_schema: "phase" },
              },
            ],
          };

          console.log(`[Browser] Request body:`, JSON.stringify(requestBody, null, 2));

          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          clearTimeout(timer);
          console.log(`[Browser] Response status: ${res.status}`);
          console.log(`[Browser] Response headers:`, Object.fromEntries(res.headers.entries()));

          if (!res.ok) {
            const errorText = await res.text();
            console.log(`[Browser] Error response: ${errorText.substring(0, 500)}`);
            return { ok: false, status: res.status, error: errorText };
          }

          const reader = res.body?.getReader();
          if (!reader) {
            return { ok: false, status: 500, error: "No response body" };
          }

          const decoder = new TextDecoder();
          let fullText = "";
          let chunkCount = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;
            chunkCount++;
            if (chunkCount <= 3) {
              console.log(`[Browser] Chunk ${chunkCount}: ${chunk.substring(0, 200)}`);
            }
          }

          console.log(`[Browser] Total chunks: ${chunkCount}, Total length: ${fullText.length}`);
          return { ok: true, data: fullText };
        } catch (err) {
          if (typeof timer !== "undefined") clearTimeout(timer);
          const msg = String(err);
          if (msg.includes("aborted") || msg.includes("signal")) {
            return {
              ok: false,
              status: 408,
              error: `Qwen API request timed out after ${timeoutMs}ms`,
            };
          }
          console.error(`[Browser] Fetch error:`, err);
          return { ok: false, status: 500, error: msg };
        }
      },
      {
        baseUrl: this.baseUrl,
        chatId,
        model: model,
        message: params.message,
        fid,
        timeoutMs: fetchTimeoutMs,
      },
    );

    if (!responseData || !responseData.ok) {
      console.error(`[Qwen Web Browser] Request failed`);
      console.error(`[Qwen Web Browser] Error: ${responseData?.status} - ${responseData?.error}`);

      if (responseData?.status === 401 || responseData?.status === 403) {
        throw new Error(
          "Authentication failed. Please re-run onboarding to refresh your Qwen session.",
        );
      }
      if (responseData?.status === 408) {
        throw new Error(
          `Qwen API request timed out. ${responseData?.error || ""} ` +
            "Ensure chat.qwen.ai is reachable, Chrome is connected, and you are logged in.",
        );
      }
      throw new Error(
        `Qwen API error: ${responseData?.status || "unknown"} - ${responseData?.error || "Request failed"}`,
      );
    }

    console.log(`[Qwen Web Browser] Response data length: ${responseData.data?.length || 0} bytes`);
    console.log(
      `[Qwen Web Browser] Response preview: ${responseData.data?.substring(0, 300) || "empty"}`,
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
        id: "qwen-max",
        name: "Qwen Max",
        api: "qwen-web",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32768,
        maxTokens: 8192,
      },
    ] as ModelDefinitionConfig[];
  }
}
