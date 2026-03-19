import { loginClaudeWeb } from "../providers/claude-web-auth.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyClaudeWebConfig } from "./onboard-auth.config-core.js";
import { setClaudeWebCookie } from "./onboard-auth.credentials.js";
import { openUrl } from "./onboard-helpers.js";

export async function applyAuthChoiceClaudeWeb(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "claude-web") {
    return null;
  }

  const { prompter, runtime, config, agentDir } = params;

  let sessionKey = "";
  let userAgent = "";
  let organizationId: string | undefined;

  const mode = await prompter.select({
    message: "Claude Auth Mode",
    options: [
      {
        value: "auto",
        label: "Automated Login (Recommended)",
        hint: "Opens browser to capture login automatically",
      },
      {
        value: "manual",
        label: "Manual Paste",
        hint: "Paste sessionKey cookie manually",
      },
    ],
  });

  if (mode === "auto") {
    const spin = prompter.progress("Preparing automated login...");
    try {
      const result = await loginClaudeWeb({
        onProgress: (msg) => spin.update(msg),
        openUrl: async (url) => {
          await openUrl(url);
          return true;
        },
      });
      spin.stop("Login captured successfully!");
      sessionKey = result.sessionKey;
      userAgent = result.userAgent;
      organizationId = result.organizationId;

      await setClaudeWebCookie(
        {
          sessionKey,
          userAgent,
          organizationId,
        },
        agentDir,
      );
    } catch (err) {
      spin.stop("Automated login failed.");
      runtime.error(String(err));
      const retryManual = await prompter.confirm({
        message: "Would you like to try manual paste instead?",
        initialValue: true,
      });
      if (!retryManual) {
        throw err;
      }
      // Fall through to manual mode
    }
  }

  if (!sessionKey) {
    await prompter.note(
      [
        "To use Claude Web manually, you need cookies from claude.ai.",
        "1. Login to https://claude.ai in your browser",
        "2. Open DevTools (F12) -> Network tab",
        "3. Refresh the page and click any request to claude.ai",
        "4. In Request Headers, find 'cookie:' and copy the ENTIRE cookie string",
        "   (It should contain sessionKey and other cookies)",
        "",
        "Alternative: Just copy the sessionKey value from Application -> Cookies",
      ].join("\n"),
      "Claude Login",
    );

    const cookieInput = await prompter.text({
      message: "Paste cookie string or sessionKey",
      hint: "Full cookie string or just sessionKey value",
      placeholder: "sessionKey=sk-ant-sid02-...; other_cookie=...",
      validate: (value) => {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          return "Required";
        }
        // Check if it's a full cookie string or just sessionKey
        if (trimmed.includes("sessionKey=") || trimmed.startsWith("sk-ant-sid")) {
          return undefined;
        }
        return "Must contain sessionKey";
      },
    });

    const trimmed = cookieInput.trim();

    // Determine if it's a full cookie string or just sessionKey
    let fullCookie: string;
    if (trimmed.startsWith("sk-ant-sid")) {
      // Just sessionKey value
      sessionKey = trimmed;
      fullCookie = `sessionKey=${sessionKey}`;
    } else {
      // Full cookie string
      fullCookie = trimmed;
      const match = fullCookie.match(/sessionKey=([^;]+)/);
      if (match) {
        sessionKey = match[1];
      } else {
        throw new Error("Could not find sessionKey in cookie string");
      }
    }

    userAgent =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    await setClaudeWebCookie({ sessionKey, cookie: fullCookie, userAgent }, agentDir);
  }

  const nextConfig = await applyClaudeWebConfig(config);

  return { config: nextConfig };
}
