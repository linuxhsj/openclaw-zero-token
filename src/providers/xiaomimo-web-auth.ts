import { chromium } from "playwright-core";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import {
  launchOpenClawChrome,
  stopOpenClawChrome,
  getChromeWebSocketUrl,
} from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";

export interface XiaomiMimoWebAuth {
  cookie: string;
  userAgent: string;
}

const XIAOMIMO_BASE_URL = "https://aistudio.xiaomimimo.com";
const XIAOMIMO_AUTH_URL = "https://aistudio.xiaomimimo.com/#/";

export async function loginXiaomiMimoWeb(params: {
  onProgress: (msg: string) => void;
  openUrl: (url: string) => Promise<boolean>;
}) {
  const rootConfig = loadConfig();
  const browserConfig = resolveBrowserConfig(rootConfig.browser, rootConfig);
  const profile = resolveProfile(browserConfig, browserConfig.defaultProfile);
  if (!profile) {
    throw new Error(`Could not resolve browser profile '${browserConfig.defaultProfile}'`);
  }

  let running: Awaited<ReturnType<typeof launchOpenClawChrome>> | { cdpPort: number };
  let didLaunch = false;

  if (browserConfig.attachOnly) {
    params.onProgress("Connecting to existing Chrome (attach mode)...");
    const wsUrl = await getChromeWebSocketUrl(profile.cdpUrl, 5000);
    if (!wsUrl) {
      throw new Error(
        `Failed to connect to Chrome at ${profile.cdpUrl}. ` +
          "Make sure Chrome is running in debug mode (./start-chrome-debug.sh)",
      );
    }
    running = { cdpPort: profile.cdpPort };
  } else {
    params.onProgress("Launching browser...");
    running = await launchOpenClawChrome(browserConfig, profile);
    didLaunch = true;
  }

  try {
    const cdpUrl = browserConfig.attachOnly
      ? profile.cdpUrl
      : `http://127.0.0.1:${running.cdpPort}`;
    let wsUrl: string | null = null;

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
      timeout: 60_000,
    });
    const context = browser.contexts()[0];
    let page = context.pages()[0];

    // 查找是否已有 MiMo 页面
    if (!page) {
      page = await context.newPage();
    } else {
      const existingPage = context.pages().find((p) => p.url().includes("xiaomimimo.com"));
      if (existingPage) {
        page = existingPage;
      }
    }

    // 调用 openUrl 打开浏览器
    params.onProgress(`Opening ${XIAOMIMO_AUTH_URL}...`);
    await params.openUrl(XIAOMIMO_AUTH_URL);

    // 直接导航到页面
    await page
      .goto(XIAOMIMO_AUTH_URL, { waitUntil: "domcontentloaded", timeout: 15000 })
      .catch(() => {
        // ignore navigation errors, page may already be loading
      });

    const userAgent = await page.evaluate(() => navigator.userAgent);
    params.onProgress("Please login to Xiaomi MiMo in the opened browser window...");
    params.onProgress("Waiting for authentication token...");

    return await new Promise<XiaomiMimoWebAuth>((resolve, reject) => {
      let capturedCookie: string | undefined;
      let capturedToken: string | undefined;
      let resolved = false;
      let checkInterval: ReturnType<typeof setInterval> | undefined;

      const timeout = setTimeout(() => {
        if (!resolved) {
          if (checkInterval) clearInterval(checkInterval);
          reject(new Error("Login timed out (5 minutes)."));
        }
      }, 300000);

      const tryResolve = async () => {
        if (resolved) return;

        try {
          const cookies = await context.cookies([
            XIAOMIMO_BASE_URL,
            "https://aistudio.xiaomimimo.com",
          ]);
          if (cookies.length === 0) return;

          const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
          console.log(
            `[XiaomiMimo] Found ${cookies.length} cookies: ${cookies.map((c) => c.name).join(", ")}`,
          );

          // 查找 token 相关 cookie
          const tokenCookie = cookies.find(
            (c) =>
              c.name.toLowerCase().includes("token") ||
              c.name.toLowerCase().includes("session") ||
              c.name.toLowerCase().includes("auth") ||
              c.name.toLowerCase().includes("user"),
          );

          if (tokenCookie || capturedToken) {
            const finalToken = capturedToken || tokenCookie?.value || "";
            if (finalToken && cookies.length > 1) {
              resolved = true;
              clearTimeout(timeout);
              if (checkInterval) clearInterval(checkInterval);
              console.log(`[XiaomiMimo] Auth token captured!`);
              resolve({
                cookie: cookieString,
                userAgent,
              });
            }
          } else {
            console.log(
              `[XiaomiMimo] Waiting for token cookie... (${cookies.length} cookies found)`,
            );
          }
        } catch (e: unknown) {
          console.error(`[XiaomiMimo] Failed to fetch cookies: ${String(e)}`);
        }
      };

      // 监听网络请求中的 token
      page.on("request", async (request) => {
        const url = request.url();
        if (url.includes("xiaomimimo.com")) {
          const headers = request.headers();
          const auth = headers["authorization"] || headers["Authorization"];
          const cookie = headers["cookie"] || headers["Cookie"];

          if (auth && auth.startsWith("Bearer ")) {
            if (!capturedToken) {
              console.log(`[XiaomiMimo] Captured Bearer token from request header.`);
              capturedToken = auth.replace("Bearer ", "");
            }
            void tryResolve();
          } else if (cookie) {
            const tokenMatch = cookie.match(/(?:token|session|auth|user)[^=]*=([^;]+)/i);
            if (tokenMatch && !capturedToken) {
              console.log(`[XiaomiMimo] Captured token from cookie header.`);
              capturedToken = tokenMatch[1];
              void tryResolve();
            }
          }
        }
      });

      // 监听响应
      page.on("response", async (response) => {
        const url = response.url();
        if (url.includes("xiaomimimo.com") && response.ok()) {
          // 尝试从响应头或 body 中提取 token
          try {
            const ct = response.headers()["content-type"] || "";
            if (ct.includes("application/json")) {
              const text = await response.text().catch(() => "");
              if (text) {
                const tokenMatch = text.match(/(?:token|session|auth|access_token)[^"]*"([^"]+)"/i);
                if (tokenMatch && !capturedToken) {
                  console.log(`[XiaomiMimo] Captured token from response body.`);
                  capturedToken = tokenMatch[1];
                  void tryResolve();
                }
              }
            }
          } catch {}
          void tryResolve();
        }
      });

      // 监听 localStorage 变化
      page.on("framenavigated", async () => {
        try {
          const storageData = await page.evaluate(() => {
            const data: Record<string, string> = {};
            try {
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                  const val = localStorage.getItem(key);
                  if (val) data[key] = val;
                }
              }
            } catch {}
            return data;
          });

          for (const [key, value] of Object.entries(storageData)) {
            const k = key.toLowerCase();
            if (
              k.includes("token") ||
              k.includes("session") ||
              k.includes("auth") ||
              k.includes("user")
            ) {
              try {
                const parsed = JSON.parse(value);
                const token = parsed?.token || parsed?.access_token || parsed?.data || value;
                if (typeof token === "string" && token.length > 10 && !capturedToken) {
                  console.log(`[XiaomiMimo] Captured token from localStorage key: ${key}`);
                  capturedToken = token;
                  void tryResolve();
                }
              } catch {
                if (value.length > 10 && !capturedToken) {
                  console.log(`[XiaomiMimo] Captured token from localStorage key: ${key}`);
                  capturedToken = value;
                  void tryResolve();
                }
              }
            }
          }
        } catch {}
      });

      page.on("close", () => {
        if (checkInterval) clearInterval(checkInterval);
        reject(new Error("Browser window closed before login was captured."));
      });

      checkInterval = setInterval(tryResolve, 2000);
    });
  } finally {
    if (didLaunch && running && "proc" in running) {
      await stopOpenClawChrome(running);
    }
  }
}
