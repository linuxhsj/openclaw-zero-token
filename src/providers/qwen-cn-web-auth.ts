import { chromium } from "playwright-core";

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

  onProgress("Connecting to Chrome debug port...");

  const cdpUrl = "http://127.0.0.1:9222";
  let browser;

  try {
    const response = await fetch(`${cdpUrl}/json/version`);
    const versionInfo = await response.json();
    const wsUrl = versionInfo.webSocketDebuggerUrl;

    browser = await chromium.connectOverCDP(wsUrl);
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
        cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

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
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}
