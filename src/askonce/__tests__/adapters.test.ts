/**
 * 适配器注册表和基类单元测试
 */

import { describe, it, expect, vi } from 'vitest';
import { BaseAdapter } from '../adapters/base.js';
import { AdapterRegistry } from '../adapters/registry.js';
import type { ModelResponse, AdapterQueryOptions } from '../types.js';

// 创建测试用的具体适配器
class TestAdapter extends BaseAdapter {
  readonly id = 'test-adapter';
  readonly name = 'Test';
  readonly provider = 'test-provider';
  readonly models = ['test-model-1', 'test-model-2'];
  readonly defaultModel = 'test-model-1';

  private available: boolean;

  constructor(available = true) {
    super();
    this.available = available;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async query(question: string, options?: AdapterQueryOptions): Promise<ModelResponse> {
    const startTime = Date.now();
    return this.createResponse(
      options?.modelId || this.defaultModel,
      'completed',
      `Test response to: ${question}`,
      undefined,
      startTime
    );
  }
}

class FailingAdapter extends BaseAdapter {
  readonly id = 'failing-adapter';
  readonly name = 'Failing';
  readonly provider = 'test-provider';
  readonly models = ['fail-model'];
  readonly defaultModel = 'fail-model';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async query(): Promise<ModelResponse> {
    throw new Error('Query failed');
  }
}

describe('BaseAdapter', () => {
  it('应该创建正确的响应对象', async () => {
    const adapter = new TestAdapter();
    const response = await adapter.query('Hello');

    expect(response.modelId).toBe('test-model-1');
    expect(response.modelName).toBe('Test');
    expect(response.provider).toBe('test-provider');
    expect(response.status).toBe('completed');
    expect(response.content).toContain('Hello');
    expect(response.responseTime).toBeGreaterThanOrEqual(0);
    expect(response.charCount).toBeGreaterThan(0);
    expect(response.timestamp).toBeGreaterThan(0);
  });

  it('应该使用指定的模型 ID', async () => {
    const adapter = new TestAdapter();
    const response = await adapter.query('Test', { modelId: 'test-model-2' });

    expect(response.modelId).toBe('test-model-2');
  });

  it('isAvailable 应该返回正确的状态', async () => {
    const availableAdapter = new TestAdapter(true);
    const unavailableAdapter = new TestAdapter(false);

    expect(await availableAdapter.isAvailable()).toBe(true);
    expect(await unavailableAdapter.isAvailable()).toBe(false);
  });
});

describe('AdapterRegistry', () => {
  it('应该注册并获取适配器', () => {
    const registry = new AdapterRegistry();
    const allAdapters = registry.getAllAdapters();

    // 默认有 5 个 MVP 适配器
    expect(allAdapters.length).toBe(5);
  });

  it('应该通过 ID 获取适配器', () => {
    const registry = new AdapterRegistry();
    const adapter = registry.getAdapterById('claude-web');

    expect(adapter).toBeDefined();
    expect(adapter?.name).toBe('Claude');
  });

  it('应该返回 undefined 对于不存在的 ID', () => {
    const registry = new AdapterRegistry();
    const adapter = registry.getAdapterById('non-existent');

    expect(adapter).toBeUndefined();
  });

  it('应该通过多个 ID 获取适配器', () => {
    const registry = new AdapterRegistry();
    const adapters = registry.getAdaptersByIds(['claude-web', 'chatgpt-web']);

    expect(adapters).toHaveLength(2);
  });

  it('应该过滤不存在的 ID', () => {
    const registry = new AdapterRegistry();
    const adapters = registry.getAdaptersByIds(['claude-web', 'non-existent']);

    expect(adapters).toHaveLength(1);
    expect(adapters[0].id).toBe('claude-web');
  });

  it('应该返回所有适配器 ID', () => {
    const registry = new AdapterRegistry();
    const ids = registry.getAdapterIds();

    expect(ids).toContain('claude-web');
    expect(ids).toContain('chatgpt-web');
    expect(ids).toContain('gemini-web');
    expect(ids).toContain('deepseek-web');
    expect(ids).toContain('qwen-web');
  });

  it('应该支持注册自定义适配器', () => {
    const registry = new AdapterRegistry();
    const customAdapter = new TestAdapter();
    registry.register(customAdapter);

    const adapter = registry.getAdapterById('test-adapter');
    expect(adapter).toBeDefined();
    expect(adapter?.name).toBe('Test');
  });
});
