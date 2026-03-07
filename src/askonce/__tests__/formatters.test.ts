/**
 * 格式化器单元测试
 */

import { describe, it, expect } from 'vitest';
import { ConsoleFormatter } from '../formatters/console.js';
import { MarkdownFormatter } from '../formatters/markdown.js';
import { JsonFormatter } from '../formatters/json.js';
import type { QueryResult, ModelResponse } from '../types.js';

// 创建测试数据
function createTestQueryResult(): QueryResult {
  return {
    queryId: 'test-query-id',
    question: 'What is AI?',
    startTime: Date.now() - 5000,
    endTime: Date.now(),
    totalTime: 5000,
    responses: [
      {
        modelId: 'claude-sonnet-4-6',
        modelName: 'Claude',
        provider: 'anthropic',
        status: 'completed',
        content: 'AI stands for Artificial Intelligence. It refers to computer systems that can perform tasks that typically require human intelligence.',
        responseTime: 1500,
        charCount: 120,
        timestamp: Date.now(),
      },
      {
        modelId: 'gpt-4o',
        modelName: 'ChatGPT',
        provider: 'openai',
        status: 'completed',
        content: 'Artificial Intelligence (AI) is the simulation of human intelligence processes by machines, especially computer systems.',
        responseTime: 1800,
        charCount: 110,
        timestamp: Date.now(),
      },
      {
        modelId: 'gemini-2.0-flash',
        modelName: 'Gemini',
        provider: 'google',
        status: 'error',
        content: '',
        error: 'Authentication failed',
        responseTime: 0,
        charCount: 0,
        timestamp: Date.now(),
      },
    ],
    successCount: 2,
    errorCount: 1,
  };
}

describe('ConsoleFormatter', () => {
  it('应该格式化查询结果', () => {
    const formatter = new ConsoleFormatter();
    const result = createTestQueryResult();
    const output = formatter.format(result);

    expect(output).toContain('AskOnce 查询结果');
    expect(output).toContain('What is AI?');
    expect(output).toContain('Claude');
    expect(output).toContain('ChatGPT');
    expect(output).toContain('统计摘要');
  });

  it('应该显示错误信息', () => {
    const formatter = new ConsoleFormatter();
    const result = createTestQueryResult();
    const output = formatter.format(result);

    expect(output).toContain('Authentication failed');
  });

  it('应该显示速度排名', () => {
    const formatter = new ConsoleFormatter();
    const result = createTestQueryResult();
    const output = formatter.format(result);

    expect(output).toContain('响应速度排名');
    expect(output).toContain('Claude');
  });

  it('应该显示回答长度', () => {
    const formatter = new ConsoleFormatter();
    const result = createTestQueryResult();
    const output = formatter.format(result);

    expect(output).toContain('回答长度');
  });

  it('应该正确处理空结果', () => {
    const formatter = new ConsoleFormatter();
    const result: QueryResult = {
      queryId: 'empty',
      question: 'Test',
      startTime: Date.now(),
      endTime: Date.now(),
      totalTime: 0,
      responses: [],
      successCount: 0,
      errorCount: 0,
    };
    const output = formatter.format(result);

    expect(output).toContain('AskOnce 查询结果');
    expect(output).toContain('Test');
  });
});

describe('MarkdownFormatter', () => {
  it('应该生成 Markdown 格式', () => {
    const formatter = new MarkdownFormatter();
    const result = createTestQueryResult();
    const output = formatter.format(result);

    expect(output).toContain('# AskOnce 查询结果');
    expect(output).toContain('## 问题');
    expect(output).toContain('What is AI?');
    expect(output).toContain('## 统计');
  });

  it('应该包含模型回答详情', () => {
    const formatter = new MarkdownFormatter();
    const result = createTestQueryResult();
    const output = formatter.format(result);

    expect(output).toContain('### ✅ Claude');
    expect(output).toContain('### ✅ ChatGPT');
    expect(output).toContain('AI stands for Artificial Intelligence');
  });

  it('应该显示错误状态', () => {
    const formatter = new MarkdownFormatter();
    const result = createTestQueryResult();
    const output = formatter.format(result);

    expect(output).toContain('### ❌ Gemini');
    expect(output).toContain('Authentication failed');
  });

  it('应该包含速度排名', () => {
    const formatter = new MarkdownFormatter();
    const result = createTestQueryResult();
    const output = formatter.format(result);

    expect(output).toContain('## 速度排名');
  });
});

describe('JsonFormatter', () => {
  it('应该生成有效的 JSON', () => {
    const formatter = new JsonFormatter();
    const result = createTestQueryResult();
    const output = formatter.format(result);

    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('应该包含所有必要字段', () => {
    const formatter = new JsonFormatter();
    const result = createTestQueryResult();
    const output = formatter.format(result);
    const parsed = JSON.parse(output);

    expect(parsed).toHaveProperty('queryId');
    expect(parsed).toHaveProperty('question');
    expect(parsed).toHaveProperty('responses');
    expect(parsed).toHaveProperty('successCount');
    expect(parsed).toHaveProperty('errorCount');
    expect(parsed).toHaveProperty('totalTime');
  });

  it('应该正确序列化响应数组', () => {
    const formatter = new JsonFormatter();
    const result = createTestQueryResult();
    const output = formatter.format(result);
    const parsed = JSON.parse(output);

    expect(parsed.responses).toHaveLength(3);
    expect(parsed.responses[0]).toHaveProperty('modelId');
    expect(parsed.responses[0]).toHaveProperty('modelName');
    expect(parsed.responses[0]).toHaveProperty('status');
    expect(parsed.responses[0]).toHaveProperty('content');
  });

  it('应该保留错误信息', () => {
    const formatter = new JsonFormatter();
    const result = createTestQueryResult();
    const output = formatter.format(result);
    const parsed = JSON.parse(output);

    const errorResponse = parsed.responses.find(
      (r: ModelResponse) => r.status === 'error'
    );
    expect(errorResponse).toBeDefined();
    expect(errorResponse.error).toBe('Authentication failed');
  });
});
