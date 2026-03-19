import { resolveEnvApiKey } from "../agents/model-auth.js";
import { MANUS_API_DEFAULT_MODEL_REF } from "../agents/models-config.providers.js";
import {
  formatApiKeyPreview,
  normalizeApiKeyInput,
  validateApiKeyInput,
} from "./auth-choice.api-key.js";
import { createAuthChoiceAgentModelNoter } from "./auth-choice.apply-helpers.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyDefaultModelChoice } from "./auth-choice.default-model.js";
import { setManusApiKey } from "./onboard-auth.credentials.js";
import {
  applyAuthProfileConfig,
  applyManusApiConfig,
  applyManusApiProviderConfig,
} from "./onboard-auth.js";

export async function applyAuthChoiceManusApi(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "manus-api-key") {
    return null;
  }

  let nextConfig = params.config;
  let agentModelOverride: string | undefined;
  const noteAgentModel = createAuthChoiceAgentModelNoter(params);

  let hasCredential = false;
  const optsKey = params.opts?.manusApiKey?.trim();
  if (optsKey) {
    await setManusApiKey(normalizeApiKeyInput(optsKey), params.agentDir);
    hasCredential = true;
  }

  if (!hasCredential) {
    const envKey = resolveEnvApiKey("manus-api");
    if (envKey) {
      const useExisting = await params.prompter.confirm({
        message: `Use existing MANUS_API_KEY (${envKey.source}, ${formatApiKeyPreview(envKey.apiKey)})?`,
        initialValue: true,
      });
      if (useExisting) {
        await setManusApiKey(envKey.apiKey, params.agentDir);
        hasCredential = true;
      }
    }
  }

  if (!hasCredential) {
    await params.prompter.note(
      "Manus API uses Credit-based billing with a free tier.\nGet your API key from https://open.manus.im",
      "Manus API",
    );
    const key = await params.prompter.text({
      message: "Enter Manus API key",
      validate: validateApiKeyInput,
    });
    await setManusApiKey(normalizeApiKeyInput(String(key)), params.agentDir);
  }

  nextConfig = applyAuthProfileConfig(nextConfig, {
    profileId: "manus-api:default",
    provider: "manus-api",
    mode: "api_key",
  });
  {
    const applied = await applyDefaultModelChoice({
      config: nextConfig,
      setDefaultModel: params.setDefaultModel,
      defaultModel: MANUS_API_DEFAULT_MODEL_REF,
      applyDefaultConfig: applyManusApiConfig,
      applyProviderConfig: applyManusApiProviderConfig,
      noteDefault: MANUS_API_DEFAULT_MODEL_REF,
      noteAgentModel,
      prompter: params.prompter,
    });
    nextConfig = applied.config;
    agentModelOverride = applied.agentModelOverride ?? agentModelOverride;
  }

  return { config: nextConfig, agentModelOverride };
}
