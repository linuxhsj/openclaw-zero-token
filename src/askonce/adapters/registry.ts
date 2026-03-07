/**
 * 适配器注册表
 */

import type { ModelAdapter } from '../types.js';
import { ClaudeAdapter } from './claude.js';
import { ChatGPTAdapter } from './chatgpt.js';
import { GeminiAdapter } from './gemini.js';
import { DeepSeekAdapter } from './deepseek.js';
import { QwenAdapter } from './qwen.js';
import { KimiAdapter } from './kimi.js';
import { GLMAdapter } from './glm.js';
import { DoubaoAdapter } from './doubao.js';
import { GrokAdapter } from './grok.js';
import { QwenCNAdapter } from './qwen-cn.js';

/**
 * 适配器注册表
 * 管理所有可用的模型适配器
 */
export class AdapterRegistry {
  private adapters: Map<string, ModelAdapter> = new Map();
  private initialized = false;

  constructor() {
    // 注册所有 Web 模型适配器
    this.register(new ClaudeAdapter());
    this.register(new ChatGPTAdapter());
    this.register(new GeminiAdapter());
    this.register(new DeepSeekAdapter());
    this.register(new QwenAdapter());
    this.register(new KimiAdapter());
    this.register(new GLMAdapter());
    this.register(new DoubaoAdapter());
    this.register(new GrokAdapter());
    this.register(new QwenCNAdapter());
    this.initialized = true;
  }

  /**
   * 注册适配器
   */
  register(adapter: ModelAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  /**
   * 获取所有适配器
   */
  getAllAdapters(): ModelAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * 根据 ID 获取适配器
   */
  getAdapterById(id: string): ModelAdapter | undefined {
    return this.adapters.get(id);
  }

  /**
   * 根据多个 ID 获取适配器
   */
  getAdaptersByIds(ids: string[]): ModelAdapter[] {
    return ids
      .map((id) => this.adapters.get(id))
      .filter((adapter): adapter is ModelAdapter => adapter !== undefined);
  }

  /**
   * 获取所有适配器 ID
   */
  getAdapterIds(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * 获取可用的适配器列表
   */
  async getAvailableAdapters(): Promise<ModelAdapter[]> {
    const adapters = this.getAllAdapters();
    const availabilityChecks = await Promise.all(
      adapters.map(async (adapter) => ({
        adapter,
        isAvailable: await adapter.isAvailable(),
      }))
    );

    return availabilityChecks
      .filter((check) => check.isAvailable)
      .map((check) => check.adapter);
  }
}

// 单例实例
let registryInstance: AdapterRegistry | null = null;

/**
 * 获取适配器注册表单例
 */
export function getAdapterRegistry(): AdapterRegistry {
  if (!registryInstance) {
    registryInstance = new AdapterRegistry();
  }
  return registryInstance;
}
