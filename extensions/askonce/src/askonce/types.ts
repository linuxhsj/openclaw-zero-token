/**
 * AskOnce 类型定义
 */

import type { Readable } from "node:stream";

/**
 * 模型响应结果
 */
export interface ModelResponse {
  /** 模型标识 */
  modelId: string;
  /** 模型显示名称 */
  modelName: string;
  /** 提供商标识 */
  provider: string;
  /** 响应状态 */
  status: "pending" | "streaming" | "completed" | "error" | "timeout";
  /** 响应文本内容 */
  content: string;
  /** 错误信息 (如果失败) */
  error?: string;
  /** 响应时间 (毫秒) */
  responseTime: number;
  /** 字符数 */
  charCount: number;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 查询选项
 */
export interface QueryOptions {
  /** 问题内容 */
  question: string;
  /** 选择的模型列表 (默认全部) */
  models?: string[];
  /** 超时时间 (毫秒, 默认 60000) */
  timeout?: number;
  /** 最大重试次数 (默认 2) */
  maxRetries?: number;
  /** 是否流式输出 */
  stream?: boolean;
  /** 系统提示词 */
  systemPrompt?: string;
}

/**
 * 查询结果
 */
export interface QueryResult {
  /** 查询 ID */
  queryId: string;
  /** 原始问题 */
  question: string;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime: number;
  /** 总耗时 */
  totalTime: number;
  /** 所有模型响应 */
  responses: ModelResponse[];
  /** 成功数量 */
  successCount: number;
  /** 失败数量 */
  errorCount: number;
}

/**
 * 模型适配器接口
 */
export interface ModelAdapter {
  /** 适配器标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 提供商 */
  provider: string;
  /** 支持的模型列表 */
  models: string[];
  /** 默认模型 */
  defaultModel: string;
  /** 检查适配器是否可用 (已认证) */
  isAvailable(): Promise<boolean>;
  /** 执行查询 */
  query(question: string, options?: AdapterQueryOptions): Promise<ModelResponse>;
  /** 流式查询 */
  queryStream?(
    question: string,
    options: AdapterQueryOptions,
    onChunk: (chunk: string) => void,
  ): Promise<ModelResponse>;
}

/**
 * 适配器查询选项
 */
export interface AdapterQueryOptions {
  /** 模型 ID */
  modelId?: string;
  /** 超时时间 */
  timeout?: number;
  /** 系统提示词 */
  systemPrompt?: string;
  /** AbortSignal */
  signal?: AbortSignal;
}

/**
 * 进度事件
 */
export interface ProgressEvent {
  /** 事件类型 */
  type: "start" | "progress" | "complete" | "error";
  /** 模型 ID */
  modelId: string;
  /** 进度数据 */
  data?: {
    content?: string;
    delta?: string;
    error?: string;
    progress?: number;
  };
}

/**
 * 进度回调函数
 */
export type ProgressCallback = (event: ProgressEvent) => void;

/**
 * 流式事件类型
 */
export interface StreamEvent {
  type: "text_delta" | "text_start" | "thinking_delta" | "thinking_start" | "done" | "error";
  delta?: string;
  contentIndex?: number;
  reason?: string;
  error?: Error;
}

/**
 * 流适配器接口
 */
export interface StreamAdapter {
  /** 流式查询 */
  queryStream(question: string, options: AdapterQueryOptions): ReadableStream<StreamEvent>;
}

/**
 * 配置选项
 */
export interface AskOnceConfig {
  /** 默认超时时间 (毫秒) */
  timeout: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 并发限制 */
  concurrencyLimit: number;
  /** 默认模型列表 */
  defaultModels: string[];
}

export const DEFAULT_CONFIG: AskOnceConfig = {
  timeout: 60000,
  maxRetries: 2,
  concurrencyLimit: 10,
  defaultModels: ["claude-web", "chatgpt-web", "gemini-web", "deepseek-web", "qwen-web"],
};
