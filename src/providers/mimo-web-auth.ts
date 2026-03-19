import { EventEmitter } from "events";
// src/providers/mimo-web-auth.ts
import { Browser, Page } from "playwright";

export interface MimoAuthCredentials {
  cookie: string;
  bearer: string;
  userAgent: string;
  sessionId?: string;
}

export async function loginMimoWeb(params: {
  onProgress: (msg: string) => void;
  openUrl: (url: string) => Promise<boolean>;
  browser: Browser;
  page: Page;
}): Promise<MimoAuthCredentials> {
  const { onProgress, openUrl, browser, page } = params;

  return new Promise(async (resolve, reject) => {
    try {
      onProgress("Starting MiMo-Web authentication...");

      // Navigate to MiMo AI Studio
      const loginUrl = "https://aistudio.xiaomimimo.com/";
      onProgress(`Opening ${loginUrl}...`);
      await page.goto(loginUrl, { waitUntil: "networkidle" });

      // Wait for user to login manually (scan QR code or enter credentials)
      onProgress("Please login to MiMo AI Studio in the browser...");
      onProgress("Waiting for login completion...");

      // Monitor network requests to capture authentication tokens
      const credentials = await captureMimoCredentials(page, onProgress);

      if (!credentials) {
        throw new Error("Failed to capture MiMo credentials");
      }

      onProgress("MiMo authentication successful!");
      resolve(credentials);
    } catch (error) {
      onProgress(`MiMo authentication failed: ${error}`);
      reject(error);
    }
  });
}

async function captureMimoCredentials(
  page: Page,
  onProgress: (msg: string) => void,
): Promise<MimoAuthCredentials | null> {
  return new Promise((resolve) => {
    let captured = false;
    const timeout = setTimeout(() => {
      if (!captured) {
        onProgress("Timeout waiting for MiMo login");
        resolve(null);
      }
    }, 300000); // 5 minute timeout

    // Listen for network requests to capture auth tokens
    page.on("request", async (request) => {
      const url = request.url();

      // Look for authentication-related requests
      if (
        url.includes("/api/auth") ||
        url.includes("/api/login") ||
        url.includes("/api/user") ||
        url.includes("/api/session")
      ) {
        try {
          const headers = request.headers();
          const cookie = headers["cookie"] || "";
          const authHeader = headers["authorization"] || "";

          if (cookie || authHeader) {
            onProgress("Capturing MiMo authentication tokens...");

            // Extract bearer token from Authorization header
            let bearer = "";
            if (authHeader.startsWith("Bearer ")) {
              bearer = authHeader.substring(7);
            }

            // Get user agent
            const userAgent = await page.evaluate(() => navigator.userAgent);

            // Try to get session ID from cookies
            let sessionId = "";
            const cookies = await page.context().cookies();
            for (const cookie of cookies) {
              if (
                cookie.name.includes("session") ||
                cookie.name.includes("token") ||
                cookie.name.includes("auth")
              ) {
                sessionId = cookie.value;
                break;
              }
            }

            captured = true;
            clearTimeout(timeout);

            resolve({
              cookie,
              bearer,
              userAgent,
              sessionId,
            });
          }
        } catch (error) {
          // Continue listening
        }
      }
    });

    // Also check if we're already logged in
    page.on("load", async () => {
      try {
        const currentUrl = page.url();
        if (
          currentUrl.includes("aistudio.xiaomimimo.com") &&
          !currentUrl.includes("login") &&
          !currentUrl.includes("auth")
        ) {
          // Check if we can see user-specific elements
          const isLoggedIn = await page.evaluate(() => {
            // Look for indicators of being logged in
            const userElements = document.querySelectorAll(
              '[class*="user"], [class*="avatar"], [class*="profile"], [class*="dashboard"]',
            );
            return userElements.length > 0;
          });

          if (isLoggedIn && !captured) {
            onProgress("Already logged into MiMo, capturing session...");

            const cookies = await page.context().cookies();
            const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
            const userAgent = await page.evaluate(() => navigator.userAgent);

            // Extract any auth tokens from cookies
            let bearer = "";
            let sessionId = "";

            for (const cookie of cookies) {
              if (
                cookie.name.toLowerCase().includes("token") ||
                cookie.name.toLowerCase().includes("bearer")
              ) {
                bearer = cookie.value;
              }
              if (cookie.name.toLowerCase().includes("session")) {
                sessionId = cookie.value;
              }
            }

            captured = true;
            clearTimeout(timeout);

            resolve({
              cookie: cookieString,
              bearer,
              userAgent,
              sessionId,
            });
          }
        }
      } catch (error) {
        // Ignore errors in auto-detection
      }
    });
  });
}
