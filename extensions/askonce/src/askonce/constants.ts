/**
 * AskOnce 常量配置
 */

/**
 * 支持的模型列表及其配置
 */
export const SUPPORTED_MODELS = {
  "claude-web": {
    id: "claude-web",
    name: "Claude",
    provider: "anthropic",
    models: ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"],
    defaultModel: "claude-sonnet-4-5",
  },
  "chatgpt-web": {
    id: "chatgpt-web",
    name: "ChatGPT",
    provider: "openai",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    defaultModel: "gpt-4o",
  },
  "gemini-web": {
    id: "gemini-web",
    name: "Gemini",
    provider: "google",
    models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    defaultModel: "gemini-2.0-flash",
  },
  "deepseek-web": {
    id: "deepseek-web",
    name: "DeepSeek",
    provider: "deepseek",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
  },
  "qwen-web": {
    id: "qwen-web",
    name: "Qwen",
    provider: "alibaba",
    models: ["qwen-turbo", "qwen-plus", "qwen-max"],
    defaultModel: "qwen-plus",
  },
  "doubao-web": {
    id: "doubao-web",
    name: "Doubao",
    provider: "bytedance",
    models: ["doubao-lite", "doubao-pro"],
    defaultModel: "doubao-pro",
  },
  "kimi-web": {
    id: "kimi-web",
    name: "Kimi",
    provider: "moonshot",
    models: ["kimi-k2", "kimi-k1.5", "kimi-k1"],
    defaultModel: "kimi-k1.5",
  },
  "grok-web": {
    id: "grok-web",
    name: "Grok",
    provider: "xai",
    models: ["grok-2", "grok-2-vision", "grok-beta"],
    defaultModel: "grok-2",
  },
  "glm-web": {
    id: "glm-web",
    name: "GLM",
    provider: "zhipu",
    models: ["glm-4", "glm-4-plus", "glm-4-flash"],
    defaultModel: "glm-4-plus",
  },
} as const;

export type SupportedModelId = keyof typeof SUPPORTED_MODELS;

/**
 * 模型提供商分组
 */
export const PROVIDER_GROUPS = {
  anthropic: ["claude-web"],
  openai: ["chatgpt-web"],
  google: ["gemini-web"],
  deepseek: ["deepseek-web"],
  alibaba: ["qwen-web"],
  bytedance: ["doubao-web"],
  moonshot: ["kimi-web"],
  xai: ["grok-web"],
  zhipu: ["glm-web"],
};

/**
 * 默认超时时间 (毫秒)
 */
export const DEFAULT_TIMEOUT = 60000;

/**
 * 最大重试次数
 */
export const MAX_RETRIES = 2;

/**
 * 并发限制
 */
export const CONCURRENCY_LIMIT = 10;

/**
 * 重试延迟基数 (毫秒)
 */
export const RETRY_BASE_DELAY = 1000;

/**
 * 最大重试延迟 (毫秒)
 */
export const MAX_RETRY_DELAY = 10000;
