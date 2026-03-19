/**
 * Web Models Plugin
 *
 * 提供基于浏览器的 Web AI 模型支持
 * 支持 ChatGPT Web, Claude Web, DeepSeek Web 等
 *
 * 认证流程：实际认证通过 onboard-web-auth 或 auth-choice 命令完成
 * 此插件提供 provider 注册信息，使 OpenClaw 能够识别这些 Web provider
 */

import type { ModelDefinitionConfig } from "openclaw/plugin-sdk/web-models";
import type {
  OpenClawPluginApi,
  ProviderAuthContext,
  ProviderAuthResult,
} from "openclaw/plugin-sdk/web-models";
import {
  buildOauthProviderAuthResult,
  emptyPluginConfigSchema,
} from "openclaw/plugin-sdk/web-models";

// Web Provider 定义
const WEB_PROVIDERS = [
  {
    id: "chatgpt-web",
    label: "ChatGPT Web",
    defaultModel: "gpt-4",
  },
  {
    id: "claude-web",
    label: "Claude Web",
    defaultModel: "claude-sonnet-4-6",
  },
  {
    id: "deepseek-web",
    label: "DeepSeek Web",
    defaultModel: "deepseek-chat",
  },
  {
    id: "doubao-web",
    label: "Doubao Web",
    defaultModel: "doubao-seed-2.0",
  },
  {
    id: "gemini-web",
    label: "Gemini Web",
    defaultModel: "gemini-pro",
  },
  {
    id: "glm-web",
    label: "GLM Web (国内)",
    defaultModel: "glm-4-plus",
  },
  {
    id: "glm-intl-web",
    label: "GLM Web (国际)",
    defaultModel: "glm-4-plus",
  },
  {
    id: "grok-web",
    label: "Grok Web",
    defaultModel: "grok-2",
  },
  {
    id: "kimi-web",
    label: "Kimi Web",
    defaultModel: "moonshot-v1-32k",
  },
  {
    id: "qwen-web",
    label: "Qwen Web (阿里国内)",
    defaultModel: "qwen-max",
  },
  {
    id: "qwen-cn-web",
    label: "Qwen Web (阿里国际)",
    defaultModel: "qwen-turbo",
  },
  {
    id: "manus-api",
    label: "Manus API",
    defaultModel: "manus",
  },
  {
    id: "xiaomimo-web",
    label: "Xiaomi Mimo Web",
    defaultModel: "xiaomimo-chat",
  },
] as const;

// 凭证标记 - 用于标识通过浏览器认证的 provider
const WEB_AUTH_PLACEHOLDER = "web-auth";

/**
 * 创建 Web provider 的模型定义
 */
function createWebModels(providerId: string): ModelDefinitionConfig[] {
  const modelMap: Record<string, ModelDefinitionConfig[]> = {
    "chatgpt-web": [
      {
        id: "gpt-4",
        name: "GPT-4",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 8192,
        maxTokens: 4096,
      },
    ],
    "claude-web": [
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      },
      {
        id: "claude-opus-4-6",
        name: "Claude Opus 4",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      },
      {
        id: "claude-haiku-4-6",
        name: "Claude Haiku 4",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      },
    ],
    "deepseek-web": [
      {
        id: "deepseek-chat",
        name: "DeepSeek V3",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 64000,
        maxTokens: 4096,
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek R1",
        input: ["text"],
        reasoning: true,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 64000,
        maxTokens: 4096,
      },
    ],
    "doubao-web": [
      {
        id: "doubao-seed-2.0",
        name: "Doubao Seed 2.0",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
      {
        id: "doubao-pro",
        name: "Doubao Pro",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
    "gemini-web": [
      {
        id: "gemini-pro",
        name: "Gemini Pro",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32768,
        maxTokens: 8192,
      },
      {
        id: "gemini-ultra",
        name: "Gemini Ultra",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32768,
        maxTokens: 8192,
      },
    ],
    "glm-web": [
      {
        id: "glm-4-plus",
        name: "GLM-4 Plus",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
    "glm-intl-web": [
      {
        id: "glm-4-plus",
        name: "GLM-4 Plus",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
      {
        id: "glm-4-think",
        name: "GLM-4 Think",
        input: ["text"],
        reasoning: true,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
    "grok-web": [
      {
        id: "grok-2",
        name: "Grok 2",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 131072,
        maxTokens: 8192,
      },
    ],
    "kimi-web": [
      {
        id: "moonshot-v1-32k",
        name: "Kimi",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
    "qwen-web": [
      {
        id: "qwen-max",
        name: "Qwen Max",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32768,
        maxTokens: 4096,
      },
    ],
    "qwen-cn-web": [
      {
        id: "qwen-turbo",
        name: "Qwen Turbo",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 100000,
        maxTokens: 4096,
      },
    ],
    "manus-api": [
      {
        id: "manus",
        name: "Manus",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
    "xiaomimo-web": [
      {
        id: "xiaomimo-chat",
        name: "MiMo Chat",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  };

  return modelMap[providerId] || [];
}

// 虚拟的 auth 方法 - 实际认证通过 onboard-web-auth 命令完成
async function handleWebAuth(_ctx: ProviderAuthContext): Promise<ProviderAuthResult> {
  return buildOauthProviderAuthResult({
    providerId: "web-placeholder",
    defaultModel: "placeholder",
    access: "",
    configPatch: {},
    notes: ["Web 认证通过 onboard-web-auth 或 auth-choice 命令完成"],
  });
}

const webModelsPlugin = {
  id: "web-models",
  name: "Web Models",
  description: "Web-based AI model providers (ChatGPT Web, Claude Web, DeepSeek Web, etc.)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    // 为每个 Web provider 注册
    for (const provider of WEB_PROVIDERS) {
      const models = createWebModels(provider.id);

      api.registerProvider({
        id: provider.id,
        label: provider.label,
        models: {
          baseUrl: "",
          apiKey: WEB_AUTH_PLACEHOLDER,
          api: provider.id as any,
          models,
        },
        auth: [
          {
            id: "web",
            label: "Web Browser Auth",
            hint: "Authenticate via browser (use onboard-web-auth command)",
            kind: "manual",
            run: handleWebAuth,
          },
        ],
      });
    }
  },
};

export default webModelsPlugin;
