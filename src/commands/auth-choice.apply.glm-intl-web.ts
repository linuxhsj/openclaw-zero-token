import { loginGlmIntlWeb } from "../providers/glm-intl-web-auth.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyGlmIntlWebConfig } from "./onboard-auth.config-core.js";
import { setGlmIntlWebCookie } from "./onboard-auth.credentials.js";
import { openUrl } from "./onboard-helpers.js";

export async function applyAuthChoiceGlmIntlWeb(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "glm-intl-web") {
    return null;
  }

  const { prompter, runtime, config, agentDir, opts } = params;
  let cookie = opts?.glmIntlWebCookie?.trim();

  if (!cookie) {
    const mode = await prompter.select({
      message: "GLM International Auth Mode",
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
        const result = await loginGlmIntlWeb({
          onProgress: (msg) => spin.update(msg),
          openUrl: async (url) => {
            await openUrl(url);
            return true;
          },
        });
        spin.stop("Login captured successfully!");
        const authData = JSON.stringify({ cookie: result.cookie, userAgent: result.userAgent });
        await setGlmIntlWebCookie({ cookie: authData }, agentDir);
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
          "To use GLM International (chat.z.ai), you need authentication cookies.",
          "1. Login to https://chat.z.ai in your browser",
          "2. Open DevTools (F12) -> Application -> Cookies",
          "3. Look for authentication cookies (e.g., chatglm_refresh_token, refresh_token, auth_token, access_token)",
          "4. Copy the cookie value that looks like a token (long random string)",
        ].join("\n"),
        "GLM International Login",
      );
      cookie = await prompter.text({
        message: "Paste authentication cookie value",
        hint: "Look for chatglm_refresh_token, refresh_token, auth_token, etc.",
        placeholder: "...",
        validate: (value) => (value.trim().length > 0 ? undefined : "Required"),
      });
      const authData = JSON.stringify({ cookie, userAgent: "Mozilla/5.0" });
      await setGlmIntlWebCookie({ cookie: authData }, agentDir);
    }
  } else {
    await setGlmIntlWebCookie({ cookie }, agentDir);
  }

  const nextConfig = await applyGlmIntlWebConfig(config);
  return { config: nextConfig };
}
