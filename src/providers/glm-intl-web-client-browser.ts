import crypto from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import { getChromeWebSocketUrl, launchOpenClawChrome } from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";

export interface GlmIntlWebClientOptions {
  cookie: string;
  userAgent: string;
  headless?: boolean;
}

/** Model ID -> ChatGLM assistant_id mapping (国际版可能需要不同的映射) */
const ASSISTANT_ID_MAP: Record<string, string> = {
  "glm-4-plus": "65940acff94777010aa6b796",
  "glm-4": "65940acff94777010aa6b796",
  "glm-4-think": "676411c38945bbc58a905d31",
  "glm-4-zero": "676411c38945bbc58a905d31",
};
const DEFAULT_ASSISTANT_ID = "65940acff94777010aa6b796";

const SIGN_SECRET = "8a1317a7468aa3ad86e997d08f3f31cb";

const X_EXP_GROUPS =
  "na_android_config:exp:NA,na_4o_config:exp:4o_A,tts_config:exp:tts_config_a," +
  "na_glm4plus_config:exp:open,mainchat_server_app:exp:A,mobile_history_daycheck:exp:a," +
  "desktop_toolbar:exp:A,chat_drawing_server:exp:A,drawing_server_cogview:exp:cogview4," +
  "app_welcome_v2:exp:A,chat_drawing_streamv2:exp:A,mainchat_rm_fc:exp:add," +
  "mainchat_dr:exp:open,chat_auto_entrance:exp:A,drawing_server_hi_dream:control:A," +
  "homepage_square:exp:close,assistant_recommend_prompt:exp:3,app_home_regular_user:exp:A," +
  "memory_common:exp:enable,mainchat_moe:exp:300,assistant_greet_user:exp:greet_user," +
  "app_welcome_personalize:exp:A,assistant_model_exp_group:exp:glm4.5," +
  "ai_wallet:exp:ai_wallet_enable";

/** Generate X-Sign, X-Nonce, X-Timestamp headers required by chat.z.ai */
function generateSign(): { timestamp: string; nonce: string; sign: string } {
  const e = Date.now();
  const A = e.toString();
  const t = A.length;
  const o = A.split("").map((c) => Number(c));
  const i = o.reduce((acc, v) => acc + v, 0) - o[t - 2];
  const a = i % 10;
  const timestamp = A.substring(0, t - 2) + a + A.substring(t - 1, t);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const sign = crypto
    .createHash("md5")
    .update(`${timestamp}-${nonce}-${SIGN_SECRET}`)
    .digest("hex");
  return { timestamp, nonce, sign };
}

export class GlmIntlWebClientBrowser {
  private options: GlmIntlWebClientOptions;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private initialized = false;
  private accessToken: string | null = null;
  private deviceId = crypto.randomUUID().replace(/-/g, "");

  constructor(options: GlmIntlWebClientOptions) {
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
          domain: ".z.ai",
          path: "/",
        };
      })
      .filter((c) => c.name.length > 0);
  }

  private getRefreshToken(): string | null {
    const cookies = this.parseCookies();
    // Try multiple possible refresh token cookie names for international version
    const refreshCookieNames = [
      "chatglm_refresh_token",
      "refresh_token",
      "auth_refresh_token",
      "glm_refresh_token",
      "zai_refresh_token",
    ];

    for (const name of refreshCookieNames) {
      const cookie = cookies.find((c) => c.name === name);
      if (cookie?.value) {
        console.log(`[GLM Intl Web Browser] Found refresh token cookie: ${name}`);
        return cookie.value;
      }
    }

    return null;
  }

  private getAccessTokenFromCookie(): string | null {
    const cookies = this.parseCookies();
    // Try multiple possible access token cookie names for international version
    const accessTokenCookieNames = [
      "chatglm_token",
      "access_token",
      "auth_token",
      "glm_token",
      "zai_token",
      "token",
    ];

    for (const name of accessTokenCookieNames) {
      const cookie = cookies.find((c) => c.name === name);
      if (cookie?.value) {
        console.log(`[GLM Intl Web Browser] Found access token cookie: ${name}`);
        return cookie.value;
      }
    }

    return null;
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
      console.log(`[GLM Intl Web Browser] Connecting to existing Chrome at ${profile.cdpUrl}`);
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
    const glmPage = pages.find((p) => p.url().includes("chat.z.ai"));
    if (glmPage) {
      console.log(`[GLM Intl Web Browser] Found existing GLM International page`);
      this.page = glmPage;
    } else {
      this.page = await this.context.newPage();
      await this.page.goto("https://chat.z.ai/", {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      }); // 2 minutes timeout
    }

    const cookies = this.parseCookies();
    if (cookies.length > 0) {
      try {
        await this.context.addCookies(cookies);
      } catch (e) {
        console.warn("[GLM Intl Web Browser] Failed to add some cookies:", e);
      }
    }

    await this.refreshAccessToken();

    this.initialized = true;
  }

  private async refreshAccessToken(): Promise<void> {
    const cookieToken = this.getAccessTokenFromCookie();
    if (cookieToken) {
      this.accessToken = cookieToken;
      console.log("[GLM Intl Web Browser] Using chatglm_token from cookies");
      return;
    }

    // Also try to get token from browser cookies
    if (this.context) {
      try {
        const browserCookies = await this.context.cookies(["https://chat.z.ai"]);
        const browserToken = browserCookies.find((c) => c.name === "chatglm_token");
        if (browserToken?.value) {
          this.accessToken = browserToken.value;
          console.log("[GLM Intl Web Browser] Using chatglm_token from browser cookies");
          return;
        }
      } catch {
        // ignore
      }
    }

    const refreshToken = this.getRefreshToken();
    if (!refreshToken || !this.page) {
      console.warn(
        "[GLM Intl Web Browser] No chatglm_token found, will rely on browser cookies for auth",
      );
      return;
    }

    console.log("[GLM Intl Web Browser] Refreshing access token via API...");
    const sign = generateSign();
    const requestId = crypto.randomUUID().replace(/-/g, "");
    const result = await this.page.evaluate(
      async ({ refreshToken, deviceId, requestId, sign }) => {
        try {
          const res = await fetch("https://chat.z.ai/chatglm/user-api/user/refresh", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${refreshToken}`,
              "App-Name": "chatglm",
              "X-App-Platform": "pc",
              "X-App-Version": "0.0.1",
              "X-Device-Id": deviceId,
              "X-Request-Id": requestId,
              "X-Sign": sign.sign,
              "X-Nonce": sign.nonce,
              "X-Timestamp": sign.timestamp,
            },
            credentials: "include",
            body: JSON.stringify({}),
          });

          if (!res.ok) {
            return { ok: false, status: res.status, error: await res.text() };
          }

          const data = await res.json();
          const accessToken =
            data?.result?.access_token ?? data?.result?.accessToken ?? data?.accessToken;
          if (!accessToken) {
            return {
              ok: false,
              status: 200,
              error: `No accessToken in response: ${JSON.stringify(data).substring(0, 300)}`,
            };
          }
          return { ok: true, accessToken };
        } catch (err) {
          return { ok: false, status: 500, error: String(err) };
        }
      },
      { refreshToken, deviceId: this.deviceId, requestId, sign },
    );

    if (result.ok && result.accessToken) {
      this.accessToken = result.accessToken;
      console.log("[GLM Intl Web Browser] Access token refreshed successfully");
    } else {
      console.warn(`[GLM Intl Web Browser] Failed to refresh access token: ${result.error}`);
    }
  }

  async chatCompletions(params: {
    conversationId?: string;
    message: string;
    model: string;
    signal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array>> {
    if (!this.page) {
      throw new Error("GlmIntlWebClientBrowser not initialized");
    }
    const page = this.page;
    const model = params.model;
    console.log(`[GLM Intl Web Browser] UI mode send... model=${model}`);

    // Ensure we're on chat.z.ai and the composer is visible.
    if (!page.url().includes("chat.z.ai")) {
      await page.goto("https://chat.z.ai/", { waitUntil: "domcontentloaded", timeout: 120000 });
    }

    // Track assistant blocks before sending the message.
    const beforeCount = await page.locator(".chat-assistant").count();

    // Prefer textarea composer used by chat.z.ai.
    let sent = false;
    const textarea = page.locator("textarea").first();
    if ((await textarea.count()) > 0) {
      await textarea.click({ timeout: 5000 });
      await textarea.fill(params.message);
      await textarea.press("Enter");
      sent = true;
    }

    // Fallback for contenteditable composers.
    if (!sent) {
      const editable = page.locator('[contenteditable="true"]').first();
      if ((await editable.count()) > 0) {
        await editable.click({ timeout: 5000 });
        await page.keyboard.type(params.message, { delay: 5 });
        await page.keyboard.press("Enter");
        sent = true;
      }
    }

    // Last fallback: plain text input + send button.
    if (!sent) {
      const input = page.locator('input[type="text"]').first();
      if ((await input.count()) > 0) {
        await input.click({ timeout: 5000 });
        await input.fill(params.message);
        const sendBtn = page
          .locator('button.sendMessageButton, button[aria-label*="Send"], button:has-text("发送")')
          .first();
        if ((await sendBtn.count()) > 0) {
          await sendBtn.click();
          sent = true;
        } else {
          await input.press("Enter");
          sent = true;
        }
      }
    }

    if (!sent) {
      throw new Error("GLM Intl UI send failed: no chat input found.");
    }

    // Wait for a new assistant message node to appear.
    await page
      .waitForFunction(
        (prev) => document.querySelectorAll(".chat-assistant").length > prev,
        beforeCount,
        { timeout: 120000, polling: 500 },
      )
      .catch(() => {});

    // Poll the latest assistant message text until it stabilizes.
    const deadline = Date.now() + 120000;
    let stableRounds = 0;
    let lastText = "";
    while (Date.now() < deadline) {
      const text = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll(".chat-assistant"));
        const latest = nodes[nodes.length - 1] as HTMLElement | undefined;
        return (latest?.innerText ?? "").trim();
      });

      if (text && text === lastText) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
        lastText = text;
      }

      // Consider the response complete after ~3 stable polls.
      if (lastText && stableRounds >= 3) {
        break;
      }
      await new Promise((r) => setTimeout(r, 900));
    }

    if (!lastText) {
      throw new Error("GLM Intl UI reply capture failed: assistant message not found.");
    }

    // Keep stream parser compatibility by returning SSE-like data lines.
    const payload = `data: ${JSON.stringify({ text: lastText })}\n\n`;
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.close();
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
    this.accessToken = null;
  }
}
