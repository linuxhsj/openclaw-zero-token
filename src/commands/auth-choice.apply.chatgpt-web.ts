import { loginChatGPTWeb } from "../providers/chatgpt-web-auth.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyChatGPTWebConfig } from "./onboard-auth.config-core.js";
import { setChatGPTWebCookie } from "./onboard-auth.credentials.js";
import { openUrl } from "./onboard-helpers.js";

export async function applyAuthChoiceChatGPTWeb(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "chatgpt-web") {
    return null;
  }

  const { prompter, runtime, config, agentDir, opts } = params;

  let accessToken = opts?.chatgptWebCookie?.trim();

  if (!accessToken) {
    const mode = await prompter.select({
      message: "ChatGPT Auth Mode",
      options: [
        {
          value: "auto",
          label: "Automated Login (Recommended)",
          hint: "Opens browser to capture login automatically",
        },
        {
          value: "manual",
          label: "Manual Paste",
          hint: "Paste session token manually",
        },
      ],
    });

    if (mode === "auto") {
      const spin = prompter.progress("Preparing automated login...");
      try {
        const result = await loginChatGPTWeb({
          onProgress: (msg) => spin.update(msg),
          openUrl: async (url) => {
            await openUrl(url);
            return true;
          },
        });
        spin.stop("Login captured successfully!");
        accessToken = result.accessToken;
        const authData = JSON.stringify({
          accessToken: result.accessToken,
          cookie: result.cookie,
          userAgent: result.userAgent,
        });
        await setChatGPTWebCookie({ cookie: authData }, agentDir);
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
      }
    }

    if (!accessToken) {
      await prompter.note(
        [
          "To use ChatGPT Browser, you need the session token from chatgpt.com.",
          "1. Login to https://chatgpt.com/ in your browser",
          "2. Open DevTools (F12) -> Application -> Cookies",
          "3. Find and copy the '__Secure-next-auth.session-token' cookie value",
        ].join("\n"),
        "ChatGPT Login",
      );

      accessToken = await prompter.text({
        message: "Paste session token",
        hint: "The __Secure-next-auth.session-token value from cookies",
        placeholder: "...",
        validate: (value) => (value.trim().length > 0 ? undefined : "Required"),
      });

      const authData = JSON.stringify({
        accessToken,
        cookie: `__Secure-next-auth.session-token=${accessToken}`,
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
      await setChatGPTWebCookie({ cookie: authData }, agentDir);
    }
  } else {
    await setChatGPTWebCookie({ cookie: accessToken }, agentDir);
  }

  const nextConfig = await applyChatGPTWebConfig(config);
  return { config: nextConfig };
}
