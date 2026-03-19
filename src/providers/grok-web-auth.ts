import { chromium } from "playwright-core";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import {
  launchOpenClawChrome,
  stopOpenClawChrome,
  getChromeWebSocketUrl,
} from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";

export interface GrokWebAuthResult {
  cookie: string;
  userAgent: string;
}

export interface GrokWebAuthOptions {
  onProgress?: (message: string) => void;
  openUrl?: (url: string) => Promise<boolean>;
  headless?: boolean;
}

export async function loginGrokWeb(options: GrokWebAuthOptions = {}): Promise<GrokWebAuthResult> {
  const { onProgress = console.log, headless = false } = options;

  const rootConfig = loadConfig();
  const browserConfig = resolveBrowserConfig(rootConfig.browser, rootConfig);
  const profile = resolveProfile(browserConfig, browserConfig.defaultProfile);
  if (!profile) {
    throw new Error(`Could not resolve browser profile '${browserConfig.defaultProfile}'`);
  }

  let running: Awaited<ReturnType<typeof launchOpenClawChrome>> | { cdpPort: number };
  let didLaunch = false;

  if (browserConfig.attachOnly) {
    onProgress("Connecting to existing Chrome (attach mode)...");
    const wsUrl = await getChromeWebSocketUrl(profile.cdpUrl, 5000);
    if (!wsUrl) {
      throw new Error(
        `Failed to connect to Chrome at ${profile.cdpUrl}. ` +
          "Make sure Chrome is running in debug mode (./start-chrome-debug.sh)",
      );
    }
    running = { cdpPort: profile.cdpPort };
  } else {
    onProgress("Launching browser...");
    running = await launchOpenClawChrome(browserConfig, profile);
    didLaunch = true;
  }

  try {
    const cdpUrl = browserConfig.attachOnly
      ? profile.cdpUrl
      : `http://127.0.0.1:${running.cdpPort}`;
    let wsUrl: string | null = null;

    onProgress("Waiting for browser debugger...");
    for (let i = 0; i < 10; i++) {
      wsUrl = await getChromeWebSocketUrl(cdpUrl, 2000);
      if (wsUrl) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!wsUrl) {
      throw new Error(`Failed to resolve Chrome WebSocket URL from ${cdpUrl} after retries.`);
    }

    onProgress("Connecting to browser...");
    const browser = await chromium.connectOverCDP(wsUrl, {
      headers: getHeadersWithAuth(wsUrl),
    });
    const context = browser.contexts()[0];
    const page = context.pages()[0] || (await context.newPage());

    onProgress("Navigating to Grok...");
    await page.goto("https://grok.com", { waitUntil: "domcontentloaded" });

    const userAgent = await page.evaluate(() => navigator.userAgent);
    onProgress("Please login to Grok in the opened browser window...");
    onProgress("Waiting for authentication...");

    await page.waitForFunction(
      () => {
        return document.cookie.includes("sso") || document.cookie.includes("_ga");
      },
      { timeout: 300000 },
    );

    onProgress("Login detected, capturing cookies...");
    const cookies = await context.cookies("https://grok.com");
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    onProgress("Authentication captured successfully!");

    return { cookie: cookieString, userAgent };
  } finally {
    if (didLaunch && running && "proc" in running) {
      await stopOpenClawChrome(running);
    }
  }
}
