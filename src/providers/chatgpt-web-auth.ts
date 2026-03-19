import { chromium } from "playwright-core";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import {
  launchOpenClawChrome,
  stopOpenClawChrome,
  getChromeWebSocketUrl,
} from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";

export interface ChatGPTWebAuth {
  accessToken: string;
  cookie: string;
  userAgent: string;
}

export async function loginChatGPTWeb(params: {
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
    });
    const context = browser.contexts()[0];
    const page = context.pages()[0] || (await context.newPage());

    await page.goto("https://chatgpt.com/");
    const userAgent = await page.evaluate(() => navigator.userAgent);

    params.onProgress("Please login to ChatGPT in the opened browser window...");

    return await new Promise<ChatGPTWebAuth>((resolve, reject) => {
      let capturedAccessToken: string | undefined;
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
          const cookies = await context.cookies(["https://chatgpt.com", "https://chat.openai.com"]);
          if (cookies.length === 0) {
            console.log(`[ChatGPT] No cookies found in context yet.`);
            return;
          }

          const cookieNames = cookies.map((c) => c.name);
          console.log(`[ChatGPT] Found cookies: ${cookieNames.join(", ")}`);

          // Look for session token (may be split into .0 and .1 parts)
          const sessionCookie = cookies.find((c) => c.name === "__Secure-next-auth.session-token");

          // Handle split session tokens (.0 and .1)
          let splitToken = "";
          if (!sessionCookie) {
            const token0 = cookies.find((c) => c.name === "__Secure-next-auth.session-token.0");
            const token1 = cookies.find((c) => c.name === "__Secure-next-auth.session-token.1");
            if (token0 && token1) {
              splitToken = token0.value + token1.value;
              console.log(`[ChatGPT] Found split session token (.0 + .1)`);
            }
          }

          if (sessionCookie || capturedAccessToken || splitToken) {
            const finalToken = capturedAccessToken || sessionCookie?.value || splitToken || "";

            if (finalToken) {
              resolved = true;
              clearTimeout(timeout);
              console.log(`[ChatGPT] Access token captured!`);

              const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

              resolve({
                accessToken: finalToken,
                cookie: cookieString,
                userAgent,
              });
            } else {
              console.log(`[ChatGPT] Waiting for valid session token...`);
            }
          } else {
            console.log(`[ChatGPT] Waiting for session token cookie...`);
          }
        } catch (e: unknown) {
          console.error(`[ChatGPT] Failed to fetch cookies: ${String(e)}`);
        }
      };

      page.on("request", async (request) => {
        const url = request.url();
        if (url.includes("chatgpt.com") || url.includes("openai.com")) {
          const headers = request.headers();
          const cookie = headers["cookie"];

          if (cookie) {
            const tokenMatch = cookie.match(/__Secure-next-auth\.session-token=([^;]+)/);
            if (tokenMatch) {
              if (!capturedAccessToken) {
                console.log(`[ChatGPT] Captured session token from request.`);
                capturedAccessToken = tokenMatch[1];
              }
              await tryResolve();
            }
          }
        }
      });

      page.on("response", async (response) => {
        const url = response.url();
        if ((url.includes("chatgpt.com") || url.includes("openai.com")) && response.ok()) {
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
