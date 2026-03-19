import { loginZWeb } from "../providers/glm-web-auth.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyGlmWebConfig } from "./onboard-auth.config-core.js";
import { setZWebCookie } from "./onboard-auth.credentials.js";
import { openUrl } from "./onboard-helpers.js";

export async function applyAuthChoiceZWeb(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "glm-web") {
    return null;
  }

  const { prompter, runtime, config, agentDir, opts } = params;
  let cookie = opts?.zWebCookie?.trim();

  if (!cookie) {
    const mode = await prompter.select({
      message: "ChatGLM Auth Mode",
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
        const result = await loginZWeb({
          onProgress: (msg) => spin.update(msg),
          openUrl: async (url) => {
            await openUrl(url);
            return true;
          },
        });
        spin.stop("Login captured successfully!");
        const authData = JSON.stringify({ cookie: result.cookie, userAgent: result.userAgent });
        await setZWebCookie({ cookie: authData }, agentDir);
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
          "To use ChatGLM (智谱清言), you need the chatglm_refresh_token cookie.",
          "1. Login to https://chatglm.cn in your browser",
          "2. Open DevTools (F12) -> Application -> Cookies",
          "3. Find and copy the chatglm_refresh_token value",
        ].join("\n"),
        "ChatGLM Login",
      );
      cookie = await prompter.text({
        message: "Paste chatglm_refresh_token",
        hint: "chatglm_refresh_token from chatglm.cn",
        placeholder: "...",
        validate: (value) => (value.trim().length > 0 ? undefined : "Required"),
      });
      const authData = JSON.stringify({ cookie, userAgent: "Mozilla/5.0" });
      await setZWebCookie({ cookie: authData }, agentDir);
    }
  } else {
    await setZWebCookie({ cookie }, agentDir);
  }

  const nextConfig = await applyGlmWebConfig(config);
  return { config: nextConfig };
}
