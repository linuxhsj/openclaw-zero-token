import { chromium } from "playwright-core";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import {
  launchOpenClawChrome,
  stopOpenClawChrome,
  getChromeWebSocketUrl,
} from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";

export interface QwenCNWebAuthResult {
  cookie: string;
  xsrfToken: string;
  userAgent: string;
  ut?: string;
}

export async function loginQwenCNWeb(params: {
  onProgress: (msg: string) => void;
  openUrl: (url: string) => Promise<boolean>;
}): Promise<QwenCNWebAuthResult> {
  const { onProgress } = params;

  const rootConfig = loadConfig();
  const browserConfig = resolveBrowserConfig(rootConfig.browser, rootConfig);
  const profile = resolveProfile(browserConfig, browserConfig.defaultProfile);
  if (!profile) {
    throw new Error(`Could not resolve browser profile '${browserConfig.defaultProfile}'`);
  }

  let running: Awaited<ReturnType<typeof launchOpenClawChrome>> | { cdpPort: number };
  let didLaunch = false;

  const wsUrl = await getChromeWebSocketUrl(profile.cdpUrl, 5000);
  if (wsUrl) {
    browserConfig.attachOnly = true;
  } else {
    browserConfig.attachOnly = false;
  }

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

    const cdpUrl = browserConfig.attachOnly ? profile.cdpUrl : `http://127.0.0.1:${running.cdpPort}`;
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

    onProgress("Connecting to Chrome debug port...");

    const browser = await chromium.connectOverCDP(wsUrl, {
      headers: getHeadersWithAuth(wsUrl),
      timeout: 60_000, // 60s，Chrome 多标签或复杂页面时 CDP 握手可能较慢
    });
    const context = browser.contexts()[0];

    onProgress("Opening Qwen CN (qianwen.com)...");

    let page = context.pages().find((p) => p.url().includes("qianwen.com"));
    if (!page) {
      page = await context.newPage();
      await page.goto("https://www.qianwen.com/", { waitUntil: "domcontentloaded" });
    }

    onProgress("Waiting for login... Please login in the browser");

    // Wait for login by checking for session cookies
    let cookie = "";
    let xsrfToken = "";
    let ut = "";

    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 1000));

      const cookies = await context.cookies();
      const sessionCookie = cookies.find(
        (c) => c.name === "tongyi_sso_ticket" || c.name === "login_aliyunid_ticket",
      );

      if (sessionCookie) {
        // 只取域名为 .qianwen.com 的 cookies
        cookie = cookies
          .filter((c) => c.domain?.includes('qianwen.com'))
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");

        // Try to get xsrf token from page
        try {
          const tokenFromPage = await page.evaluate(() => {
            const meta = document.querySelector('meta[name="x-xsrf-token"]');
            return meta?.getAttribute("content") || "";
          });
          xsrfToken = tokenFromPage;
        } catch {
          // Fallback: extract from cookie
          const xsrfCookie = cookies.find((c) => c.name === "XSRF-TOKEN");
          if (xsrfCookie) {
            xsrfToken = xsrfCookie.value;
          }
        }

        // Extract ut (user token)
        const utCookie = cookies.find((c) => c.name === "b-user-id");
        if (utCookie) {
          ut = utCookie.value;
        }

        onProgress("Login detected! Capturing credentials...");
        break;
      }

      if (i % 10 === 0) {
        onProgress(`Waiting for login... (${i}s)`);
      }
    }

    if (!cookie) {
      throw new Error("Login timeout. Please login within 2 minutes.");
    }

    const userAgent = await page.evaluate(() => navigator.userAgent);

    await browser.close();

    onProgress("Credentials captured successfully!");

    return {
      cookie,
      xsrfToken,
      userAgent,
      ut,
    };
  } finally {
    if (didLaunch && running && "proc" in running) {
      await stopOpenClawChrome(running);
    }
  }
}
