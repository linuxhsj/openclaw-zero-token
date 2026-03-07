import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import {
  killExistingChromeOnPort,
  launchOpenClawChrome,
  stopOpenClawChrome,
  getChromeWebSocketUrl,
} from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";

/**
 * Attach to existing Chrome and capture DeepSeek credentials if already logged in,
 * or open DeepSeek page and wait for user to login
 */
export async function loginDeepseekWebAttachOnly(params: {
  onProgress: (msg: string) => void;
}): Promise<{ cookie: string; bearer: string; userAgent: string }> {
  const rootConfig = loadConfig();
  const browserConfig = resolveBrowserConfig(rootConfig.browser, rootConfig);
  const profile = resolveProfile(browserConfig, browserConfig.defaultProfile);
  if (!profile) {
    throw new Error(`Could not resolve browser profile '${browserConfig.defaultProfile}'`);
  }

  // Always use attach mode - connect to existing Chrome
  params.onProgress("Connecting to existing Chrome...");

  let running: { cdpPort: number } | null = null;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    running = { cdpPort: profile.cdpPort };
    const cdpUrl = profile.cdpUrl || `http://127.0.0.1:${profile.cdpPort}`;

    // Wait for Chrome debugger
    params.onProgress("Waiting for browser debugger...");
    let wsUrl: string | null = null;
    for (let i = 0; i < 10; i++) {
      wsUrl = await getChromeWebSocketUrl(cdpUrl, 2000);
      if (wsUrl) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!wsUrl) {
      throw new Error(`Failed to connect to Chrome at ${cdpUrl}`);
    }

    params.onProgress("Connecting to browser...");
    browser = await chromium.connectOverCDP(wsUrl, {
      headers: getHeadersWithAuth(wsUrl),
    });
    context = browser.contexts()[0] || await browser.newContext();
    const page = context.pages()[0] || await context.newPage();

    // Check if DeepSeek page is already open and user is logged in
    params.onProgress("Checking for existing DeepSeek session...");

    // Try to get cookies first (user might already be logged in)
    const existingCookies = await context.cookies(["https://chat.deepseek.com", "https://deepseek.com"]);
    const cookieString = existingCookies.map((c) => `${c.name}=${c.value}`).join("; ");

    // Check for valid session indicators
    const hasDeviceId = cookieString.includes("d_id=");
    const hasSessionId = cookieString.includes("ds_session_id=");
    const hasSessionInfo = cookieString.includes("HWSID=") || cookieString.includes("uuid=");

    let bearer = "";
    let userAgent = await page.evaluate(() => navigator.userAgent);

    // If cookies exist and indicate logged in, capture them
    if ((hasDeviceId || hasSessionId || hasSessionInfo || existingCookies.length > 3) && cookieString.length > 10) {
      params.onProgress("Found existing DeepSeek session!");

      // Try to capture bearer from page or requests
      // Navigate to DeepSeek to capture any auth headers
      try {
        await page.goto("https://chat.deepseek.com", { timeout: 5000 });
      } catch {
        // Ignore navigation errors
      }

      // Check localStorage for token
      try {
        const localStorage = await page.evaluate(() => {
          const data: Record<string, string> = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) data[key] = localStorage.getItem(key) || "";
          }
          return data;
        });

        // Look for auth token in localStorage
        for (const [key, value] of Object.entries(localStorage)) {
          if (key.toLowerCase().includes("token") || key.toLowerCase().includes("auth")) {
            try {
              const parsed = JSON.parse(value);
              if (parsed.token) bearer = parsed.token;
              else if (typeof parsed === "string" && parsed.length > 20) bearer = parsed;
            } catch {
              if (value.length > 20) bearer = value;
            }
          }
        }
      } catch {
        // Ignore localStorage errors
      }

      if (!bearer) {
        // Try to get from API response by making a test request
        params.onProgress("Requesting DeepSeek API to capture token...");
        try {
          const response = await page.request.get("https://chat.deepseek.com/api/v0/users/current", {
            headers: { Cookie: cookieString }
          });
          if (response.ok()) {
            const data = await response.json();
            bearer = data?.data?.biz_data?.token || "";
          }
        } catch {
          // Ignore API errors
        }
      }

      return {
        cookie: cookieString,
        bearer,
        userAgent,
      };
    }

    // No existing session - open DeepSeek and wait for login
    params.onProgress("No existing session found. Opening DeepSeek for login...");

    // Navigate to DeepSeek
    await page.goto("https://chat.deepseek.com");
    userAgent = await page.evaluate(() => navigator.userAgent);

    params.onProgress(
      "Please login to DeepSeek in the opened browser window. The session token will be captured automatically once you are logged in.",
    );

    // Wait for login with polling
    return await new Promise<{ cookie: string; bearer: string; userAgent: string }>(
      (resolve, reject) => {
        let capturedBearer: string | undefined;
        let resolved = false;
        let checkInterval: ReturnType<typeof setInterval> | undefined;

        const timeout = setTimeout(() => {
          if (!resolved) {
            if (checkInterval) clearInterval(checkInterval);
            reject(new Error("Login timed out (5 minutes)."));
          }
        }, 300000);

        const tryResolve = async () => {
          if (!capturedBearer || resolved) return;

          try {
            const cookies = await context!.cookies(["https://chat.deepseek.com", "https://deepseek.com"]);
            if (cookies.length === 0) return;

            const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
            const hasDId = cookieStr.includes("d_id=");
            const hasSession = cookieStr.includes("ds_session_id=");

            if (hasDId || hasSession || cookies.length > 3) {
              resolved = true;
              clearTimeout(timeout);
              if (checkInterval) clearInterval(checkInterval);
              console.log(`[DeepSeek Attach] Credentials captured`);
              resolve({ cookie: cookieStr, bearer: capturedBearer, userAgent });
            }
          } catch (e: unknown) {
            console.error(`[DeepSeek Attach] Failed to fetch cookies: ${String(e)}`);
          }
        };

        page.on("request", async (request) => {
          const url = request.url();
          if (url.includes("/api/v0/")) {
            const headers = request.headers();
            const auth = headers["authorization"];
            if (auth?.startsWith("Bearer ")) {
              if (!capturedBearer) {
                capturedBearer = auth.slice(7);
              }
              await tryResolve();
            }
          }
        });

        page.on("response", async (response) => {
          const url = response.url();
          if (url.includes("/api/v0/users/current") && response.ok()) {
            try {
              const body = (await response.json()) as Record<string, unknown>;
              const bizData = body?.data as Record<string, unknown> | undefined;
              const token = (bizData?.biz_data as Record<string, unknown> | undefined)?.token;
              if (typeof token === "string" && token.length > 0) {
                if (!capturedBearer) capturedBearer = token;
                await tryResolve();
              }
            } catch {}
          }
        });

        checkInterval = setInterval(tryResolve, 2000);
      },
    );
  } finally {
    // Don't close browser - it's attached mode, user may want to continue using it
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

export async function loginDeepseekWeb(params: {
  onProgress: (msg: string) => void;
  openUrl: (url: string) => Promise<boolean>;
}) {
  const rootConfig = loadConfig();
  const browserConfig = resolveBrowserConfig(rootConfig.browser, rootConfig);
  const profile = resolveProfile(browserConfig, browserConfig.defaultProfile);
  if (!profile) {
    throw new Error(`Could not resolve browser profile '${browserConfig.defaultProfile}'`);
  }

  type RunningLike = { cdpPort: number; proc?: unknown };
  let running: RunningLike | null = null;
  let didLaunch = false;

  if (browserConfig.attachOnly) {
    // Attach to existing Chrome (e.g. from start-chrome-debug.sh) - same browser, same user-data, reuse logged-in session
    params.onProgress("Connecting to existing Chrome (attach mode)...");
    running = { cdpPort: profile.cdpPort };
    // Do NOT kill: user may have already logged in via start-chrome-debug.sh
  } else {
    // Launch our own Chrome: close any existing on this port first to avoid port conflict
    await killExistingChromeOnPort(profile.cdpPort, params.onProgress);
    params.onProgress("Launching browser...");
    running = await launchOpenClawChrome(browserConfig, profile);
    didLaunch = true;
  }

  try {
    const cdpUrl =
      browserConfig.attachOnly ? profile.cdpUrl : `http://127.0.0.1:${running.cdpPort}`;
    let wsUrl: string | null = null;

    // Retry finding the WS URL as Chrome might take a second to populate it
    params.onProgress("Waiting for browser debugger...");
    for (let i = 0; i < 10; i++) {
      wsUrl = await getChromeWebSocketUrl(cdpUrl, 2000);
      if (wsUrl) {
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!wsUrl) {
      throw new Error(`Failed to resolve Chrome WebSocket URL from ${cdpUrl} after retries.`);
    }

    params.onProgress("Connecting to browser...");
    const browser = await chromium.connectOverCDP(wsUrl, {
      headers: getHeadersWithAuth(wsUrl),
    });
    const context = browser.contexts()[0];
    const page = context.pages()[0] || (await context.newPage());

    await page.goto("https://chat.deepseek.com");
    const userAgent = await page.evaluate(() => navigator.userAgent);

    params.onProgress(
      "Please login to DeepSeek in the opened browser window. The session token will be captured automatically once you are logged in.",
    );

    return await new Promise<{ cookie: string; bearer: string; userAgent: string }>(
      (resolve, reject) => {
        let capturedBearer: string | undefined;
        let resolved = false;
        let checkInterval: ReturnType<typeof setInterval> | undefined;

        const timeout = setTimeout(() => {
          if (!resolved) {
            if (checkInterval) clearInterval(checkInterval);
            reject(new Error("Login timed out (5 minutes)."));
          }
        }, 300000);

        const tryResolve = async () => {
          // Bearer is required for DeepSeek API (create_pow_challenge, chat). Do not resolve without it.
          if (!capturedBearer || resolved) {
            return;
          }

          try {
            // Get all cookies for the domain
            const cookies = await context.cookies([
              "https://chat.deepseek.com",
              "https://deepseek.com",
            ]);
            if (cookies.length === 0) {
              return;
            }

            const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

            // d_id is preferred, but ds_session_id is an extremely strong signal of an active session
            const hasDeviceId = cookieString.includes("d_id=");
            const hasSessionId = cookieString.includes("ds_session_id=");
            const hasSessionInfo =
              cookieString.includes("HWSID=") || cookieString.includes("uuid=");

            if (hasDeviceId || hasSessionId || hasSessionInfo || cookies.length > 3) {
              resolved = true;
              clearTimeout(timeout);
              if (checkInterval) clearInterval(checkInterval);
              console.log(
                `[DeepSeek] Credentials captured (d_id: ${hasDeviceId}, ds_session_id: ${hasSessionId})`,
              );
              resolve({
                cookie: cookieString,
                bearer: capturedBearer,
                userAgent,
              });
            }
          } catch (e: unknown) {
            console.error(`[DeepSeek] Failed to fetch cookies: ${String(e)}`);
          }
        };

        page.on("request", async (request) => {
          const url = request.url();
          if (url.includes("/api/v0/")) {
            const headers = request.headers();
            const auth = headers["authorization"];

            if (auth?.startsWith("Bearer ")) {
              if (!capturedBearer) {
                console.log(`[DeepSeek Research] Captured Bearer Token.`);
                capturedBearer = auth.slice(7);
              }
              await tryResolve();
            }

            if (url.includes("/api/v0/chat/completion")) {
              console.log(`[DeepSeek Research] Completion Request Headers Check:`, {
                hasAuth: !!auth,
              });
            }
          }
        });

        page.on("response", async (response) => {
          const url = response.url();
          // users/current returns token in data.biz_data.token - same as openclawWeComzh flow
          if (url.includes("/api/v0/users/current") && response.ok()) {
            try {
              const body = (await response.json()) as Record<string, unknown>;
              const bizData = body?.data as Record<string, unknown> | undefined;
              const tokenFromResponse =
                (bizData?.biz_data as Record<string, unknown> | undefined)?.token;
              if (typeof tokenFromResponse === "string" && tokenFromResponse.length > 0) {
                if (!capturedBearer) {
                  console.log(`[DeepSeek] Captured token from users/current response`);
                  capturedBearer = tokenFromResponse;
                }
                await tryResolve();
              }
            } catch {
              // ignore
            }
          }
        });

        page.on("close", () => {
          if (checkInterval) clearInterval(checkInterval);
          reject(new Error("Browser window closed before login was captured."));
        });

        // Periodic check: cookies may already exist (user logged in), even without new API requests
        checkInterval = setInterval(tryResolve, 2000);
      },
    );
  } finally {
    if (didLaunch && running && "proc" in running) {
      await stopOpenClawChrome(running);
    }
  }
}
