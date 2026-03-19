import { loginGrokWeb } from "../providers/grok-web-auth.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyGrokWebConfig } from "./onboard-auth.config-core.js";
import { setGrokWebCookie } from "./onboard-auth.credentials.js";
import { openUrl } from "./onboard-helpers.js";

export async function applyAuthChoiceGrokWeb(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "grok-web") {
    return null;
  }

  const { prompter, runtime, config, agentDir, opts } = params;
  let cookie = opts?.grokWebCookie?.trim();

  if (!cookie) {
    const mode = await prompter.select({
      message: "Grok Auth Mode",
      options: [
        {
          value: "auto",
          label: "Automated Login (Recommended)",
          hint: "Opens browser to capture login automatically",
        },
        { value: "manual", label: "Manual Paste", hint: "Paste cookies manually" },
      ],
    });

    if (mode === "auto") {
      const spin = prompter.progress("Preparing automated login...");
      try {
        const result = await loginGrokWeb({
          onProgress: (msg) => spin.update(msg),
          openUrl: async (url) => {
            await openUrl(url);
            return true;
          },
        });
        spin.stop("Login captured successfully!");
        const authData = JSON.stringify({ cookie: result.cookie, userAgent: result.userAgent });
        await setGrokWebCookie({ cookie: authData }, agentDir);
        cookie = authData;
      } catch (err) {
        spin.stop("Automated login failed.");
        runtime.error(String(err));
        const retryManual = await prompter.confirm({
          message: "Would you like to try manual paste instead?",
          initialValue: true,
        });
        if (!retryManual) throw err;
      }
    }

    if (!cookie) {
      await prompter.note(
        [
          "To use Grok Browser, you need cookies from grok.com.",
          "1. Login to https://grok.com in your browser",
          "2. Open DevTools (F12) -> Application -> Cookies",
          "3. Copy all cookies",
        ].join("\n"),
        "Grok Login",
      );
      cookie = await prompter.text({
        message: "Paste cookies",
        hint: "All cookies from grok.com",
        placeholder: "...",
        validate: (value) => (value.trim().length > 0 ? undefined : "Required"),
      });
      const authData = JSON.stringify({ cookie, userAgent: "Mozilla/5.0" });
      await setGrokWebCookie({ cookie: authData }, agentDir);
    }
  } else {
    await setGrokWebCookie({ cookie }, agentDir);
  }

  const nextConfig = await applyGrokWebConfig(config);
  return { config: nextConfig };
}
