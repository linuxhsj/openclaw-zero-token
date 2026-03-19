import { loginDeepseekWeb, loginDeepseekWebAttachOnly } from "../providers/deepseek-web-auth.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyDeepseekWebConfig } from "./onboard-auth.config-core.js";
import { setDeepseekWebCookie } from "./onboard-auth.credentials.js";
import { openUrl } from "./onboard-helpers.js";

export async function applyAuthChoiceDeepseekWeb(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "deepseek-web") {
    return null;
  }

  const { prompter, runtime, config, agentDir, opts } = params;

  let cookie = opts?.deepseekWebCookie?.trim();
  let bearer = "";

  if (!cookie) {
    const mode = await prompter.select({
      message: "DeepSeek Auth Mode",
      options: [
        {
          value: "attach",
          label: "Attach to Existing Browser (Recommended)",
          hint: "Use already-debugged Chrome, opens DeepSeek if needed",
        },
        {
          value: "auto",
          label: "Automated Login",
          hint: "Launch new browser to capture login",
        },
        {
          value: "manual",
          label: "Manual Paste",
          hint: "Paste Cookie and Bearer headers manually",
        },
      ],
    });

    if (mode === "attach") {
      const spin = prompter.progress("Connecting to existing Chrome...");
      try {
        const result = await loginDeepseekWebAttachOnly({
          onProgress: (msg) => spin.update(msg),
        });
        spin.stop("Login captured successfully!");
        cookie = result.cookie;
        bearer = result.bearer;
        await setDeepseekWebCookie(
          { cookie, bearer: bearer.trim() || undefined, userAgent: result.userAgent },
          agentDir,
        );
      } catch (err) {
        spin.stop("Attach login failed.");
        runtime.error(String(err));
        const retryManual = await prompter.confirm({
          message: "Would you like to try manual paste instead?",
          initialValue: true,
        });
        if (!retryManual) {
          throw err;
        }
        // Fall through to manual
      }
    } else if (mode === "auto") {
      const spin = prompter.progress("Preparing automated login...");
      try {
        const result = await loginDeepseekWeb({
          onProgress: (msg) => spin.update(msg),
          openUrl: async (url) => {
            await openUrl(url);
            return true;
          },
        });
        spin.stop("Login captured successfully!");
        cookie = result.cookie;
        bearer = result.bearer;
        // Store userAgent from capture
        await setDeepseekWebCookie(
          { cookie, bearer: bearer.trim() || undefined, userAgent: result.userAgent },
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
        // Fall through to manual
      }
    }

    if (!cookie) {
      await prompter.note(
        [
          "To use DeepSeek Browser manually, you need a session cookie from chat.deepseek.com.",
          "1. Login to https://chat.deepseek.com",
          "2. Open DevTools (F12) -> Network tab",
          "3. Look for a request to '/api/v0/chat/completion'",
          "4. Copy the whole 'Cookie' and 'Authorization' headers.",
        ].join("\n"),
        "DeepSeek Login",
      );

      const rawInput = await prompter.text({
        message: "Paste Cookie / Headers",
        hint: "Paste the 'Cookie:' value or multiple headers. I'll try to parse them.",
        placeholder: "lpk3-app-session-id=...; ds_session_id=...",
        validate: (value) => (value.trim().length > 0 ? undefined : "Required"),
      });

      // Smart-ish parsing
      const lines = rawInput.split("\n");
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.startsWith("cookie:")) {
          cookie = line.slice(7).trim();
        } else if (lower.startsWith("authorization:")) {
          const val = line.slice(14).trim();
          if (val.toLowerCase().startsWith("bearer ")) {
            bearer = val.slice(7).trim();
          }
        } else if (line.includes("=") && line.includes(";")) {
          if (!cookie) {
            cookie = line.trim();
          }
        }
      }

      if (!cookie) {
        cookie = rawInput.trim();
      }

      if (!bearer) {
        const bearerMatch = rawInput.match(/bearer\s+([a-zA-Z0-9.\-_/]+)/i);
        if (bearerMatch) {
          bearer = bearerMatch[1];
        }
      }

      if (!bearer) {
        bearer = await prompter.text({
          message: "Authorization Bearer (Optional)",
          hint: "If you have a 'Bearer ...' token from the headers, paste it here.",
          placeholder: "Optional",
        });
      }

      await setDeepseekWebCookie({ cookie, bearer: bearer.trim() || undefined }, agentDir);
    }
  } else {
    await setDeepseekWebCookie({ cookie, bearer: bearer.trim() || undefined }, agentDir);
  }

  const nextConfig = await applyDeepseekWebConfig(config);

  return { config: nextConfig };
}
