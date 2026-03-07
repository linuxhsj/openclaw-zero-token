/**
 * 查询编排器单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryOrchestrator } from '../query-orchestrator.js';

// Mock 适配器注册表
vi.mock('../adapters/index.js', () => ({
  getAdapterRegistry: () => ({
    getAllAdapters: () => [
      {
        id: 'claude-web',
        name: 'Claude',
        provider: 'anthropic',
        models: ['claude-sonnet-4-6'],
        defaultModel: 'claude-sonnet-4-6',
        isAvailable: async () => true,
        query: async () => ({
          modelId: 'claude-sonnet-4-6',
          modelName: 'Claude',
          provider: 'anthropic',
          status: 'completed',
          content: 'Claude response',
          responseTime: 1000,
          charCount: 15,
          timestamp: Date.now(),
        }),
      },
      {
        id: 'chatgpt-web',
        name: 'ChatGPT',
        provider: 'openai',
        models: ['gpt-4o'],
        defaultModel: 'gpt-4o',
        isAvailable: async () => true,
        query: async () => ({
          modelId: 'gpt-4o',
          modelName: 'ChatGPT',
          provider: 'openai',
          status: 'completed',
          content: 'ChatGPT response',
          responseTime: 1200,
          charCount: 16,
          timestamp: Date.now(),
        }),
      },
    ],
    getAdaptersByIds: (ids: string[]) => {
      const all = [
        {
          id: 'claude-web',
          name: 'Claude',
          provider: 'anthropic',
          models: ['claude-sonnet-4-6'],
          defaultModel: 'claude-sonnet-4-6',
          isAvailable: async () => true,
          query: async () => ({
            modelId: 'claude-sonnet-4-6',
            modelName: 'Claude',
            provider: 'anthropic',
            status: 'completed',
            content: 'Claude response',
            responseTime: 1000,
            charCount: 15,
            timestamp: Date.now(),
          }),
        },
      ];
      return all.filter((a) => ids.includes(a.id));
    },
  }),
}));

describe('QueryOrchestrator', () => {
  let orchestrator: QueryOrchestrator;

  beforeEach(() => {
    orchestrator = new QueryOrchestrator();
  });

  describe('query', () => {
    it('应该执行多模型查询并返回结果', async () => {
      const result = await orchestrator.query({
        question: 'What is AI?',
      });

      expect(result.queryId).toBeDefined();
      expect(result.question).toBe('What is AI?');
      expect(result.responses).toHaveLength(2);
      expect(result.totalTime).toBeGreaterThan(0);
    });

    it('应该统计成功和失败数量', async () => {
      const result = await orchestrator.query({
        question: 'Test question',
      });

      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.errorCount).toBeGreaterThanOrEqual(0);
      expect(result.successCount + result.errorCount).toBe(result.responses.length);
    });

    it('应该调用进度回调', async () => {
      const onProgress = vi.fn();
      await orchestrator.query({ question: 'Test' }, onProgress);

      expect(onProgress).toHaveBeenCalled();
    });

    it('应该支持指定模型列表', async () => {
      const result = await orchestrator.query({
        question: 'Test',
        models: ['claude-web'],
      });

      expect(result.responses).toHaveLength(1);
      expect(result.responses[0].modelName).toBe('Claude');
    });

    it('应该生成唯一的查询 ID', async () => {
      const result1 = await orchestrator.query({ question: 'Test 1' });
      const result2 = await orchestrator.query({ question: 'Test 2' });

      expect(result1.queryId).not.toBe(result2.queryId);
    });
  });

  describe('listAvailableModels', () => {
    it('应该返回所有可用模型列表', async () => {
      const models = await orchestrator.listAvailableModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('id');
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('provider');
      expect(models[0]).toHaveProperty('available');
    });
  });

  describe('getAllModels', () => {
    it('应该返回所有模型列表（包括未认证的）', () => {
      const models = orchestrator.getAllModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('id');
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('provider');
    });
  });
});
