/**
 * 适配器基类
 */

import type { ModelAdapter, ModelResponse, AdapterQueryOptions } from "../types.js";

/**
 * 适配器抽象基类
 */
export abstract class BaseAdapter implements ModelAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly provider: string;
  abstract readonly models: string[];
  abstract readonly defaultModel: string;

  /**
   * 检查适配器是否可用
   * 子类需要实现认证检查逻辑
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * 执行查询
   * 子类需要实现具体的查询逻辑
   */
  abstract query(question: string, options?: AdapterQueryOptions): Promise<ModelResponse>;

  /**
   * 创建响应对象
   */
  protected createResponse(
    modelId: string,
    status: ModelResponse["status"],
    content: string = "",
    error?: string,
    startTime: number = Date.now(),
  ): ModelResponse {
    return {
      modelId,
      modelName: this.name,
      provider: this.provider,
      status,
      content,
      error,
      responseTime: Date.now() - startTime,
      charCount: content.length,
      timestamp: Date.now(),
    };
  }

  /**
   * 延迟执行
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 解析错误消息
   */
  protected parseError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
