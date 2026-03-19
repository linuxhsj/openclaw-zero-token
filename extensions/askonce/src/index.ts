/**
 * AskOnce Plugin
 *
 * 一次提问，获取所有大模型答案
 * Query multiple AI models simultaneously with a single question
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { Command } from "commander";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/askonce";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/askonce";
import { ConsoleFormatter, MarkdownFormatter, JsonFormatter } from "../askonce/formatters/index.js";
import { QueryOrchestrator } from "../askonce/query-orchestrator.js";

/**
 * 自动检测并设置 OPENCLAW_STATE_DIR
 */
function setupOpenclawStateDir(): void {
  if (process.env.OPENCLAW_STATE_DIR || process.env.OPENCLAW_ZERO_STATE_DIR) {
    return;
  }

  const possiblePaths = [
    path.join(process.cwd(), ".openclaw-zero-state"),
    path.join(process.cwd(), ".openclaw-state"),
    path.resolve(process.cwd(), "..", ".openclaw-zero-state"),
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

const askoncePlugin = {
  id: "askonce",
  name: "AskOnce",
  description: "一次提问，获取所有大模型答案",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    // 注册 CLI 命令
    api.registerCli((ctx) => {
      ctx.program
        .command("askonce [question...]")
        .alias("ask")
        .description("一次提问，获取所有大模型答案")
        .option("-m, --models <models>", "指定模型 (逗号分隔)", "")
        .option("-t, --timeout <ms>", "超时时间 (毫秒)", "60000")
        .option("-o, --output <format>", "输出格式 (console/markdown/json)", "console")
        .option("-f, --file <path>", "导出文件路径")
        .option("-s, --stream", "启用流式输出", false)
        .option("-l, --list", "列出所有可用模型", false)
        .allowUnknownOption()
        .action(async (question: string[] | undefined, options) => {
          await runAskOnce(ctx.program, options, question);
        });
    });
  },
};

async function runAskOnce(_program: Command, options: any, question?: string[]): Promise<void> {
  setupOpenclawStateDir();

  const orchestrator = new QueryOrchestrator();

  // 列出可用模型
  if (options.list) {
    console.log("\n可用模型列表:");
    const models = await orchestrator.listAvailableModels();
    for (const model of models) {
      const status = model.available ? chalk.green("✓") : chalk.red("✗");
      console.log(`  ${status} ${model.id} (${model.provider})`);
    }
    return;
  }

  // 检查问题参数
  if (!question || question.length === 0) {
    console.error("错误: 请提供问题参数");
    console.error("");
    console.error("用法:");
    console.error('  openclaw askonce "你的问题"              # 提问');
    console.error("  openclaw askonce --list                 # 列出可用模型");
    console.error('  openclaw askonce "问题" -m claude-web   # 指定模型');
    console.error("");
    console.error("提示: 配置认证请使用 openclaw onboard <provider>");
    process.exit(1);
  }

  const questionStr = question.join(" ");

  const modelIds = options.models
    ? options.models.split(",").map((m: string) => m.trim())
    : undefined;

  let formatter;
  switch (options.output) {
    case "markdown":
      formatter = new MarkdownFormatter();
      break;
    case "json":
      formatter = new JsonFormatter();
      break;
    default:
      formatter = new ConsoleFormatter();
  }

  const onProgress = (event: any) => {
    if (options.stream) {
      process.stdout.write(`\r[${event.modelId}] ${event.type}...`);
    }
  };

  try {
    const result = await orchestrator.query(
      {
        question: questionStr,
        models: modelIds,
        timeout: parseInt(options.timeout),
        stream: options.stream,
      },
      onProgress,
    );

    const output = formatter.format(result);

    if (options.file) {
      const fsPromises = await import("fs/promises");
      await fsPromises.writeFile(options.file, output, "utf-8");
      console.log(`\n结果已保存到: ${options.file}`);
    } else {
      console.log(output);
    }
  } catch (error) {
    console.error("查询失败:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export default askoncePlugin;
