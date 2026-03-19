/**
 * 并发执行引擎
 * 负责并发调度所有模型适配器的查询请求
 */

import {
  DEFAULT_TIMEOUT,
  MAX_RETRIES,
  CONCURRENCY_LIMIT,
  RETRY_BASE_DELAY,
  MAX_RETRY_DELAY,
} from "./constants.js";
import type {
  ModelAdapter,
  ModelResponse,
  AdapterQueryOptions,
  ProgressCallback,
} from "./types.js";

/**
 * 并发执行引擎配置
 */
export interface ConcurrentEngineConfig {
  /** 默认超时时间 (毫秒) */
  timeout: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 并发限制 (同时执行的最大数量) */
  concurrencyLimit: number;
}

const DEFAULT_CONFIG: ConcurrentEngineConfig = {
  timeout: DEFAULT_TIMEOUT,
  maxRetries: MAX_RETRIES,
  concurrencyLimit: CONCURRENCY_LIMIT,
};

/**
 * 并发执行引擎
 */
export class ConcurrentEngine {
  private config: ConcurrentEngineConfig;

  constructor(config: Partial<ConcurrentEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 并发执行多个模型查询
   *
   * @param adapters 要执行的适配器列表
   * @param question 问题内容
   * @param options 查询选项
   * @param onProgress 进度回调
   * @returns 所有模型的响应结果
   */
  async executeAll(
    adapters: ModelAdapter[],
    question: string,
    options: AdapterQueryOptions = {},
    onProgress?: ProgressCallback,
  ): Promise<ModelResponse[]> {
    // 过滤出可用的适配器
    const availableAdapters = await this.filterAvailableAdapters(adapters);

    if (availableAdapters.length === 0) {
      console.warn("[ConcurrentEngine] 没有可用的模型适配器");
      return [];
    }

    console.log(`[ConcurrentEngine] 开始并发查询 ${availableAdapters.length} 个模型`);

    // 创建并发任务
    const tasks = availableAdapters.map((adapter) =>
      this.executeWithRetry(adapter, question, options, onProgress),
    );

    // 使用 Promise.allSettled 并发执行，确保单个失败不影响其他
    const results = await Promise.allSettled(tasks);

    // 聚合结果
    return results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        // 创建错误响应
        const adapter = availableAdapters[index];
        return {
          modelId: adapter.defaultModel,
          modelName: adapter.name,
          provider: adapter.provider,
          status: "error" as const,
          content: "",
          error: result.reason?.message || "Unknown error",
          responseTime: 0,
          charCount: 0,
          timestamp: Date.now(),
        };
      }
    });
  }

  /**
   * 过滤出可用的适配器
   */
  private async filterAvailableAdapters(adapters: ModelAdapter[]): Promise<ModelAdapter[]> {
    const availabilityChecks = await Promise.all(
      adapters.map(async (adapter) => ({
        adapter,
        isAvailable: await adapter.isAvailable(),
      })),
    );

    return availabilityChecks.filter((check) => check.isAvailable).map((check) => check.adapter);
  }

  /**
   * 带重试的执行
   */
  private async executeWithRetry(
    adapter: ModelAdapter,
    question: string,
    options: AdapterQueryOptions,
    onProgress?: ProgressCallback,
  ): Promise<ModelResponse> {
    const maxRetries = this.config.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        // 指数退避
        const delay = Math.min(RETRY_BASE_DELAY * Math.pow(2, attempt - 1), MAX_RETRY_DELAY);
        console.log(`[ConcurrentEngine] ${adapter.name} 第 ${attempt} 次重试，等待 ${delay}ms`);
        await this.delay(delay);
      }

      try {
        // 发送开始事件
        onProgress?.({
          type: "start",
          modelId: adapter.defaultModel,
        });

        // 创建超时控制器
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          options.timeout || this.config.timeout,
        );

        const response = await adapter.query(question, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // 发送完成事件
        onProgress?.({
          type: "complete",
          modelId: adapter.defaultModel,
          data: { content: response.content },
        });

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 超时错误不重试
        if (lastError.name === "AbortError") {
          onProgress?.({
            type: "error",
            modelId: adapter.defaultModel,
            data: { error: "请求超时" },
          });

          return {
            modelId: adapter.defaultModel,
            modelName: adapter.name,
            provider: adapter.provider,
            status: "timeout",
            content: "",
            error: "请求超时",
            responseTime: this.config.timeout,
            charCount: 0,
            timestamp: Date.now(),
          };
        }
      }
    }

    // 所有重试都失败
    onProgress?.({
      type: "error",
      modelId: adapter.defaultModel,
      data: { error: lastError?.message || "Unknown error" },
    });

    return {
      modelId: adapter.defaultModel,
      modelName: adapter.name,
      provider: adapter.provider,
      status: "error",
      content: "",
      error: lastError?.message || "Unknown error",
      responseTime: 0,
      charCount: 0,
      timestamp: Date.now(),
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
