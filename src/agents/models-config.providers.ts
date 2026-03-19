import type { OpenClawConfig } from "../config/config.js";
import type { ModelDefinitionConfig } from "../config/types.models.js";
import { resolvePluginProviders } from "../plugins/providers.js";
import {
  DEFAULT_COPILOT_API_BASE_URL,
  resolveCopilotApiToken,
} from "../providers/github-copilot-token.js";
import { ensureAuthProfileStore, listProfilesForProvider } from "./auth-profiles.js";
import { discoverBedrockModels } from "./bedrock-discovery.js";
import {
  buildCloudflareAiGatewayModelDefinition,
  resolveCloudflareAiGatewayBaseUrl,
} from "./cloudflare-ai-gateway.js";
import {
  discoverHuggingfaceModels,
  HUGGINGFACE_BASE_URL,
  HUGGINGFACE_MODEL_CATALOG,
  buildHuggingfaceModelDefinition,
} from "./huggingface-models.js";
import { resolveAwsSdkEnvVarName, resolveEnvApiKey } from "./model-auth.js";
import { OLLAMA_NATIVE_BASE_URL } from "./ollama-stream.js";
import {
  discoverSiliconFlowModels,
  SILICONFLOW_GLOBAL_BASE_URL,
  SILICONFLOW_CN_BASE_URL,
} from "./siliconflow-models.js";
import {
  buildSyntheticModelDefinition,
  SYNTHETIC_BASE_URL,
  SYNTHETIC_MODEL_CATALOG,
} from "./synthetic-models.js";
import {
  TOGETHER_BASE_URL,
  TOGETHER_MODEL_CATALOG,
  buildTogetherModelDefinition,
} from "./together-models.js";
import { discoverVeniceModels, VENICE_BASE_URL } from "./venice-models.js";

type ModelsConfig = NonNullable<OpenClawConfig["models"]>;
export type ProviderConfig = NonNullable<ModelsConfig["providers"]>[string];

const MINIMAX_PORTAL_BASE_URL = "https://api.minimax.io/anthropic";
const MINIMAX_DEFAULT_MODEL_ID = "MiniMax-M2.1";
const MINIMAX_DEFAULT_VISION_MODEL_ID = "MiniMax-VL-01";
const MINIMAX_DEFAULT_CONTEXT_WINDOW = 200000;
const MINIMAX_DEFAULT_MAX_TOKENS = 8192;
const MINIMAX_OAUTH_PLACEHOLDER = "minimax-oauth";
// Pricing: MiniMax doesn't publish public rates. Override in models.json for accurate costs.
const MINIMAX_API_COST = {
  input: 15,
  output: 60,
  cacheRead: 2,
  cacheWrite: 10,
};

type ProviderModelConfig = NonNullable<ProviderConfig["models"]>[number];

function buildMinimaxModel(params: {
  id: string;
  name: string;
  reasoning: boolean;
  input: ProviderModelConfig["input"];
}): ProviderModelConfig {
  return {
    id: params.id,
    name: params.name,
    reasoning: params.reasoning,
    input: params.input,
    cost: MINIMAX_API_COST,
    contextWindow: MINIMAX_DEFAULT_CONTEXT_WINDOW,
    maxTokens: MINIMAX_DEFAULT_MAX_TOKENS,
  };
}

function buildMinimaxTextModel(params: {
  id: string;
  name: string;
  reasoning: boolean;
}): ProviderModelConfig {
  return buildMinimaxModel({ ...params, input: ["text"] });
}

const XIAOMI_BASE_URL = "https://api.xiaomimimo.com/anthropic";
export const XIAOMI_DEFAULT_MODEL_ID = "mimo-v2-flash";
const XIAOMI_DEFAULT_CONTEXT_WINDOW = 262144;
const XIAOMI_DEFAULT_MAX_TOKENS = 8192;
const XIAOMI_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const MOONSHOT_BASE_URL = "https://api.moonshot.ai/v1";
const MOONSHOT_DEFAULT_MODEL_ID = "kimi-k2.5";
const MOONSHOT_DEFAULT_CONTEXT_WINDOW = 256000;
const MOONSHOT_DEFAULT_MAX_TOKENS = 8192;
const MOONSHOT_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const QWEN_PORTAL_BASE_URL = "https://portal.qwen.ai/v1";
const QWEN_PORTAL_OAUTH_PLACEHOLDER = "qwen-oauth";
const QWEN_PORTAL_DEFAULT_CONTEXT_WINDOW = 128000;
const QWEN_PORTAL_DEFAULT_MAX_TOKENS = 8192;
const QWEN_PORTAL_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const OLLAMA_BASE_URL = OLLAMA_NATIVE_BASE_URL;
const OLLAMA_API_BASE_URL = OLLAMA_BASE_URL;
const OLLAMA_DEFAULT_CONTEXT_WINDOW = 128000;
const OLLAMA_DEFAULT_MAX_TOKENS = 8192;
const OLLAMA_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const VLLM_BASE_URL = "http://127.0.0.1:8000/v1";
const VLLM_DEFAULT_CONTEXT_WINDOW = 128000;
const VLLM_DEFAULT_MAX_TOKENS = 8192;
const VLLM_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const QIANFAN_BASE_URL = "https://qianfan.baidubce.com/v2";
export const QIANFAN_DEFAULT_MODEL_ID = "deepseek-v3.2";
const QIANFAN_DEFAULT_CONTEXT_WINDOW = 98304;
const QIANFAN_DEFAULT_MAX_TOKENS = 32768;
const QIANFAN_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const DEEPSEEK_WEB_BASE_URL = "https://chat.deepseek.com";
export const DEEPSEEK_WEB_DEFAULT_MODEL_ID = "deepseek-chat";
const DEEPSEEK_WEB_DEFAULT_CONTEXT_WINDOW = 64000;
const DEEPSEEK_WEB_DEFAULT_MAX_TOKENS = 8192;
const DEEPSEEK_WEB_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const DOUBAO_WEB_BASE_URL = "https://www.doubao.com";
export const DOUBAO_WEB_DEFAULT_MODEL_ID = "doubao-seed-2.0";
const DOUBAO_WEB_DEFAULT_CONTEXT_WINDOW = 64000;
const DOUBAO_WEB_DEFAULT_MAX_TOKENS = 8192;
const DOUBAO_WEB_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const CLAUDE_WEB_BASE_URL = "https://claude.ai";
export const CLAUDE_WEB_DEFAULT_MODEL_ID = "claude-sonnet-4-6";
const CLAUDE_WEB_DEFAULT_CONTEXT_WINDOW = 200000;
const CLAUDE_WEB_DEFAULT_MAX_TOKENS = 8192;
const CLAUDE_WEB_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const CHATGPT_WEB_BASE_URL = "https://chatgpt.com";
export const CHATGPT_WEB_DEFAULT_MODEL_ID = "gpt-4";
const CHATGPT_WEB_DEFAULT_CONTEXT_WINDOW = 128000;
const CHATGPT_WEB_DEFAULT_MAX_TOKENS = 4096;
const CHATGPT_WEB_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const QWEN_WEB_BASE_URL = "https://chat.qwen.ai";
export const QWEN_WEB_DEFAULT_MODEL_ID = "qwen-max";
const QWEN_WEB_DEFAULT_CONTEXT_WINDOW = 32000;
const QWEN_WEB_DEFAULT_MAX_TOKENS = 8192;
const QWEN_WEB_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const KIMI_WEB_BASE_URL = "https://www.kimi.com";
export const KIMI_WEB_DEFAULT_MODEL_ID = "moonshot-v1-32k";
const KIMI_WEB_DEFAULT_CONTEXT_WINDOW = 32000;
const KIMI_WEB_DEFAULT_MAX_TOKENS = 4096;
const KIMI_WEB_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const GEMINI_WEB_BASE_URL = "https://gemini.google.com";
export const GEMINI_WEB_DEFAULT_MODEL_ID = "gemini-pro";
const GEMINI_WEB_DEFAULT_CONTEXT_WINDOW = 32000;
const GEMINI_WEB_DEFAULT_MAX_TOKENS = 8192;
const GEMINI_WEB_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const GROK_WEB_BASE_URL = "https://grok.com";
export const GROK_WEB_DEFAULT_MODEL_ID = "grok-2";
const GROK_WEB_DEFAULT_CONTEXT_WINDOW = 32000;
const GROK_WEB_DEFAULT_MAX_TOKENS = 4096;
const GROK_WEB_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const Z_WEB_BASE_URL = "https://chatglm.cn";
export const Z_WEB_DEFAULT_MODEL_ID = "glm-4-plus";
const Z_WEB_DEFAULT_CONTEXT_WINDOW = 128000;
const Z_WEB_DEFAULT_MAX_TOKENS = 4096;
const Z_WEB_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const GLM_INTL_WEB_BASE_URL = "https://chat.z.ai";
export const GLM_INTL_WEB_DEFAULT_MODEL_ID = "glm-4-plus";
const GLM_INTL_WEB_DEFAULT_CONTEXT_WINDOW = 128000;
const GLM_INTL_WEB_DEFAULT_MAX_TOKENS = 4096;
const GLM_INTL_WEB_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NVIDIA_DEFAULT_MODEL_ID = "nvidia/llama-3.1-nemotron-70b-instruct";
const NVIDIA_DEFAULT_CONTEXT_WINDOW = 131072;
const NVIDIA_DEFAULT_MAX_TOKENS = 4096;
const NVIDIA_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    family?: string;
    parameter_size?: string;
  };
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

type VllmModelsResponse = {
  data?: Array<{
    id?: string;
  }>;
};

/**
 * Derive the Ollama native API base URL from a configured base URL.
 *
 * Users typically configure `baseUrl` with a `/v1` suffix (e.g.
 * `http://192.168.20.14:11434/v1`) for the OpenAI-compatible endpoint.
 * The native Ollama API lives at the root (e.g. `/api/tags`), so we
 * strip the `/v1` suffix when present.
 */
export function resolveOllamaApiBase(configuredBaseUrl?: string): string {
  if (!configuredBaseUrl) {
    return OLLAMA_API_BASE_URL;
  }
  // Strip trailing slash, then strip /v1 suffix if present
  const trimmed = configuredBaseUrl.replace(/\/+$/, "");
  return trimmed.replace(/\/v1$/i, "");
}

async function discoverOllamaModels(baseUrl?: string): Promise<ModelDefinitionConfig[]> {
  // Skip Ollama discovery in test environments
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return [];
  }
  try {
    const apiBase = resolveOllamaApiBase(baseUrl);
    const response = await fetch(`${apiBase}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.warn(`Failed to discover Ollama models: ${response.status}`);
      return [];
    }
    const data = (await response.json()) as OllamaTagsResponse;
    if (!data.models || data.models.length === 0) {
      console.warn("No Ollama models found on local instance");
      return [];
    }
    return data.models.map((model) => {
      const modelId = model.name;
      const isReasoning =
        modelId.toLowerCase().includes("r1") || modelId.toLowerCase().includes("reasoning");
      return {
        id: modelId,
        name: modelId,
        reasoning: isReasoning,
        input: ["text"],
        cost: OLLAMA_DEFAULT_COST,
        contextWindow: OLLAMA_DEFAULT_CONTEXT_WINDOW,
        maxTokens: OLLAMA_DEFAULT_MAX_TOKENS,
      };
    });
  } catch (error) {
    console.warn(`Failed to discover Ollama models: ${String(error)}`);
    return [];
  }
}

async function discoverVllmModels(
  baseUrl: string,
  apiKey?: string,
): Promise<ModelDefinitionConfig[]> {
  // Skip vLLM discovery in test environments
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return [];
  }

  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  const url = `${trimmedBaseUrl}/models`;

  try {
    const trimmedApiKey = apiKey?.trim();
    const response = await fetch(url, {
      headers: trimmedApiKey ? { Authorization: `Bearer ${trimmedApiKey}` } : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.warn(`Failed to discover vLLM models: ${response.status}`);
      return [];
    }
    const data = (await response.json()) as VllmModelsResponse;
    const models = data.data ?? [];
    if (models.length === 0) {
      console.warn("No vLLM models found on local instance");
      return [];
    }

    return models
      .map((m) => ({ id: typeof m.id === "string" ? m.id.trim() : "" }))
      .filter((m) => Boolean(m.id))
      .map((m) => {
        const modelId = m.id;
        const lower = modelId.toLowerCase();
        const isReasoning =
          lower.includes("r1") || lower.includes("reasoning") || lower.includes("think");
        return {
          id: modelId,
          name: modelId,
          reasoning: isReasoning,
          input: ["text"],
          cost: VLLM_DEFAULT_COST,
          contextWindow: VLLM_DEFAULT_CONTEXT_WINDOW,
          maxTokens: VLLM_DEFAULT_MAX_TOKENS,
        } satisfies ModelDefinitionConfig;
      });
  } catch (error) {
    console.warn(`Failed to discover vLLM models: ${String(error)}`);
    return [];
  }
}

function normalizeApiKeyConfig(value: string): string {
  const trimmed = value.trim();
  const match = /^\$\{([A-Z0-9_]+)\}$/.exec(trimmed);
  return match?.[1] ?? trimmed;
}

function resolveEnvApiKeyVarName(provider: string): string | undefined {
  const resolved = resolveEnvApiKey(provider);
  if (!resolved) {
    return undefined;
  }
  const match = /^(?:env: |shell env: )([A-Z0-9_]+)$/.exec(resolved.source);
  return match ? match[1] : undefined;
}

function resolveAwsSdkApiKeyVarName(): string {
  return resolveAwsSdkEnvVarName() ?? "AWS_PROFILE";
}

function resolveApiKeyFromProfiles(params: {
  provider: string;
  store: ReturnType<typeof ensureAuthProfileStore>;
}): string | undefined {
  const ids = listProfilesForProvider(params.store, params.provider);
  for (const id of ids) {
    const cred = params.store.profiles[id];
    if (!cred) {
      continue;
    }
    if (cred.type === "api_key") {
      return cred.key;
    }
    if (cred.type === "token") {
      return cred.token;
    }
  }
  return undefined;
}

export function normalizeGoogleModelId(id: string): string {
  if (id === "gemini-3-pro") {
    return "gemini-3-pro-preview";
  }
  if (id === "gemini-3-flash") {
    return "gemini-3-flash-preview";
  }
  return id;
}

function normalizeGoogleProvider(provider: ProviderConfig): ProviderConfig {
  let mutated = false;
  const models = provider.models.map((model) => {
    const nextId = normalizeGoogleModelId(model.id);
    if (nextId === model.id) {
      return model;
    }
    mutated = true;
    return { ...model, id: nextId };
  });
  return mutated ? { ...provider, models } : provider;
}

export function normalizeProviders(params: {
  providers: ModelsConfig["providers"];
  agentDir: string;
  secretDefaults?: {
    env?: string;
    file?: string;
    exec?: string;
  };
  secretRefManagedProviders?: Set<string>;
}): ModelsConfig["providers"] {
  const { providers } = params;
  if (!providers) {
    return providers;
  }
  const authStore = ensureAuthProfileStore(params.agentDir, {
    allowKeychainPrompt: false,
  });
  let mutated = false;
  const next: Record<string, ProviderConfig> = {};

  for (const [key, provider] of Object.entries(providers)) {
    const normalizedKey = key.trim();
    let normalizedProvider = provider;

    // Fix common misconfig: apiKey set to "${ENV_VAR}" instead of "ENV_VAR".
    const apiKeyStr =
      typeof normalizedProvider.apiKey === "string" ? normalizedProvider.apiKey : undefined;
    if (apiKeyStr && normalizeApiKeyConfig(apiKeyStr) !== apiKeyStr) {
      mutated = true;
      normalizedProvider = {
        ...normalizedProvider,
        apiKey: normalizeApiKeyConfig(apiKeyStr),
      };
    }

    // If a provider defines models, pi's ModelRegistry requires apiKey to be set.
    // Fill it from the environment or auth profiles when possible.
    const hasModels =
      Array.isArray(normalizedProvider.models) && normalizedProvider.models.length > 0;
    const apiKeyValue = normalizedProvider.apiKey;
    const apiKeyIsString = typeof apiKeyValue === "string";
    const apiKeyTrimmed = apiKeyIsString ? apiKeyValue.trim() : "";
    if (hasModels && !apiKeyTrimmed) {
      const authMode =
        normalizedProvider.auth ?? (normalizedKey === "amazon-bedrock" ? "aws-sdk" : undefined);
      if (authMode === "aws-sdk") {
        const apiKey = resolveAwsSdkApiKeyVarName();
        mutated = true;
        normalizedProvider = { ...normalizedProvider, apiKey };
      } else {
        const fromEnv = resolveEnvApiKeyVarName(normalizedKey);
        const fromProfiles = resolveApiKeyFromProfiles({
          provider: normalizedKey,
          store: authStore,
        });
        const apiKey = fromEnv ?? fromProfiles;
        if (apiKey?.trim()) {
          mutated = true;
          normalizedProvider = { ...normalizedProvider, apiKey };
        }
      }
    }

    if (normalizedKey === "google") {
      const googleNormalized = normalizeGoogleProvider(normalizedProvider);
      if (googleNormalized !== normalizedProvider) {
        mutated = true;
      }
      normalizedProvider = googleNormalized;
    }

    // Consolidate "qwen web" (with space) into "qwen-web" to fix duplicate provider display
    const outputKey = normalizedKey === "qwen web" ? "qwen-web" : normalizedKey;
    if (outputKey !== normalizedKey) {
      mutated = true;
    }
    const existing = next[outputKey];
    if (existing && Array.isArray(existing.models) && Array.isArray(normalizedProvider.models)) {
      const seen = new Set(
        (existing.models as Array<{ id?: string }>).map((m) => m.id).filter(Boolean),
      );
      const extra = normalizedProvider.models.filter((m) => m.id && !seen.has(m.id));
      if (extra.length > 0) {
        mutated = true;
        next[outputKey] = {
          ...existing,
          ...normalizedProvider,
          models: [...(existing.models ?? []), ...extra] as ModelDefinitionConfig[],
        };
      } else {
        next[outputKey] = { ...existing, ...normalizedProvider };
      }
    } else if (existing) {
      next[outputKey] = { ...existing, ...normalizedProvider };
    } else {
      next[outputKey] = normalizedProvider;
    }
  }

  return mutated ? next : providers;
}

function buildMinimaxProvider(): ProviderConfig {
  return {
    baseUrl: MINIMAX_PORTAL_BASE_URL,
    api: "anthropic-messages",
    models: [
      buildMinimaxTextModel({
        id: MINIMAX_DEFAULT_MODEL_ID,
        name: "MiniMax M2.1",
        reasoning: false,
      }),
      buildMinimaxTextModel({
        id: "MiniMax-M2.1-lightning",
        name: "MiniMax M2.1 Lightning",
        reasoning: false,
      }),
      buildMinimaxModel({
        id: MINIMAX_DEFAULT_VISION_MODEL_ID,
        name: "MiniMax VL 01",
        reasoning: false,
        input: ["text", "image"],
      }),
      buildMinimaxTextModel({
        id: "MiniMax-M2.5",
        name: "MiniMax M2.5",
        reasoning: true,
      }),
      buildMinimaxTextModel({
        id: "MiniMax-M2.5-Lightning",
        name: "MiniMax M2.5 Lightning",
        reasoning: true,
      }),
    ],
  };
}

function buildMinimaxPortalProvider(): ProviderConfig {
  return {
    baseUrl: MINIMAX_PORTAL_BASE_URL,
    api: "anthropic-messages",
    models: [
      buildMinimaxTextModel({
        id: MINIMAX_DEFAULT_MODEL_ID,
        name: "MiniMax M2.1",
        reasoning: false,
      }),
      buildMinimaxTextModel({
        id: "MiniMax-M2.5",
        name: "MiniMax M2.5",
        reasoning: true,
      }),
    ],
  };
}

function buildMoonshotProvider(): ProviderConfig {
  return {
    baseUrl: MOONSHOT_BASE_URL,
    api: "openai-completions",
    models: [
      {
        id: MOONSHOT_DEFAULT_MODEL_ID,
        name: "Kimi K2.5",
        reasoning: false,
        input: ["text"],
        cost: MOONSHOT_DEFAULT_COST,
        contextWindow: MOONSHOT_DEFAULT_CONTEXT_WINDOW,
        maxTokens: MOONSHOT_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

function buildQwenPortalProvider(): ProviderConfig {
  return {
    baseUrl: QWEN_PORTAL_BASE_URL,
    api: "openai-completions",
    models: [
      {
        id: "coder-model",
        name: "Qwen Coder",
        reasoning: false,
        input: ["text"],
        cost: QWEN_PORTAL_DEFAULT_COST,
        contextWindow: QWEN_PORTAL_DEFAULT_CONTEXT_WINDOW,
        maxTokens: QWEN_PORTAL_DEFAULT_MAX_TOKENS,
      },
      {
        id: "vision-model",
        name: "Qwen Vision",
        reasoning: false,
        input: ["text", "image"],
        cost: QWEN_PORTAL_DEFAULT_COST,
        contextWindow: QWEN_PORTAL_DEFAULT_CONTEXT_WINDOW,
        maxTokens: QWEN_PORTAL_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

function buildSyntheticProvider(): ProviderConfig {
  return {
    baseUrl: SYNTHETIC_BASE_URL,
    api: "anthropic-messages",
    models: SYNTHETIC_MODEL_CATALOG.map(buildSyntheticModelDefinition),
  };
}

export function buildXiaomiProvider(): ProviderConfig {
  return {
    baseUrl: XIAOMI_BASE_URL,
    api: "anthropic-messages",
    models: [
      {
        id: XIAOMI_DEFAULT_MODEL_ID,
        name: "Xiaomi MiMo V2 Flash",
        reasoning: false,
        input: ["text"],
        cost: XIAOMI_DEFAULT_COST,
        contextWindow: XIAOMI_DEFAULT_CONTEXT_WINDOW,
        maxTokens: XIAOMI_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

async function buildVeniceProvider(): Promise<ProviderConfig> {
  const models = await discoverVeniceModels();
  return {
    baseUrl: VENICE_BASE_URL,
    api: "openai-completions",
    models,
  };
}

async function buildOllamaProvider(configuredBaseUrl?: string): Promise<ProviderConfig> {
  const models = await discoverOllamaModels(configuredBaseUrl);
  return {
    baseUrl: resolveOllamaApiBase(configuredBaseUrl),
    api: "ollama",
    models,
  };
}

async function buildHuggingfaceProvider(apiKey?: string): Promise<ProviderConfig> {
  // Resolve env var name to value for discovery (GET /v1/models requires Bearer token).
  const resolvedSecret =
    apiKey?.trim() !== ""
      ? /^[A-Z][A-Z0-9_]*$/.test(apiKey!.trim())
        ? (process.env[apiKey!.trim()] ?? "").trim()
        : apiKey!.trim()
      : "";
  const models =
    resolvedSecret !== ""
      ? await discoverHuggingfaceModels(resolvedSecret)
      : HUGGINGFACE_MODEL_CATALOG.map(buildHuggingfaceModelDefinition);
  return {
    baseUrl: HUGGINGFACE_BASE_URL,
    api: "openai-completions",
    models,
  };
}

function buildTogetherProvider(): ProviderConfig {
  return {
    baseUrl: TOGETHER_BASE_URL,
    api: "openai-completions",
    models: TOGETHER_MODEL_CATALOG.map(buildTogetherModelDefinition),
  };
}

async function buildVllmProvider(params?: {
  baseUrl?: string;
  apiKey?: string;
}): Promise<ProviderConfig> {
  const baseUrl = (params?.baseUrl?.trim() || VLLM_BASE_URL).replace(/\/+$/, "");
  const models = await discoverVllmModels(baseUrl, params?.apiKey);
  return {
    baseUrl,
    api: "openai-completions",
    models,
  };
}
export function buildQianfanProvider(): ProviderConfig {
  return {
    baseUrl: QIANFAN_BASE_URL,
    api: "openai-completions",
    models: [
      {
        id: QIANFAN_DEFAULT_MODEL_ID,
        name: "DEEPSEEK V3.2",
        reasoning: true,
        input: ["text"],
        cost: QIANFAN_DEFAULT_COST,
        contextWindow: QIANFAN_DEFAULT_CONTEXT_WINDOW,
        maxTokens: QIANFAN_DEFAULT_MAX_TOKENS,
      },
      {
        id: "ernie-5.0-thinking-preview",
        name: "ERNIE-5.0-Thinking-Preview",
        reasoning: true,
        input: ["text", "image"],
        cost: QIANFAN_DEFAULT_COST,
        contextWindow: 119000,
        maxTokens: 64000,
      },
    ],
  };
}

export async function discoverDeepseekWebModels(params?: {
  apiKey?: string;
}): Promise<ModelDefinitionConfig[]> {
  if (params?.apiKey) {
    try {
      const auth = JSON.parse(params.apiKey);
      const { DeepSeekWebClient } = await import("../providers/deepseek-web-client.js");
      const client = new DeepSeekWebClient(auth);
      return (await client.discoverModels()) as ModelDefinitionConfig[];
    } catch (e) {
      console.warn("[DeepSeekWeb] Dynamic discovery failed, falling back to built-in list:", e);
    }
  }

  return [
    {
      id: "deepseek-chat",
      name: "DeepSeek V3 (Web)",
      reasoning: false,
      input: ["text"],
      cost: DEEPSEEK_WEB_DEFAULT_COST,
      contextWindow: DEEPSEEK_WEB_DEFAULT_CONTEXT_WINDOW,
      maxTokens: DEEPSEEK_WEB_DEFAULT_MAX_TOKENS,
    },
    {
      id: "deepseek-reasoner",
      name: "DeepSeek R1 (Web)",
      reasoning: true,
      input: ["text"],
      cost: DEEPSEEK_WEB_DEFAULT_COST,
      contextWindow: DEEPSEEK_WEB_DEFAULT_CONTEXT_WINDOW,
      maxTokens: DEEPSEEK_WEB_DEFAULT_MAX_TOKENS,
    },
    {
      id: "deepseek-chat-search",
      name: "DeepSeek V3 (Web + Search)",
      reasoning: false,
      input: ["text"],
      cost: DEEPSEEK_WEB_DEFAULT_COST,
      contextWindow: DEEPSEEK_WEB_DEFAULT_CONTEXT_WINDOW,
      maxTokens: DEEPSEEK_WEB_DEFAULT_MAX_TOKENS,
    },
    {
      id: "deepseek-reasoner-search",
      name: "DeepSeek R1 (Web + Search)",
      reasoning: true,
      input: ["text"],
      cost: DEEPSEEK_WEB_DEFAULT_COST,
      contextWindow: DEEPSEEK_WEB_DEFAULT_CONTEXT_WINDOW,
      maxTokens: DEEPSEEK_WEB_DEFAULT_MAX_TOKENS,
    },
  ];
}

export async function buildDeepseekWebProvider(params?: {
  apiKey?: string;
}): Promise<ProviderConfig> {
  const models = await discoverDeepseekWebModels(params);
  return {
    baseUrl: DEEPSEEK_WEB_BASE_URL,
    api: "deepseek-web",
    models,
  };
}

export async function discoverDoubaoWebModels(params?: {
  apiKey?: string;
}): Promise<ModelDefinitionConfig[]> {
  if (params?.apiKey) {
    try {
      const auth = JSON.parse(params.apiKey);
      const { DoubaoWebClient } = await import("../providers/doubao-web-client.js");
      const client = new DoubaoWebClient(auth);
      return (await client.discoverModels()) as ModelDefinitionConfig[];
    } catch (e) {
      console.warn("[DoubaoWeb] Dynamic discovery failed, falling back to built-in list:", e);
    }
  }

  return [
    {
      id: "doubao-seed-2.0",
      name: "Doubao-Seed 2.0 (Web)",
      reasoning: true,
      input: ["text"],
      cost: DOUBAO_WEB_DEFAULT_COST,
      contextWindow: DOUBAO_WEB_DEFAULT_CONTEXT_WINDOW,
      maxTokens: DOUBAO_WEB_DEFAULT_MAX_TOKENS,
    },
    {
      id: "doubao-pro",
      name: "Doubao Pro (Web)",
      reasoning: false,
      input: ["text"],
      cost: DOUBAO_WEB_DEFAULT_COST,
      contextWindow: DOUBAO_WEB_DEFAULT_CONTEXT_WINDOW,
      maxTokens: DOUBAO_WEB_DEFAULT_MAX_TOKENS,
    },
  ];
}

export async function buildDoubaoWebProvider(params?: {
  apiKey?: string;
}): Promise<ProviderConfig> {
  const models = await discoverDoubaoWebModels(params);
  return {
    baseUrl: DOUBAO_WEB_BASE_URL,
    api: "doubao-web",
    models,
  };
}

export async function discoverClaudeWebModels(params?: {
  apiKey?: string;
}): Promise<ModelDefinitionConfig[]> {
  if (params?.apiKey) {
    try {
      const auth = JSON.parse(params.apiKey);
      const { ClaudeWebClientBrowser } = await import("../providers/claude-web-client-browser.js");
      const client = new ClaudeWebClientBrowser(auth);
      const models = (await client.discoverModels()) as ModelDefinitionConfig[];
      await client.close();
      return models;
    } catch (e) {
      console.warn("[ClaudeWeb] Dynamic discovery failed, falling back to built-in list:", e);
    }
  }

  return [
    {
      id: "claude-sonnet-4-6",
      name: "Claude Sonnet 4.6 (Web)",
      reasoning: false,
      input: ["text", "image"],
      cost: CLAUDE_WEB_DEFAULT_COST,
      contextWindow: CLAUDE_WEB_DEFAULT_CONTEXT_WINDOW,
      maxTokens: CLAUDE_WEB_DEFAULT_MAX_TOKENS,
    },
    {
      id: "claude-opus-4-6",
      name: "Claude Opus 4.6 (Web)",
      reasoning: false,
      input: ["text", "image"],
      cost: CLAUDE_WEB_DEFAULT_COST,
      contextWindow: CLAUDE_WEB_DEFAULT_CONTEXT_WINDOW,
      maxTokens: 16384,
    },
    {
      id: "claude-haiku-4-6",
      name: "Claude Haiku 4.6 (Web)",
      reasoning: false,
      input: ["text", "image"],
      cost: CLAUDE_WEB_DEFAULT_COST,
      contextWindow: CLAUDE_WEB_DEFAULT_CONTEXT_WINDOW,
      maxTokens: CLAUDE_WEB_DEFAULT_MAX_TOKENS,
    },
  ];
}

export async function buildClaudeWebProvider(params?: {
  apiKey?: string;
}): Promise<ProviderConfig> {
  const models = await discoverClaudeWebModels(params);
  return {
    baseUrl: CLAUDE_WEB_BASE_URL,
    api: "claude-web",
    models,
  };
}

export async function buildChatGPTWebProvider(params?: {
  apiKey?: string;
}): Promise<ProviderConfig> {
  return {
    baseUrl: CHATGPT_WEB_BASE_URL,
    api: "chatgpt-web",
    models: [
      {
        id: "gpt-4",
        name: "GPT-4 (Web)",
        reasoning: false,
        input: ["text", "image"],
        cost: CHATGPT_WEB_DEFAULT_COST,
        contextWindow: CHATGPT_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: CHATGPT_WEB_DEFAULT_MAX_TOKENS,
      },
      {
        id: "gpt-4-turbo",
        name: "GPT-4 Turbo (Web)",
        reasoning: false,
        input: ["text", "image"],
        cost: CHATGPT_WEB_DEFAULT_COST,
        contextWindow: CHATGPT_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: CHATGPT_WEB_DEFAULT_MAX_TOKENS,
      },
      {
        id: "gpt-3.5-turbo",
        name: "GPT-3.5 Turbo (Web)",
        reasoning: false,
        input: ["text"],
        cost: CHATGPT_WEB_DEFAULT_COST,
        contextWindow: 16000,
        maxTokens: 4096,
      },
    ],
  };
}

export async function buildQwenWebProvider(params?: { apiKey?: string }): Promise<ProviderConfig> {
  return {
    baseUrl: QWEN_WEB_BASE_URL,
    api: "qwen-web",
    models: [
      {
        id: "qwen3.5-plus",
        name: "Qwen 3.5 Plus",
        reasoning: false,
        input: ["text"],
        cost: QWEN_WEB_DEFAULT_COST,
        contextWindow: QWEN_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: QWEN_WEB_DEFAULT_MAX_TOKENS,
      },
      {
        id: "qwen3.5-turbo",
        name: "Qwen 3.5 Turbo",
        reasoning: false,
        input: ["text"],
        cost: QWEN_WEB_DEFAULT_COST,
        contextWindow: QWEN_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: QWEN_WEB_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

const QWEN_CN_WEB_BASE_URL = "https://chat2.qianwen.com";
const QWEN_CN_WEB_DEFAULT_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const QWEN_CN_WEB_DEFAULT_CONTEXT_WINDOW = 128000;
const QWEN_CN_WEB_DEFAULT_MAX_TOKENS = 4096;

export async function buildQwenCNWebProvider(params?: {
  apiKey?: string;
}): Promise<ProviderConfig> {
  return {
    baseUrl: QWEN_CN_WEB_BASE_URL,
    api: "qwen-cn-web",
    models: [
      {
        id: "Qwen3.5-Plus",
        name: "Qwen 3.5 Plus (国内版)",
        reasoning: false,
        input: ["text"],
        cost: QWEN_CN_WEB_DEFAULT_COST,
        contextWindow: QWEN_CN_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: QWEN_CN_WEB_DEFAULT_MAX_TOKENS,
      },
      {
        id: "Qwen3.5-Turbo",
        name: "Qwen 3.5 Turbo (国内版)",
        reasoning: false,
        input: ["text"],
        cost: QWEN_CN_WEB_DEFAULT_COST,
        contextWindow: QWEN_CN_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: QWEN_CN_WEB_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

export async function buildKimiWebProvider(params?: { apiKey?: string }): Promise<ProviderConfig> {
  return {
    baseUrl: KIMI_WEB_BASE_URL,
    api: "kimi-web",
    models: [
      {
        id: "moonshot-v1-8k",
        name: "Moonshot v1 8K (Web)",
        reasoning: false,
        input: ["text"],
        cost: KIMI_WEB_DEFAULT_COST,
        contextWindow: 8000,
        maxTokens: 4096,
      },
      {
        id: "moonshot-v1-32k",
        name: "Moonshot v1 32K (Web)",
        reasoning: false,
        input: ["text"],
        cost: KIMI_WEB_DEFAULT_COST,
        contextWindow: KIMI_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: KIMI_WEB_DEFAULT_MAX_TOKENS,
      },
      {
        id: "moonshot-v1-128k",
        name: "Moonshot v1 128K (Web)",
        reasoning: false,
        input: ["text"],
        cost: KIMI_WEB_DEFAULT_COST,
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  };
}

export async function buildGeminiWebProvider(params?: {
  apiKey?: string;
}): Promise<ProviderConfig> {
  return {
    baseUrl: GEMINI_WEB_BASE_URL,
    api: "gemini-web",
    models: [
      {
        id: "gemini-pro",
        name: "Gemini Pro (Web)",
        reasoning: false,
        input: ["text", "image"],
        cost: GEMINI_WEB_DEFAULT_COST,
        contextWindow: GEMINI_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: GEMINI_WEB_DEFAULT_MAX_TOKENS,
      },
      {
        id: "gemini-ultra",
        name: "Gemini Ultra (Web)",
        reasoning: false,
        input: ["text", "image"],
        cost: GEMINI_WEB_DEFAULT_COST,
        contextWindow: GEMINI_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: GEMINI_WEB_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

export async function buildGrokWebProvider(params?: { apiKey?: string }): Promise<ProviderConfig> {
  return {
    baseUrl: GROK_WEB_BASE_URL,
    api: "grok-web",
    models: [
      {
        id: "grok-1",
        name: "Grok 1 (Web)",
        reasoning: false,
        input: ["text"],
        cost: GROK_WEB_DEFAULT_COST,
        contextWindow: GROK_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: GROK_WEB_DEFAULT_MAX_TOKENS,
      },
      {
        id: "grok-2",
        name: "Grok 2 (Web)",
        reasoning: false,
        input: ["text"],
        cost: GROK_WEB_DEFAULT_COST,
        contextWindow: GROK_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: GROK_WEB_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

export async function buildZWebProvider(params?: { apiKey?: string }): Promise<ProviderConfig> {
  return {
    baseUrl: Z_WEB_BASE_URL,
    api: "glm-web",
    models: [
      {
        id: "glm-4-plus",
        name: "glm-4 Plus (Web)",
        reasoning: false,
        input: ["text"],
        cost: Z_WEB_DEFAULT_COST,
        contextWindow: Z_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: Z_WEB_DEFAULT_MAX_TOKENS,
      },
      {
        id: "glm-4-think",
        name: "glm-4 Think (Web)",
        reasoning: true,
        input: ["text"],
        cost: Z_WEB_DEFAULT_COST,
        contextWindow: Z_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: Z_WEB_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

export async function buildGlmIntlWebProvider(params?: {
  apiKey?: string;
}): Promise<ProviderConfig> {
  return {
    baseUrl: GLM_INTL_WEB_BASE_URL,
    api: "glm-intl-web",
    models: [
      {
        id: "glm-4-plus",
        name: "GLM-4 Plus (International)",
        reasoning: false,
        input: ["text"],
        cost: GLM_INTL_WEB_DEFAULT_COST,
        contextWindow: GLM_INTL_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: GLM_INTL_WEB_DEFAULT_MAX_TOKENS,
      },
      {
        id: "glm-4-think",
        name: "GLM-4 Think (International)",
        reasoning: true,
        input: ["text"],
        cost: GLM_INTL_WEB_DEFAULT_COST,
        contextWindow: GLM_INTL_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: GLM_INTL_WEB_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

const MANUS_API_DEFAULT_CONTEXT_WINDOW = 32000;
const MANUS_API_DEFAULT_MAX_TOKENS = 4096;
const MANUS_API_DEFAULT_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export const MANUS_API_DEFAULT_MODEL_REF = "manus-api/manus-1.6";

export function buildManusApiProvider(): ProviderConfig {
  return {
    baseUrl: "https://api.manus.ai",
    api: "manus-api",
    models: [
      {
        id: "manus-1.6",
        name: "Manus 1.6 (API)",
        reasoning: false,
        input: ["text"],
        cost: MANUS_API_DEFAULT_COST,
        contextWindow: MANUS_API_DEFAULT_CONTEXT_WINDOW,
        maxTokens: MANUS_API_DEFAULT_MAX_TOKENS,
      },
      {
        id: "manus-1.6-lite",
        name: "Manus 1.6 Lite (API)",
        reasoning: false,
        input: ["text"],
        cost: MANUS_API_DEFAULT_COST,
        contextWindow: MANUS_API_DEFAULT_CONTEXT_WINDOW,
        maxTokens: MANUS_API_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

const XIAOMIMO_WEB_BASE_URL = "https://aistudio.xiaomimimo.com";
const XIAOMIMO_WEB_DEFAULT_CONTEXT_WINDOW = 128000;
const XIAOMIMO_WEB_DEFAULT_MAX_TOKENS = 4096;
const XIAOMIMO_WEB_DEFAULT_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export function buildXiaomiMimoWebProvider(params?: { apiKey?: string }): ProviderConfig {
  return {
    baseUrl: XIAOMIMO_WEB_BASE_URL,
    api: "xiaomimo-web",
    models: [
      {
        id: "xiaomimo-chat",
        name: "MiMo Chat",
        reasoning: false,
        input: ["text"],
        cost: XIAOMIMO_WEB_DEFAULT_COST,
        contextWindow: XIAOMIMO_WEB_DEFAULT_CONTEXT_WINDOW,
        maxTokens: XIAOMIMO_WEB_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

export function buildNvidiaProvider(): ProviderConfig {
  return {
    baseUrl: NVIDIA_BASE_URL,
    api: "openai-completions",
    models: [
      {
        id: NVIDIA_DEFAULT_MODEL_ID,
        name: "NVIDIA Llama 3.1 Nemotron 70B Instruct",
        reasoning: false,
        input: ["text"],
        cost: NVIDIA_DEFAULT_COST,
        contextWindow: NVIDIA_DEFAULT_CONTEXT_WINDOW,
        maxTokens: NVIDIA_DEFAULT_MAX_TOKENS,
      },
      {
        id: "meta/llama-3.3-70b-instruct",
        name: "Meta Llama 3.3 70B Instruct",
        reasoning: false,
        input: ["text"],
        cost: NVIDIA_DEFAULT_COST,
        contextWindow: 131072,
        maxTokens: 4096,
      },
      {
        id: "nvidia/mistral-nemo-minitron-8b-8k-instruct",
        name: "NVIDIA Mistral NeMo Minitron 8B Instruct",
        reasoning: false,
        input: ["text"],
        cost: NVIDIA_DEFAULT_COST,
        contextWindow: 8192,
        maxTokens: 2048,
      },
    ],
  };
}

export async function resolveImplicitProviders(params: {
  agentDir: string;
  explicitProviders?: Record<string, ProviderConfig> | null;
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): Promise<ModelsConfig["providers"]> {
  const providers: Record<string, ProviderConfig> = {};
  const authStore = ensureAuthProfileStore(params.agentDir, {
    allowKeychainPrompt: false,
  });

  // Load additional providers from plugins (only if they have auth credentials)
  // This allows plugins to extend the provider list beyond hardcoded providers
  const pluginProviders = resolvePluginProviders({
    config: params.config,
    workspaceDir: params.agentDir,
  });
  for (const pluginProvider of pluginProviders) {
    // Only add plugin providers that have auth credentials in the auth store
    // This maintains backward compatibility while allowing plugin extensions
    const hasAuth = listProfilesForProvider(authStore, pluginProvider.id).length > 0;
    if (!hasAuth) {
      continue;
    }
    // Convert ProviderPlugin to ProviderConfig
    providers[pluginProvider.id] = {
      baseUrl: pluginProvider.models?.baseUrl ?? "",
      apiKey: undefined,
      api: pluginProvider.id as any,
      models: pluginProvider.models?.models ?? [],
    };
  }

  const minimaxKey =
    resolveEnvApiKeyVarName("minimax") ??
    resolveApiKeyFromProfiles({ provider: "minimax", store: authStore });
  if (minimaxKey) {
    providers.minimax = { ...buildMinimaxProvider(), apiKey: minimaxKey };
  }

  const minimaxOauthProfile = listProfilesForProvider(authStore, "minimax-portal");
  if (minimaxOauthProfile.length > 0) {
    providers["minimax-portal"] = {
      ...buildMinimaxPortalProvider(),
      apiKey: MINIMAX_OAUTH_PLACEHOLDER,
    };
  }

  const moonshotKey =
    resolveEnvApiKeyVarName("moonshot") ??
    resolveApiKeyFromProfiles({ provider: "moonshot", store: authStore });
  if (moonshotKey) {
    providers.moonshot = { ...buildMoonshotProvider(), apiKey: moonshotKey };
  }

  const syntheticKey =
    resolveEnvApiKeyVarName("synthetic") ??
    resolveApiKeyFromProfiles({ provider: "synthetic", store: authStore });
  if (syntheticKey) {
    providers.synthetic = { ...buildSyntheticProvider(), apiKey: syntheticKey };
  }

  const veniceKey =
    resolveEnvApiKeyVarName("venice") ??
    resolveApiKeyFromProfiles({ provider: "venice", store: authStore });
  if (veniceKey) {
    providers.venice = { ...(await buildVeniceProvider()), apiKey: veniceKey };
  }

  const qwenProfiles = listProfilesForProvider(authStore, "qwen-portal");
  if (qwenProfiles.length > 0) {
    providers["qwen-portal"] = {
      ...buildQwenPortalProvider(),
      apiKey: QWEN_PORTAL_OAUTH_PLACEHOLDER,
    };
  }

  const xiaomiKey =
    resolveEnvApiKeyVarName("xiaomi") ??
    resolveApiKeyFromProfiles({ provider: "xiaomi", store: authStore });
  if (xiaomiKey) {
    providers.xiaomi = { ...buildXiaomiProvider(), apiKey: xiaomiKey };
  }

  const cloudflareProfiles = listProfilesForProvider(authStore, "cloudflare-ai-gateway");
  for (const profileId of cloudflareProfiles) {
    const cred = authStore.profiles[profileId];
    if (cred?.type !== "api_key") {
      continue;
    }
    const accountId = cred.metadata?.accountId?.trim();
    const gatewayId = cred.metadata?.gatewayId?.trim();
    if (!accountId || !gatewayId) {
      continue;
    }
    const baseUrl = resolveCloudflareAiGatewayBaseUrl({ accountId, gatewayId });
    if (!baseUrl) {
      continue;
    }
    const apiKey = resolveEnvApiKeyVarName("cloudflare-ai-gateway") ?? cred.key?.trim() ?? "";
    if (!apiKey) {
      continue;
    }
    providers["cloudflare-ai-gateway"] = {
      baseUrl,
      api: "anthropic-messages",
      apiKey,
      models: [buildCloudflareAiGatewayModelDefinition()],
    };
    break;
  }

  // Ollama provider - only add if explicitly configured.
  // Use the user's configured baseUrl (from explicit providers) for model
  // discovery so that remote / non-default Ollama instances are reachable.
  const ollamaKey =
    resolveEnvApiKeyVarName("ollama") ??
    resolveApiKeyFromProfiles({ provider: "ollama", store: authStore });
  if (ollamaKey) {
    const ollamaBaseUrl = params.explicitProviders?.ollama?.baseUrl;
    providers.ollama = { ...(await buildOllamaProvider(ollamaBaseUrl)), apiKey: ollamaKey };
  }

  // vLLM provider - OpenAI-compatible local server (opt-in via env/profile).
  // If explicitly configured, keep user-defined models/settings as-is.
  if (!params.explicitProviders?.vllm) {
    const vllmEnvVar = resolveEnvApiKeyVarName("vllm");
    const vllmProfileKey = resolveApiKeyFromProfiles({ provider: "vllm", store: authStore });
    const vllmKey = vllmEnvVar ?? vllmProfileKey;
    if (vllmKey) {
      const discoveryApiKey = vllmEnvVar
        ? (process.env[vllmEnvVar]?.trim() ?? "")
        : (vllmProfileKey ?? "");
      providers.vllm = {
        ...(await buildVllmProvider({ apiKey: discoveryApiKey || undefined })),
        apiKey: vllmKey,
      };
    }
  }

  const togetherKey =
    resolveEnvApiKeyVarName("together") ??
    resolveApiKeyFromProfiles({ provider: "together", store: authStore });
  if (togetherKey) {
    providers.together = {
      ...buildTogetherProvider(),
      apiKey: togetherKey,
    };
  }

  const huggingfaceKey =
    resolveEnvApiKeyVarName("huggingface") ??
    resolveApiKeyFromProfiles({ provider: "huggingface", store: authStore });
  if (huggingfaceKey) {
    const hfProvider = await buildHuggingfaceProvider(huggingfaceKey);
    providers.huggingface = {
      ...hfProvider,
      apiKey: huggingfaceKey,
    };
  }

  const qianfanKey =
    resolveEnvApiKeyVarName("qianfan") ??
    resolveApiKeyFromProfiles({ provider: "qianfan", store: authStore });
  if (qianfanKey) {
    providers.qianfan = { ...buildQianfanProvider(), apiKey: qianfanKey };
  }

  const nvidiaKey =
    resolveEnvApiKeyVarName("nvidia") ??
    resolveApiKeyFromProfiles({ provider: "nvidia", store: authStore });
  if (nvidiaKey) {
    providers.nvidia = { ...buildNvidiaProvider(), apiKey: nvidiaKey };
  }

  const siliconFlowGlobalVar = resolveEnvApiKeyVarName("siliconflow");
  const siliconFlowGlobalProfileKey = resolveApiKeyFromProfiles({
    provider: "siliconflow",
    store: authStore,
  });
  const siliconFlowGlobalKey = siliconFlowGlobalVar ?? siliconFlowGlobalProfileKey;
  if (siliconFlowGlobalKey) {
    const discoveryApiKey = siliconFlowGlobalVar
      ? (process.env[siliconFlowGlobalVar]?.trim() ?? "")
      : (siliconFlowGlobalProfileKey ?? "");

    providers.siliconflow = {
      baseUrl: SILICONFLOW_GLOBAL_BASE_URL,
      api: "openai-completions",
      apiKey: siliconFlowGlobalKey,
      models: await discoverSiliconFlowModels({
        baseUrl: SILICONFLOW_GLOBAL_BASE_URL,
        apiKey: discoveryApiKey,
      }),
    };
  }

  const siliconFlowCnVar = resolveEnvApiKeyVarName("siliconflow-cn");
  const siliconFlowCnProfileKey = resolveApiKeyFromProfiles({
    provider: "siliconflow-cn",
    store: authStore,
  });
  const siliconFlowCnKey = siliconFlowCnVar ?? siliconFlowCnProfileKey;
  if (siliconFlowCnKey) {
    const discoveryApiKey = siliconFlowCnVar
      ? (process.env[siliconFlowCnVar]?.trim() ?? "")
      : (siliconFlowCnProfileKey ?? "");

    providers["siliconflow-cn"] = {
      baseUrl: SILICONFLOW_CN_BASE_URL,
      api: "openai-completions",
      apiKey: siliconFlowCnKey,
      models: await discoverSiliconFlowModels({
        baseUrl: SILICONFLOW_CN_BASE_URL,
        apiKey: discoveryApiKey,
      }),
    };
  }
  const deepseekWebKey =
    resolveEnvApiKeyVarName("deepseek-web") ??
    resolveApiKeyFromProfiles({ provider: "deepseek-web", store: authStore });

  providers["deepseek-web"] = {
    ...(await buildDeepseekWebProvider({ apiKey: deepseekWebKey })),
    apiKey: deepseekWebKey,
  };

  const doubaoWebKey =
    resolveEnvApiKeyVarName("doubao-web") ??
    resolveApiKeyFromProfiles({ provider: "doubao-web", store: authStore });

  providers["doubao-web"] = {
    ...(await buildDoubaoWebProvider({ apiKey: doubaoWebKey })),
    apiKey: doubaoWebKey,
  };

  const claudeWebKey =
    resolveEnvApiKeyVarName("claude-web") ??
    resolveApiKeyFromProfiles({ provider: "claude-web", store: authStore });

  providers["claude-web"] = {
    ...(await buildClaudeWebProvider({ apiKey: claudeWebKey })),
    apiKey: claudeWebKey,
  };

  const chatgptWebKey =
    resolveEnvApiKeyVarName("chatgpt-web") ??
    resolveApiKeyFromProfiles({ provider: "chatgpt-web", store: authStore });

  providers["chatgpt-web"] = {
    ...(await buildChatGPTWebProvider({ apiKey: chatgptWebKey })),
    apiKey: chatgptWebKey,
  };

  const qwenWebKey =
    resolveEnvApiKeyVarName("qwen-web") ??
    resolveApiKeyFromProfiles({ provider: "qwen-web", store: authStore });

  providers["qwen-web"] = {
    ...(await buildQwenWebProvider({ apiKey: qwenWebKey })),
    apiKey: qwenWebKey,
  };

  const kimiWebKey =
    resolveEnvApiKeyVarName("kimi-web") ??
    resolveApiKeyFromProfiles({ provider: "kimi-web", store: authStore });

  providers["kimi-web"] = {
    ...(await buildKimiWebProvider({ apiKey: kimiWebKey })),
    apiKey: kimiWebKey,
  };

  const geminiWebKey =
    resolveEnvApiKeyVarName("gemini-web") ??
    resolveApiKeyFromProfiles({ provider: "gemini-web", store: authStore });

  providers["gemini-web"] = {
    ...(await buildGeminiWebProvider({ apiKey: geminiWebKey })),
    apiKey: geminiWebKey,
  };

  const grokWebKey =
    resolveEnvApiKeyVarName("grok-web") ??
    resolveApiKeyFromProfiles({ provider: "grok-web", store: authStore });

  providers["grok-web"] = {
    ...(await buildGrokWebProvider({ apiKey: grokWebKey })),
    apiKey: grokWebKey,
  };

  const zWebKey =
    resolveEnvApiKeyVarName("glm-web") ??
    resolveApiKeyFromProfiles({ provider: "glm-web", store: authStore });

  providers["glm-web"] = {
    ...(await buildZWebProvider({ apiKey: zWebKey })),
    apiKey: zWebKey,
  };

  const glmIntlWebKey =
    resolveEnvApiKeyVarName("glm-intl-web") ??
    resolveApiKeyFromProfiles({ provider: "glm-intl-web", store: authStore });

  if (glmIntlWebKey) {
    providers["glm-intl-web"] = {
      ...(await buildGlmIntlWebProvider({ apiKey: glmIntlWebKey })),
      apiKey: glmIntlWebKey,
    };
  }

  const manusApiKey =
    resolveEnvApiKeyVarName("manus-api") ??
    resolveApiKeyFromProfiles({ provider: "manus-api", store: authStore });

  providers["manus-api"] = {
    ...buildManusApiProvider(),
    apiKey: manusApiKey,
  };

  const xiaomimoWebKey =
    resolveEnvApiKeyVarName("xiaomimo-web") ??
    resolveApiKeyFromProfiles({ provider: "xiaomimo-web", store: authStore });

  providers["xiaomimo-web"] = {
    ...(await buildXiaomiMimoWebProvider({ apiKey: xiaomimoWebKey })),
    apiKey: xiaomimoWebKey,
  };

  return providers;
}

export async function resolveImplicitCopilotProvider(params: {
  agentDir: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ProviderConfig | null> {
  const env = params.env ?? process.env;
  const authStore = ensureAuthProfileStore(params.agentDir, {
    allowKeychainPrompt: false,
  });
  const hasProfile = listProfilesForProvider(authStore, "github-copilot").length > 0;
  const envToken = env.COPILOT_GITHUB_TOKEN ?? env.GH_TOKEN ?? env.GITHUB_TOKEN;
  const githubToken = (envToken ?? "").trim();

  if (!hasProfile && !githubToken) {
    return null;
  }

  let selectedGithubToken = githubToken;
  if (!selectedGithubToken && hasProfile) {
    // Use the first available profile as a default for discovery (it will be
    // re-resolved per-run by the embedded runner).
    const profileId = listProfilesForProvider(authStore, "github-copilot")[0];
    const profile = profileId ? authStore.profiles[profileId] : undefined;
    if (profile && profile.type === "token" && profile.token) {
      selectedGithubToken = profile.token;
    }
  }

  let baseUrl = DEFAULT_COPILOT_API_BASE_URL;
  if (selectedGithubToken) {
    try {
      const token = await resolveCopilotApiToken({
        githubToken: selectedGithubToken,
        env,
      });
      baseUrl = token.baseUrl;
    } catch {
      baseUrl = DEFAULT_COPILOT_API_BASE_URL;
    }
  }

  // pi-coding-agent's ModelRegistry marks a model "available" only if its
  // `AuthStorage` has auth configured for that provider (via auth.json/env/etc).
  // Our Copilot auth lives in OpenClaw's auth-profiles store instead, so we also
  // write a runtime-only auth.json entry for pi-coding-agent to pick up.
  //
  // This is safe because it's (1) within OpenClaw's agent dir, (2) contains the
  // GitHub token (not the exchanged Copilot token), and (3) matches existing
  // patterns for OAuth-like providers in pi-coding-agent.
  // Note: we deliberately do not write pi-coding-agent's `auth.json` here.
  // OpenClaw uses its own auth store and exchanges tokens at runtime.
  // `models list` uses OpenClaw's auth heuristics for availability.

  // We intentionally do NOT define custom models for Copilot in models.json.
  // pi-coding-agent treats providers with models as replacements requiring apiKey.
  // We only override baseUrl; the model list comes from pi-ai built-ins.
  return {
    baseUrl,
    models: [],
  } satisfies ProviderConfig;
}

export async function resolveImplicitBedrockProvider(params: {
  agentDir: string;
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): Promise<ProviderConfig | null> {
  const env = params.env ?? process.env;
  const discoveryConfig = params.config?.models?.bedrockDiscovery;
  const enabled = discoveryConfig?.enabled;
  const hasAwsCreds = resolveAwsSdkEnvVarName(env) !== undefined;
  if (enabled === false) {
    return null;
  }
  if (enabled !== true && !hasAwsCreds) {
    return null;
  }

  const region = discoveryConfig?.region ?? env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? "us-east-1";
  const models = await discoverBedrockModels({
    region,
    config: discoveryConfig,
  });
  if (models.length === 0) {
    return null;
  }

  return {
    baseUrl: `https://bedrock-runtime.${region}.amazonaws.com`,
    api: "bedrock-converse-stream",
    auth: "aws-sdk",
    models,
  } satisfies ProviderConfig;
}

// Re-export from static providers for backwards compatibility
export { buildKilocodeProvider } from "./models-config.providers.static.js";
export { buildKimiCodingProvider } from "./models-config.providers.static.js";
