import { chromium } from "playwright-core";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import {
  launchOpenClawChrome,
  stopOpenClawChrome,
  getChromeWebSocketUrl,
} from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";

export interface QwenWebAuth {
  sessionToken: string;
  cookie: string;
  userAgent: string;
}

export async function loginQwenWeb(params: {
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
      timeout: 60_000, // 60s，Chrome 多标签或复杂页面时 CDP 握手可能较慢
    });
    const context = browser.contexts()[0];
    const page = context.pages()[0] || (await context.newPage());

    await page.goto("https://chat.qwen.ai/");
    const userAgent = await page.evaluate(() => navigator.userAgent);

    params.onProgress("Please login to Qwen in the opened browser window...");

    return await new Promise<QwenWebAuth>((resolve, reject) => {
      let capturedToken: string | undefined;
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          reject(new Error("Login timed out (5 minutes)."));
        }
      }, 300000);

      const tryResolve = async () => {
        if (resolved) {
          return;
        }

        try {
          const cookies = await context.cookies(["https://chat.qwen.ai", "https://qwen.ai"]);
          if (cookies.length === 0) {
            console.log(`[Qwen] No cookies found in context yet.`);
            return;
          }

          const cookieNames = cookies.map((c) => c.name);
          console.log(`[Qwen] Found cookies: ${cookieNames.join(", ")}`);

          // Look for session-related cookies
          const sessionCookie = cookies.find(
            (c) =>
              c.name.includes("session") || c.name.includes("token") || c.name.includes("auth"),
          );

          if (sessionCookie || capturedToken) {
            const finalToken = capturedToken || sessionCookie?.value || "";

            if (finalToken && cookies.length > 2) {
              resolved = true;
              clearTimeout(timeout);
              console.log(`[Qwen] Session token captured!`);

              const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

              resolve({
                sessionToken: finalToken,
                cookie: cookieString,
                userAgent,
              });
            } else {
              console.log(`[Qwen] Waiting for valid session...`);
            }
          } else {
            console.log(`[Qwen] Waiting for session cookie...`);
          }
        } catch (e: unknown) {
          console.error(`[Qwen] Failed to fetch cookies: ${String(e)}`);
        }
      };

      page.on("request", async (request) => {
        const url = request.url();
        if (url.includes("qwen.ai")) {
          const headers = request.headers();
          const auth = headers["authorization"];
          const cookie = headers["cookie"];

          if (auth) {
            if (!capturedToken) {
              console.log(`[Qwen] Captured authorization token from request.`);
              capturedToken = auth.replace("Bearer ", "");
            }
            await tryResolve();
          } else if (cookie) {
            const tokenMatch = cookie.match(/(?:session|token|auth)[^=]*=([^;]+)/i);
            if (tokenMatch) {
              if (!capturedToken) {
                console.log(`[Qwen] Captured session from cookie.`);
                capturedToken = tokenMatch[1];
              }
              await tryResolve();
            }
          }
        }
      });

      page.on("response", async (response) => {
        const url = response.url();
        if (url.includes("qwen.ai") && response.ok()) {
          await tryResolve();
        }
      });

      page.on("close", () => {
        reject(new Error("Browser window closed before login was captured."));
      });

      const checkInterval = setInterval(async () => {
        await tryResolve();
        if (resolved) {
          clearInterval(checkInterval);
        }
      }, 2000);
    });
  } finally {
    if (didLaunch && running && "proc" in running) {
      await stopOpenClawChrome(running);
    }
  }
}
