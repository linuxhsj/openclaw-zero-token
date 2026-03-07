/**
 * 查询编排器
 * 负责协调整个查询流程
 */

import { randomUUID } from 'node:crypto';
import type { QueryOptions, QueryResult, ModelResponse, ProgressCallback } from './types.js';
import { ConcurrentEngine } from './concurrent-engine.js';
import { getAdapterRegistry, type ModelAdapter } from './adapters/index.js';

/**
 * 根据模型 ID 获取适配器
 * 支持模型 ID（如 "claude"）和适配器 ID（如 "claude-web"）
 */
function getAdapterByModelId(registry: ReturnType<typeof getAdapterRegistry>, modelId: string): ModelAdapter | undefined {
  // 先尝试直接通过适配器 ID 查找
  const adapter = registry.getAdapterById(modelId);
  if (adapter) {
    return adapter;
  }

  // 如果没找到，遍历所有适配器，通过模型列表查找
  for (const a of registry.getAllAdapters()) {
    if (a.models.includes(modelId)) {
      return a;
    }
  }

  return undefined;
}

/**
 * 查询编排器
 * 负责协调整个查询流程
 */
export class QueryOrchestrator {
  private engine: ConcurrentEngine;
  private registry: ReturnType<typeof getAdapterRegistry>;

  constructor() {
    this.engine = new ConcurrentEngine();
    this.registry = getAdapterRegistry();
  }

  /**
   * 执行多模型查询
   */
  async query(options: QueryOptions, onProgress?: ProgressCallback): Promise<QueryResult> {
    const queryId = randomUUID();
    const startTime = Date.now();

    console.log(`[QueryOrchestrator] 开始查询: "${options.question.slice(0, 50)}..."`);

    // 获取要使用的适配器
    let adapters: ModelAdapter[];
    if (options.models && options.models.length > 0) {
      // 根据模型 ID 获取适配器（支持模型 ID 和适配器 ID）
      const adapterSet = new Set<ModelAdapter>();
      for (const modelId of options.models) {
        const adapter = getAdapterByModelId(this.registry, modelId);
        if (adapter) {
          adapterSet.add(adapter);
        }
      }
      adapters = Array.from(adapterSet);
    } else {
      adapters = this.registry.getAllAdapters();
    }

    if (adapters.length === 0) {
      throw new Error('没有可用的模型适配器，请先配置认证');
    }

    console.log(`[QueryOrchestrator] 使用 ${adapters.length} 个模型: ${adapters.map((a) => a.name).join(', ')}`);

    // 执行并发查询
    const responses = await this.engine.executeAll(
      adapters,
      options.question,
      {
        timeout: options.timeout,
        systemPrompt: options.systemPrompt,
      },
      onProgress
    );

    const endTime = Date.now();

    // 构建结果
    const result: QueryResult = {
      queryId,
      question: options.question,
      startTime,
      endTime,
      totalTime: endTime - startTime,
      responses,
      successCount: responses.filter((r) => r.status === 'completed').length,
      errorCount: responses.filter((r) => r.status !== 'completed').length,
    };

    console.log(
      `[QueryOrchestrator] 查询完成: 成功 ${result.successCount}, 失败 ${result.errorCount}, 耗时 ${result.totalTime}ms`
    );

    return result;
  }

  /**
   * 获取所有可用的模型列表
   */
  async listAvailableModels(): Promise<Array<{ id: string; name: string; provider: string; available: boolean }>> {
    const adapters = this.registry.getAllAdapters();
    const results: Array<{ id: string; name: string; provider: string; available: boolean }> = [];

    for (const adapter of adapters) {
      const isAvailable = await adapter.isAvailable();
      for (const modelId of adapter.models) {
        results.push({
          id: modelId,
          name: adapter.name,  // 直接使用适配器名称，如 "Claude"、"ChatGPT" 等
          provider: adapter.provider,
          available: isAvailable,
        });
      }
    }

    return results;
  }

  /**
   * 获取所有模型列表（包括未认证的）
   */
  getAllModels(): Array<{ id: string; name: string; provider: string }> {
    const adapters = this.registry.getAllAdapters();
    const results: Array<{ id: string; name: string; provider: string }> = [];

    for (const adapter of adapters) {
      for (const modelId of adapter.models) {
        results.push({
          id: modelId,
          name: adapter.name,  // 直接使用适配器名称
          provider: adapter.provider,
        });
      }
    }

    return results;
  }
}
