import { chromium } from "playwright-core";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import {
  launchOpenClawChrome,
  stopOpenClawChrome,
  getChromeWebSocketUrl,
} from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";

export interface GlmIntlWebAuthResult {
  cookie: string;
  userAgent: string;
}

export interface GlmIntlWebAuthOptions {
  onProgress?: (message: string) => void;
  openUrl?: (url: string) => Promise<boolean>;
  headless?: boolean;
}

export async function loginGlmIntlWeb(
  options: GlmIntlWebAuthOptions = {},
): Promise<GlmIntlWebAuthResult> {
  const { onProgress = console.log } = options;

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

    onProgress("Navigating to GLM International (chat.z.ai)...");
    await page.goto("https://chat.z.ai/", { waitUntil: "domcontentloaded", timeout: 120000 }); // 2 minutes timeout

    const userAgent = await page.evaluate(() => navigator.userAgent);
    onProgress("Please login to GLM International (chat.z.ai) in the opened browser window...");
    onProgress("Waiting for authentication (checking for login cookies or page change)...");

    // Wait for login - international version might use different indicators
    // Try multiple possible indicators: cookies, URL change, or specific elements
    try {
      await page.waitForFunction(
        () => {
          const cookieStr = document.cookie;
          const currentUrl = window.location.href;

          // Check for various possible authentication cookies
          const hasAuthCookie =
            cookieStr.includes("chatglm_refresh_token") ||
            cookieStr.includes("refresh_token") ||
            cookieStr.includes("auth_token") ||
            cookieStr.includes("access_token") ||
            cookieStr.includes("session") ||
            cookieStr.includes("token");

          // Check if URL changed to indicate logged-in state
          const isLoggedInUrl =
            currentUrl.includes("chat") ||
            currentUrl.includes("conversation") ||
            currentUrl.includes("dashboard") ||
            (!currentUrl.includes("login") && !currentUrl.includes("auth"));

          // Check for chat interface elements
          const hasChatElements =
            document.querySelector(
              'textarea, [contenteditable="true"], .chat-input, .message-input',
            ) !== null;

          return hasAuthCookie || (isLoggedInUrl && hasChatElements);
        },
        { timeout: 600000, polling: 1000 }, // 10 minutes, check every second
      );

      onProgress("Login detected via cookies or page state...");
    } catch (error) {
      onProgress(
        `Login detection timed out or failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      onProgress("Checking if we're already on a logged-in page...");

      // Fallback: check current page state
      const currentUrl = await page.evaluate(() => window.location.href);
      const cookies = await context.cookies("https://chat.z.ai");
      const cookieNames = cookies.map((c) => c.name).join(", ");

      onProgress(`Current URL: ${currentUrl}`);
      onProgress(`Available cookies: ${cookieNames}`);

      if (cookies.length > 0) {
        onProgress("Proceeding with available cookies...");
      } else {
        throw new Error(
          `Login timeout. Please ensure you've logged in to chat.z.ai in the browser window. Available cookies: ${cookieNames || "none"}`,
        );
      }
    }

    onProgress("Capturing cookies...");
    const cookies = await context.cookies("https://chat.z.ai");
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    onProgress("Authentication captured successfully!");

    return { cookie: cookieString, userAgent };
  } finally {
    if (didLaunch && running && "proc" in running) {
      await stopOpenClawChrome(running);
    }
  }
}
