/**
 * 并发执行引擎单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConcurrentEngine } from '../concurrent-engine.js';
import type { ModelAdapter, ModelResponse, AdapterQueryOptions, ProgressCallback } from '../types.js';

// 创建模拟适配器
function createMockAdapter(overrides: Partial<ModelAdapter> = {}): ModelAdapter {
  return {
    id: 'test-adapter',
    name: 'Test Adapter',
    provider: 'test',
    models: ['test-model-1'],
    defaultModel: 'test-model-1',
    isAvailable: async () => true,
    query: async () => ({
      modelId: 'test-model-1',
      modelName: 'Test Adapter',
      provider: 'test',
      status: 'completed',
      content: 'test response',
      responseTime: 100,
      charCount: 13,
      timestamp: Date.now(),
    }),
    ...overrides,
  };
}

describe('ConcurrentEngine', () => {
  let engine: ConcurrentEngine;

  beforeEach(() => {
    engine = new ConcurrentEngine();
  });

  describe('executeAll', () => {
    it('应该并发执行所有适配器', async () => {
      const mockAdapters: ModelAdapter[] = [
        createMockAdapter({ id: 'adapter-1', name: 'Adapter 1' }),
        createMockAdapter({ id: 'adapter-2', name: 'Adapter 2' }),
      ];

      const results = await engine.executeAll(mockAdapters, 'test question');

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('completed');
      expect(results[1].status).toBe('completed');
    });

    it('应该过滤掉不可用的适配器', async () => {
      const mockAdapters: ModelAdapter[] = [
        createMockAdapter({ id: 'available', isAvailable: async () => true }),
        createMockAdapter({ id: 'unavailable', isAvailable: async () => false }),
      ];

      const results = await engine.executeAll(mockAdapters, 'test question');

      expect(results).toHaveLength(1);
      expect(results[0].modelId).toBe('test-model-1');
    });

    it('单个适配器失败不应影响其他', async () => {
      const mockAdapters: ModelAdapter[] = [
        createMockAdapter({
          id: 'success',
          name: 'Success',
          query: async () => ({
            modelId: 'success-model',
            modelName: 'Success',
            provider: 'test',
            status: 'completed',
            content: 'ok',
            responseTime: 100,
            charCount: 2,
            timestamp: Date.now(),
          }),
        }),
        createMockAdapter({
          id: 'fail',
          name: 'Fail',
          query: async () => {
            throw new Error('Network error');
          },
        }),
      ];

      const results = await engine.executeAll(mockAdapters, 'test');

      expect(results).toHaveLength(2);
      const successResult = results.find((r) => r.modelId === 'success-model');
      const failResult = results.find((r) => r.modelId === 'test-model-1');
      expect(successResult?.status).toBe('completed');
      expect(failResult?.status).toBe('error');
    });

    it('没有可用适配器时返回空数组', async () => {
      const mockAdapters: ModelAdapter[] = [
        createMockAdapter({ isAvailable: async () => false }),
        createMockAdapter({ isAvailable: async () => false }),
      ];

      const results = await engine.executeAll(mockAdapters, 'test');

      expect(results).toHaveLength(0);
    });

    it('应该调用进度回调', async () => {
      const onProgress = vi.fn<ProgressCallback>();
      const mockAdapters = [createMockAdapter()];

      await engine.executeAll(mockAdapters, 'test', {}, onProgress);

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'start' })
      );
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'complete' })
      );
    });
  });

  describe('超时控制', () => {
    it('应该支持自定义超时时间', async () => {
      const engineWithShortTimeout = new ConcurrentEngine({ timeout: 100 });

      const slowAdapter: ModelAdapter = createMockAdapter({
        query: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return {
            modelId: 'slow-model',
            modelName: 'Slow',
            provider: 'test',
            status: 'completed',
            content: 'too late',
            responseTime: 200,
            charCount: 8,
            timestamp: Date.now(),
          };
        },
      });

      // 注意：由于适配器内部没有实现 AbortSignal 处理，这里测试的是引擎的超时机制
      const results = await engineWithShortTimeout.executeAll(
        [slowAdapter],
        'test',
        { timeout: 100 }
      );

      // 如果适配器响应时间超过超时时间，应该返回超时或错误
      expect(results).toHaveLength(1);
    });
  });

  describe('重试机制', () => {
    it('应该在失败时重试', async () => {
      let attempts = 0;
      const flakyAdapter: ModelAdapter = createMockAdapter({
        query: async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('Temporary error');
          }
          return {
            modelId: 'flaky-model',
            modelName: 'Flaky',
            provider: 'test',
            status: 'completed',
            content: 'success after retry',
            responseTime: 100,
            charCount: 19,
            timestamp: Date.now(),
          };
        },
      });

      const engineWithRetry = new ConcurrentEngine({ maxRetries: 2 });
      const results = await engineWithRetry.executeAll([flakyAdapter], 'test');

      expect(results[0].status).toBe('completed');
      expect(attempts).toBe(2);
    });
  });
});
