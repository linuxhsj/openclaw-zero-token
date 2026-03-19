import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import {
  launchOpenClawChrome,
  stopOpenClawChrome,
  getChromeWebSocketUrl,
  isChromeReachable,
} from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";

export interface DoubaoAuth {
  sessionid: string;
  ttwid?: string;
  userAgent: string;
  cookie?: string;
}

const DEFAULT_CDP_PORT = 9222;

export async function loginDoubaoWeb(params: {
  onProgress: (msg: string) => void;
  openUrl: (url: string) => Promise<boolean>;
  useExistingChrome?: boolean;
  existingCdpPort?: number;
  useExistingChromeData?: boolean;
}) {
  const {
    useExistingChrome = false,
    existingCdpPort = DEFAULT_CDP_PORT,
    useExistingChromeData = false,
  } = params;

  const rootConfig = loadConfig();
  const browserConfig = resolveBrowserConfig(rootConfig.browser, rootConfig);
  const profile = resolveProfile(browserConfig, browserConfig.defaultProfile);
  if (!profile) {
    throw new Error(`Could not resolve browser profile '${browserConfig.defaultProfile}'`);
  }

  const useAttach = browserConfig.attachOnly || useExistingChrome;

  let running: Awaited<ReturnType<typeof launchOpenClawChrome>> | { cdpPort: number };
  let didLaunch = false;

  if (useAttach) {
    const cdpUrl = browserConfig.attachOnly
      ? profile.cdpUrl
      : `http://127.0.0.1:${existingCdpPort}`;
    params.onProgress(`Connecting to existing Chrome at ${cdpUrl}...`);

    const isReachable = await isChromeReachable(cdpUrl, 1000);
    if (!isReachable) {
      throw new Error(
        `Cannot connect to Chrome at ${cdpUrl}. ` +
          "Make sure Chrome is running in debug mode (./start-chrome-debug.sh)",
      );
    }

    running = { cdpPort: browserConfig.attachOnly ? profile.cdpPort : existingCdpPort };
  } else if (useExistingChromeData) {
    params.onProgress("Launching Chrome with existing user data...");

    const existingUserDataDir = path.join(
      os.homedir(),
      "Library/Application Support/Google/Chrome",
    );

    const modifiedConfig = {
      ...browserConfig,
      userDataDir: existingUserDataDir,
    };

    running = await launchOpenClawChrome(modifiedConfig, profile);
    didLaunch = true;
  } else {
    params.onProgress("Launching browser...");
    running = await launchOpenClawChrome(browserConfig, profile);
    didLaunch = true;
  }

  try {
    const cdpUrl = useAttach
      ? browserConfig.attachOnly
        ? profile.cdpUrl
        : `http://127.0.0.1:${existingCdpPort}`
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

    await page.goto("https://www.doubao.com/chat/");
    const userAgent = await page.evaluate(() => navigator.userAgent);

    params.onProgress("Please login to Doubao in the opened browser window...");

    return await new Promise<DoubaoAuth>((resolve, reject) => {
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
          const cookies = await context.cookies(["https://www.doubao.com", "https://doubao.com"]);
          if (cookies.length === 0) {
            console.log(`[Doubao] No cookies found in context yet.`);
            return;
          }

          const cookieNames = cookies.map((c) => c.name);
          console.log(`[Doubao] Found cookies: ${cookieNames.join(", ")}`);

          const sessionidCookie = cookies.find((c) => c.name === "sessionid");
          const ttwidCookie = cookies.find((c) => c.name === "ttwid");
          const fpCookie = cookies.find((c) => c.name === "s_v_web_id");

          if (sessionidCookie) {
            resolved = true;
            clearTimeout(timeout);
            console.log(`[Doubao] sessionid captured!`);

            const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

            resolve({
              sessionid: sessionidCookie.value,
              ttwid: ttwidCookie?.value,
              userAgent,
              cookie: cookieString,
            });
          } else {
            console.log(`[Doubao] Waiting for sessionid cookie...`);
          }
        } catch (e: unknown) {
          console.error(`[Doubao] Failed to fetch cookies: ${String(e)}`);
        }
      };

      page.on("request", async (request) => {
        const url = request.url();
        if (url.includes("doubao.com")) {
          const headers = request.headers();
          if (headers["cookie"]?.includes("sessionid")) {
            console.log(`[Doubao] Found sessionid in request cookie.`);
            await tryResolve();
          }
        }
      });

      page.on("response", async (response) => {
        const url = response.url();
        if (url.includes("doubao.com") && response.ok()) {
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
