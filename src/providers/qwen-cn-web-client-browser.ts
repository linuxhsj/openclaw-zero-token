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
  private sessionId: string;
  private topicId: string;
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
    this.sessionId = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    this.topicId = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16),).join('');
    this.cookie = finalOptions.cookie || "";
    this.xsrfToken = finalOptions.xsrfToken || "";
    this.userAgent = finalOptions.userAgent ||
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
      // 优先检查当前 page 是否仍然有效
      try {
        const currentPageUrl = this.page.url();
        if (currentPageUrl.includes('qianwen.com')) {
          console.log(`[Qwen CN Web Browser] Reusing existing Qwen CN page: ${currentPageUrl}`);
          return { browser: this.browser, page: this.page };
        }
      } catch (err) {
        // page 可能已关闭，继续下面的逻辑
        console.log(`[Qwen CN Web Browser] Current page is invalid, will create new one`);
      }

      // 尝试在浏览器中查找其他通义千问页面
      const pages = this.browser.pages();
      let qwenPage = pages.find((p) => p.url().includes('qianwen.com'));

      if (qwenPage) {
        console.log(`[Qwen CN Web Browser] Found existing Qwen CN page in browser`);
        this.page = qwenPage;
        return { browser: this.browser, page: this.page };
      }

      // 如果没有找到，创建新页面
      console.log(`[Qwen CN Web Browser] Creating new page`);
      this.page = await this.browser.newPage();
      await this.page.goto('https://www.qianwen.com/', { waitUntil: 'domcontentloaded' });
      return { browser: this.browser, page: this.page };
    }

    const rootConfig = loadConfig();
    const browserConfig = resolveBrowserConfig(rootConfig.browser, rootConfig);
    const profile = resolveProfile(browserConfig, browserConfig.defaultProfile);
    if (!profile) {
      throw new Error(`Could not resolve browser profile '${browserConfig.defaultProfile}'`);
    }
    const wsUrl = await getChromeWebSocketUrl(profile.cdpUrl, 5000);
    if (wsUrl) {
      browserConfig.attachOnly = true;
    } else {
      browserConfig.attachOnly = false;
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

      this.browser = (await chromium.connectOverCDP(wsUrl, {
        headers: getHeadersWithAuth(wsUrl),
      })).contexts()[0];


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

      this.browser = (await chromium
        .connectOverCDP(wsUrl, {
          headers: getHeadersWithAuth(wsUrl),
        })).contexts()[0];

    }

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
        await this.browser.clearCookies();
        await this.browser.addCookies(cookies);
        await this.page.reload({ waitUntil: "domcontentloaded" });
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

    if (params.sessionId) {
      this.sessionId = params.sessionId;
    }

    console.log(`[Qwen CN Web Browser] Sending message`);
    console.log(`[Qwen CN Web Browser] Model: ${model}`);
    console.log(`[Qwen CN Web Browser] Session ID: ${this.sessionId}`);

    const timestamp = Date.now();

    const nonce = Math.random().toString(36).slice(2);

    // 从页面获取必要的 token 和 cookies
    const tokensFromPage = await page.evaluate(() => {
      return {
        bxUa: (window as any).__bx_ua || '',
        bxUmidToken: (window as any).__bx_umidtoken || '',
        bxEt: (window as any).__bx_et || '',
        cltAcsReq: ((window as any)._acs && (window as any)._acs.request) || '',
        cltAcsSign: ((window as any)._acs && (window as any)._acs.sign) || '',
        eoCltAcsKp: '',
        eoCltActkn: '',
        chatId: '',
      };
    });

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
        bxUa,
        bxUmidToken,
        bxEt,
        cltAcsReq,
        cltAcsSign,
        eoCltAcsKp,
        eoCltActkn,
        chatId,
        userAgent,
        topicId,
      }) => {
        try {
          const url = `${baseUrl}/api/v2/chat?biz_id=ai_qwen&chat_client=h5&device=pc&fr=pc&pr=qwen&ut=${ut}&la=zh-CN&tz=Asia%2FShanghai&nonce=${nonce}&timestamp=${timestamp}`;

          const reqId = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16),).join('');

          const bodyObj: Record<string, unknown> = {
            deep_search: '1',
            req_id: reqId,
            model: model,
            scene: 'chat',
            session_id: sessionId,
            sub_scene: 'chat',
            temporary: false,
            messages: [
              {
                content: message,
                mime_type: 'text/plain',
                meta_data: {
                  ori_query: message,
                },
              },
            ],
            from: 'default',
            topic_id: topicId,
            parent_req_id: parentMessageId || '0',
            scene_param: parentMessageId ? 'continue_chat' : 'first_turn',
            chat_client: 'h5',
            client_tm: timestamp.toString(),
            protocol_version: 'v2',
            biz_id: 'ai_qwen',
          };

          // 注意：在浏览器环境中，fetch 无法手动设置 Cookie header
          // Cookie 会自动从浏览器上下文携带
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
            'x-xsrf-token': xsrfToken,
            'x-deviceid': deviceId,
            'x-platform': 'pc_tongyi',
            'x-chat-id': chatId || reqId,
            'origin': 'https://www.qianwen.com',
            'referer': `${baseUrl} /chat/${sessionId} `,
            'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Microsoft Edge";v="146"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'user-agent': userAgent,
            'priority': 'u=1, i',
          };

          // 添加 bx 相关的 header（如果有）
          if (bxUa) headers['bx-ua'] = bxUa;
          if (bxUmidToken) headers['bx-umidtoken'] = bxUmidToken;
          if (bxEt) headers['bx_et'] = bxEt;

          // 添加 ACS 相关的 header（如果有）
          if (cltAcsReq) {
            headers['clt-acs-reqt'] = timestamp.toString();
            headers['clt-acs-caer'] = 'vrad';
            headers['clt-acs-request-params'] = 'biz_id,chat_client,device,fr,pr,ut,la,tz,nonce,timestamp';
            headers['clt-acs-sign'] = cltAcsSign;
          }

          // 添加 EO 相关的 header（如果有）
          if (eoCltAcsKp) {
            headers['eo-clt-acs-kp'] = eoCltAcsKp;
            headers['eo-clt-acs-ve'] = '1.0.0';
            headers['eo-clt-actkn'] = eoCltActkn;
            headers['eo-clt-dvidn'] = '';
            headers['eo-clt-sacsft'] = '';
            headers['eo-clt-snver'] = 'lv';
          }

          const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(bodyObj),
            credentials: 'include', // 包含同源 Cookie
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
        sessionId: this.sessionId,
        model,
        message: params.message,
        parentMessageId: params.parentMessageId,
        ut: this.ut,
        xsrfToken: this.xsrfToken,
        deviceId: this.deviceId,
        nonce,
        timestamp,
        bxUa: tokensFromPage.bxUa,
        bxUmidToken: tokensFromPage.bxUmidToken,
        bxEt: tokensFromPage.bxEt,
        cltAcsReq: tokensFromPage.cltAcsReq,
        cltAcsSign: tokensFromPage.cltAcsSign,
        eoCltAcsKp: tokensFromPage.eoCltAcsKp,
        eoCltActkn: tokensFromPage.eoCltActkn,
        chatId: tokensFromPage.chatId,
        userAgent: this.userAgent,
        topicId: this.topicId,
      },
    );
    console.log(
      `[Qwen CN Web Browser] Response data: ok = ${responseData?.ok}, status = ${responseData?.status}, data length = ${responseData?.data?.length} `,
    );
    if (responseData?.data && responseData.data.length > 0) {
      console.log(
        `[Qwen CN Web Browser] Response preview: ${responseData.data.substring(0, 200)}...`,
      );
    }
    if (!responseData || !responseData.ok) {
      throw new Error(
        `Qwen CN API error: ${responseData?.status || "unknown"} - ${responseData?.error || "Request failed"} `,
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
        api: "qwen-cn-web",
        reasoning: false,
        input: ["text"],
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
        contextWindow: 128000,
        maxTokens: 4096,
      },
      {
        id: "Qwen3.5-Turbo",
        name: "Qwen 3.5 Turbo (国内版)",
        api: "qwen-cn-web",
        reasoning: false,
        input: ["text"],
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
        contextWindow: 32768,
        maxTokens: 4096,
      },
    ];
  }
}
