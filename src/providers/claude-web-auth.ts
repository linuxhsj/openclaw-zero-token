import { chromium } from "playwright-core";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import {
  launchOpenClawChrome,
  stopOpenClawChrome,
  getChromeWebSocketUrl,
} from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";

export interface ClaudeWebAuth {
  sessionKey: string;
  cookie: string;
  userAgent: string;
  organizationId?: string;
}

export async function loginClaudeWeb(params: {
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

    await page.goto("https://claude.ai/");
    const userAgent = await page.evaluate(() => navigator.userAgent);

    params.onProgress("Please login to Claude in the opened browser window...");

    return await new Promise<ClaudeWebAuth>((resolve, reject) => {
      let capturedSessionKey: string | undefined;
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
          const cookies = await context.cookies(["https://claude.ai", "https://www.claude.ai"]);
          if (cookies.length === 0) {
            console.log(`[Claude] No cookies found in context yet.`);
            return;
          }

          const cookieNames = cookies.map((c: { name: string }) => c.name);
          console.log(`[Claude] Found cookies: ${cookieNames.join(", ")}`);

          // Look for sessionKey cookie (sk-ant-sid01-xxx or sk-ant-sid02-xxx format)
          const sessionKeyCookie = cookies.find(
            (c: { name: string; value: string }) =>
              c.name === "sessionKey" ||
              c.value.startsWith("sk-ant-sid01-") ||
              c.value.startsWith("sk-ant-sid02-"),
          );

          if (sessionKeyCookie || capturedSessionKey) {
            const finalSessionKey = capturedSessionKey || sessionKeyCookie?.value || "";

            if (
              finalSessionKey.startsWith("sk-ant-sid01-") ||
              finalSessionKey.startsWith("sk-ant-sid02-")
            ) {
              resolved = true;
              clearTimeout(timeout);
              console.log(`[Claude] sessionKey captured!`);

              const cookieString = cookies
                .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
                .join("; ");

              resolve({
                sessionKey: finalSessionKey,
                cookie: cookieString,
                userAgent,
              });
            } else {
              console.log(
                `[Claude] Waiting for valid sessionKey (sk-ant-sid01-xxx or sk-ant-sid02-xxx format)...`,
              );
            }
          } else {
            console.log(`[Claude] Waiting for sessionKey cookie...`);
          }
        } catch (e: unknown) {
          console.error(`[Claude] Failed to fetch cookies: ${String(e)}`);
        }
      };

      page.on(
        "request",
        async (request: { url: () => string; headers: () => Record<string, string> }) => {
          const url = request.url();
          if (url.includes("claude.ai")) {
            const headers = request.headers();
            const cookie = headers["cookie"];

            // Try to extract sessionKey from cookie header
            if (cookie) {
              const sessionKeyMatch = cookie.match(/sessionKey=([^;]+)/);
              if (
                sessionKeyMatch &&
                (sessionKeyMatch[1].startsWith("sk-ant-sid01-") ||
                  sessionKeyMatch[1].startsWith("sk-ant-sid02-"))
              ) {
                if (!capturedSessionKey) {
                  console.log(`[Claude] Captured sessionKey from request.`);
                  capturedSessionKey = sessionKeyMatch[1];
                }
                await tryResolve();
              }
            }
          }
        },
      );

      page.on("response", async (response: { url: () => string; ok: () => boolean }) => {
        const url = response.url();
        if (url.includes("claude.ai") && response.ok()) {
          await tryResolve();
        }
      });

      page.on("close", () => {
        reject(new Error("Browser window closed before login was captured."));
      });

      // Periodic check
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
