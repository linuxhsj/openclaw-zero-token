/**
 * AskOnce CLI 命令
 */

import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import type { Command } from 'commander';
import { QueryOrchestrator } from '../askonce/query-orchestrator.js';
import { ConsoleFormatter, MarkdownFormatter, JsonFormatter } from '../askonce/formatters/index.js';

/**
 * 自动检测并设置 OPENCLAW_STATE_DIR
 * 优先使用项目目录下的 .openclaw-zero-state
 */
function setupOpenclawStateDir(): void {
  if (process.env.OPENCLAW_STATE_DIR || process.env.OPENCLAW_ZERO_STATE_DIR) {
    return; // Already set
  }

  // Try to find .openclaw-zero-state in common locations
  const possiblePaths = [
    path.join(process.cwd(), '.openclaw-zero-state'),
    path.join(process.cwd(), '.openclaw-state'),
    path.resolve(process.cwd(), '..', '.openclaw-zero-state'),
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        process.env.OPENCLAW_STATE_DIR = p;
        console.log(`[AskOnce] Using state directory: ${p}`);
        break;
      }
    } catch {
      // Ignore errors
    }
  }
}

/**
 * 注册 AskOnce CLI 命令
 */
export function registerAskOnceCli(program: Command): void {
  program
    .command('askonce [question...]')
    .alias('ask')
    .description('一次提问，获取所有大模型答案')
    .option('-m, --models <models>', '指定模型 (逗号分隔)', '')
    .option('-t, --timeout <ms>', '超时时间 (毫秒)', '60000')
    .option('-o, --output <format>', '输出格式 (console/markdown/json)', 'console')
    .option('-f, --file <path>', '导出文件路径')
    .option('-s, --stream', '启用流式输出', false)
    .option('-l, --list', '列出所有可用模型', false)
    .allowUnknownOption()
    .action(async (question: string[] | undefined, options) => {
      // Setup state directory before any auth checks
      setupOpenclawStateDir();

      const orchestrator = new QueryOrchestrator();

      // 列出可用模型
      if (options.list) {
        console.log('\n可用模型列表:');
        const models = await orchestrator.listAvailableModels();
        for (const model of models) {
          const status = model.available ? chalk.green('✓') : chalk.red('✗');
          console.log(`  ${status} ${model.id} (${model.provider})`);
        }
        return;
      }

      // 检查问题参数
      if (!question || question.length === 0) {
        console.error('错误: 请提供问题参数');
        console.error('');
        console.error('用法:');
        console.error('  openclaw askonce "你的问题"              # 提问');
        console.error('  openclaw askonce --list                 # 列出可用模型');
        console.error('  openclaw askonce "问题" -m claude-web   # 指定模型');
        console.error('');
        console.error('提示: 配置认证请使用 openclaw onboard <provider>');
        process.exit(1);
      }

      // 合并多个单词的问题
      const questionStr = question.join(' ');

      // 解析模型列表
      const modelIds = options.models
        ? options.models.split(',').map((m: string) => m.trim())
        : undefined;

      // 选择格式化器
      let formatter;
      switch (options.output) {
        case 'markdown':
          formatter = new MarkdownFormatter();
          break;
        case 'json':
          formatter = new JsonFormatter();
          break;
        default:
          formatter = new ConsoleFormatter();
      }

      // 进度回调
      const onProgress = (event: any) => {
        if (options.stream) {
          process.stdout.write(`\r[${event.modelId}] ${event.type}...`);
        }
      };

      try {
        // 执行查询
        const result = await orchestrator.query(
          {
            question: questionStr,
            models: modelIds,
            timeout: parseInt(options.timeout),
            stream: options.stream,
          },
          onProgress
        );

        // 格式化输出
        const output = formatter.format(result);

        if (options.file) {
          // 写入文件
          const fs = await import('fs/promises');
          await fs.writeFile(options.file, output, 'utf-8');
          console.log(`\n结果已保存到: ${options.file}`);
        } else {
          console.log(output);
        }
      } catch (error) {
        console.error('查询失败:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
