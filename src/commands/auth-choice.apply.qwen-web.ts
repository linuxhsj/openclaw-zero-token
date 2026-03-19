import { loginQwenWeb } from "../providers/qwen-web-auth.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyQwenWebConfig } from "./onboard-auth.config-core.js";
import { setQwenWebCookie } from "./onboard-auth.credentials.js";
import { openUrl } from "./onboard-helpers.js";

export async function applyAuthChoiceQwenWeb(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "qwen-web") {
    return null;
  }

  const { prompter, runtime, config, agentDir, opts } = params;

  let cookie = opts?.qwenWebCookie?.trim();

  if (!cookie) {
    const mode = await prompter.select({
      message: "Qwen Auth Mode",
      options: [
        {
          value: "auto",
          label: "Automated Login (Recommended)",
          hint: "Opens browser to capture login automatically",
        },
        {
          value: "manual",
          label: "Manual Paste",
          hint: "Paste cookies manually",
        },
      ],
    });

    if (mode === "auto") {
      const spin = prompter.progress("Preparing automated login...");
      try {
        const result = await loginQwenWeb({
          onProgress: (msg) => spin.update(msg),
          openUrl: async (url) => {
            await openUrl(url);
            return true;
          },
        });
        spin.stop("Login captured successfully!");
        const authData = JSON.stringify({
          cookie: result.cookie,
          userAgent: result.userAgent,
        });
        await setQwenWebCookie({ cookie: authData }, agentDir);
        cookie = authData;
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

    if (!cookie) {
      await prompter.note(
        [
          "To use Qwen Browser, you need cookies from chat.qwen.ai.",
          "1. Login to https://chat.qwen.ai/ in your browser",
          "2. Open DevTools (F12) -> Application -> Cookies",
          "3. Copy all cookies as a single string",
        ].join("\n"),
        "Qwen Login",
      );

      cookie = await prompter.text({
        message: "Paste cookies",
        hint: "All cookies from chat.qwen.ai",
        placeholder: "...",
        validate: (value) => (value.trim().length > 0 ? undefined : "Required"),
      });

      const authData = JSON.stringify({
        cookie,
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
      await setQwenWebCookie({ cookie: authData }, agentDir);
    }
  } else {
    await setQwenWebCookie({ cookie }, agentDir);
  }

  const nextConfig = await applyQwenWebConfig(config);
  return { config: nextConfig };
}
