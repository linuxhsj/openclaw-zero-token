/**
 * Web Model Auth Onboard
 *
 * 独立的 Web 模型授权模块
 * 支持同时授权多个 Web 模型
 */

import fs from "node:fs/promises";
import path from "node:path";
import { resolveOpenClawAgentDir } from "../agents/agent-paths.js";
import { ensureAuthProfileStore, saveAuthProfileStore } from "../agents/auth-profiles.js";
import { ensureOpenClawModelsJson } from "../agents/models-config.js";
import type { OpenClawConfig } from "../config/config.js";
import { loadConfig, writeConfigFile } from "../config/io.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import { loginChatGPTWeb } from "../providers/chatgpt-web-auth.js";
// 导入各个 web 模型的登录函数
import { loginClaudeWeb } from "../providers/claude-web-auth.js";
import { loginDeepseekWeb } from "../providers/deepseek-web-auth.js";
import { loginDoubaoWeb } from "../providers/doubao-web-auth.js";
import { loginGeminiWeb } from "../providers/gemini-web-auth.js";
import { loginGlmIntlWeb } from "../providers/glm-intl-web-auth.js";
import { loginZWeb } from "../providers/glm-web-auth.js";
import { loginGrokWeb } from "../providers/grok-web-auth.js";
import { loginKimiWeb } from "../providers/kimi-web-auth.js";
import { loginPerplexityWeb } from "../providers/perplexity-web-auth.js";
import { loginQwenCNWeb } from "../providers/qwen-cn-web-auth.js";
import { loginQwenWeb } from "../providers/qwen-web-auth.js";
import { loginXiaomiMimoWeb } from "../providers/xiaomimo-web-auth.js";
import type { WizardStep } from "../wizard/types.js";
import { applyAgentDefaultModelPrimary } from "./onboard-auth.config-shared.js";

// Web 模型凭证保存助手函数
async function saveWebModelCredentials(providerId: string, credentials: unknown): Promise<void> {
  const store = ensureAuthProfileStore();
  const profileId = `${providerId}:default`;

  store.profiles[profileId] = {
    type: "token",
    provider: providerId,
    token: JSON.stringify(credentials),
  };

  saveAuthProfileStore(store);
  console.log(`  > 已保存凭证到 auth-profiles.json`);
}

// Web 模型白名单更新函数
async function addModelToWhitelist(providerId: string, modelIds: string[]): Promise<void> {
  const config = loadConfig();

  // 初始化 models 字段（如果不存在）
  if (!config.agents.defaults.models) {
    config.agents.defaults.models = {};
  }

  // 模型别名映射
  const modelAliases: Record<string, Record<string, string>> = {
    "claude-web": {
      "claude-sonnet-4-6": "Claude Web",
      "claude-opus-4-6": "Claude Opus",
      "claude-haiku-4-6": "Claude Haiku",
    },
    "chatgpt-web": {
      "gpt-4": "ChatGPT Web",
    },
    "deepseek-web": {
      "deepseek-chat": "DeepSeek V3",
      "deepseek-reasoner": "DeepSeek R1",
    },
    "doubao-web": {
      "doubao-seed-2.0": "Doubao Browser",
    },
    "gemini-web": {
      "gemini-pro": "Gemini Pro",
      "gemini-ultra": "Gemini Ultra",
    },
    "glm-web": {
      "glm-4-plus": "GLM Web",
    },
    "glm-intl-web": {
      "glm-4-plus": "GLM-4 Plus (International)",
      "glm-4-think": "GLM-4 Think",
    },
    "grok-web": {
      "grok-2": "Grok Web",
    },
    "kimi-web": {
      "moonshot-v1-32k": "Kimi Web",
    },
    "perplexity-web": {
      "perplexity-web": "Perplexity Web",
    },
    "qwen-web": {
      "qwen-max": "Qwen Web",
    },
    "qwen-cn-web": {
      "qwen-turbo": "Qwen CN Web",
    },
  };

  // 添加模型到白名单
  for (const modelId of modelIds) {
    const modelKey = `${providerId}/${modelId}`;
    const alias = modelAliases[providerId]?.[modelId] || modelId;
    config.agents.defaults.models[modelKey] = { alias };
  }

  await writeConfigFile(config);
  console.log(`  > 已更新模型白名单到 openclaw.json`);
}

/**
 * 将 agent models.json 中的 providers 同步到 openclaw.json。
 * 解决首次运行时报错的问题：openclaw.json 初始 models.providers 为空，
 * 导致 resolveConfiguredModelRef 默认回退到 anthropic，且 model catalog 无可用 provider。
 */
async function syncModelsProvidersToConfig(): Promise<void> {
  const config = loadConfig();
  await ensureOpenClawModelsJson(config);

  const agentDir = resolveOpenClawAgentDir();
  const modelsPath = path.join(agentDir, "models.json");

  let providers: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(modelsPath, "utf8");
    const parsed = JSON.parse(raw) as { providers?: Record<string, unknown> };
    if (parsed?.providers && typeof parsed.providers === "object") {
      providers = parsed.providers;
    }
  } catch {
    return;
  }

  if (Object.keys(providers).length === 0) {
    return;
  }

  let nextConfig: OpenClawConfig = {
    ...config,
    models: {
      ...config.models,
      mode: config.models?.mode ?? "merge",
      providers: { ...config.models?.providers, ...providers },
    },
  };

  // 若尚未设置主模型，使用首个 web provider 的首个模型，避免回退到 anthropic
  if (!resolveAgentModelPrimaryValue(config.agents?.defaults?.model)) {
    const firstEntry = Object.entries(providers).find(
      ([, p]) =>
        p &&
        typeof p === "object" &&
        Array.isArray((p as { models?: unknown[] }).models) &&
        (p as { models: { id?: string }[] }).models.length > 0,
    );
    if (firstEntry) {
      const [providerId, provider] = firstEntry;
      const firstModel = (provider as { models: { id: string }[] }).models[0];
      if (firstModel?.id) {
        nextConfig = applyAgentDefaultModelPrimary(nextConfig, `${providerId}/${firstModel.id}`);
        console.log(`  > 已设置默认模型: ${providerId}/${firstModel.id}`);
      }
    }
  }

  await writeConfigFile(nextConfig);
  console.log(`  > 已同步 models.providers 到 openclaw.json`);
}

// Web 模型定义
interface WebModelProvider {
  id: string;
  name: string;
  loginFn: (params: {
    onProgress: (msg: string) => void;
    openUrl: (url: string) => Promise<boolean>;
  }) => Promise<unknown>;
}

const WEB_MODEL_PROVIDERS: WebModelProvider[] = [
  { id: "claude-web", name: "Claude Web", loginFn: loginClaudeWeb },
  { id: "chatgpt-web", name: "ChatGPT Web", loginFn: loginChatGPTWeb },
  { id: "deepseek-web", name: "DeepSeek Web", loginFn: loginDeepseekWeb },
  { id: "doubao-web", name: "Doubao Web", loginFn: loginDoubaoWeb },
  { id: "gemini-web", name: "Gemini Web", loginFn: loginGeminiWeb },
  { id: "glm-web", name: "GLM Web (国内)", loginFn: loginZWeb },
  { id: "glm-intl-web", name: "GLM Web (国际)", loginFn: loginGlmIntlWeb },
  { id: "grok-web", name: "Grok Web", loginFn: loginGrokWeb },
  { id: "kimi-web", name: "Kimi Web", loginFn: loginKimiWeb },
  { id: "perplexity-web", name: "Perplexity Web", loginFn: loginPerplexityWeb },
  { id: "qwen-web", name: "Qwen Web (阿里国内)", loginFn: loginQwenWeb },
  { id: "qwen-cn-web", name: "Qwen Web (阿里国际)", loginFn: loginQwenCNWeb },
  { id: "xiaomimo-web", name: "Xiaomi Mimo Web", loginFn: loginXiaomiMimoWeb },
];

export async function runOnboardWebAuth(): Promise<void> {
  console.log("\n🦞 Web Model Auth Onboard\n");

  // 显示已授权的模型
  const store = ensureAuthProfileStore();
  const authorizedModels = Object.keys(store.profiles).filter(
    (key) => key.endsWith("-web") || key.includes("-web:"),
  );

  if (authorizedModels.length > 0) {
    console.log("已授权的 Web 模型:");
    for (const model of authorizedModels) {
      console.log(`  - ${model}`);
    }
    console.log("");
  }

  // 选择要授权的模型
  console.log("请选择要授权的 Web 模型 (多个用逗号分隔):\n");

  for (let i = 0; i < WEB_MODEL_PROVIDERS.length; i++) {
    const provider = WEB_MODEL_PROVIDERS[i];
    const isAuthorized = authorizedModels.some((m) => m.startsWith(provider.id));
    const status = isAuthorized ? " ✓ 已授权" : "";
    console.log(`  ${i + 1}. ${provider.name}${status}`);
  }

  console.log("\n  0. 退出");
  console.log("  a. 授权所有模型");
  console.log("");

  // 提示用户输入
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  const input = await question("请输入选项: ");

  rl.close();

  if (input.trim() === "0" || input.trim() === "") {
    console.log("已退出。");
    return;
  }

  // 解析选择的模型
  let selectedProviders: WebModelProvider[] = [];

  if (input.trim() === "a") {
    selectedProviders = WEB_MODEL_PROVIDERS;
  } else {
    const indices = input.split(",").map((s) => parseInt(s.trim()) - 1);
    selectedProviders = indices
      .filter((i) => i >= 0 && i < WEB_MODEL_PROVIDERS.length)
      .map((i) => WEB_MODEL_PROVIDERS[i]);
  }

  if (selectedProviders.length === 0) {
    console.log("未选择任何模型。");
    return;
  }

  console.log(`\n将授权以下模型: ${selectedProviders.map((p) => p.name).join(", ")}`);

  // Web 模型对应的模型 ID 列表
  const providerModelIds: Record<string, string[]> = {
    "claude-web": ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-6"],
    "chatgpt-web": ["gpt-4"],
    "deepseek-web": ["deepseek-chat", "deepseek-reasoner"],
    "doubao-web": ["doubao-seed-2.0"],
    "gemini-web": ["gemini-pro", "gemini-ultra"],
    "glm-web": ["glm-4-plus"],
    "glm-intl-web": ["glm-4-plus", "glm-4-think"],
    "grok-web": ["grok-2"],
    "kimi-web": ["moonshot-v1-32k"],
    "perplexity-web": ["perplexity-web"],
    "qwen-web": ["qwen3.5-plus"],
    "qwen-cn-web": ["qwen-turbo"],
    "xiaomimo-web": ["xiaomimo-chat"],
  };

  // 逐个授权
  for (const provider of selectedProviders) {
    console.log(`\n正在授权 ${provider.name}...`);
    try {
      const result = await provider.loginFn({
        onProgress: (msg) => console.log(`  > ${msg}`),
        openUrl: async (url) => {
          console.log(`  > 打开浏览器: ${url}`);
          return true;
        },
      });

      // 如果返回了凭证，保存到 auth-profiles.json
      if (result && typeof result === "object") {
        await saveWebModelCredentials(provider.id, result);
      }

      // 添加模型到白名单
      const modelIds = providerModelIds[provider.id] || [];
      if (modelIds.length > 0) {
        await addModelToWhitelist(provider.id, modelIds);
      }

      console.log(`  ✓ ${provider.name} 授权成功!`);
    } catch (error) {
      console.error(`  ✗ ${provider.name} 授权失败:`, error);
    }
  }

  // 将 agent models.json 的 providers 同步到 openclaw.json，避免首次运行时报错
  if (selectedProviders.length > 0) {
    await syncModelsProvidersToConfig();
  }

  console.log("\n授权完成!");
  console.log("你可以在 Web UI 中使用这些模型了。");
}

// 注册为 CLI 命令
export const ONBOARD_WEB_AUTH_STEP: WizardStep = {
  title: "Web Model Auth",
  description: "Authorize Web AI models (Claude, ChatGPT, DeepSeek, etc.)",
  run: async () => {
    await runOnboardWebAuth();
  },
};
