/**
 * AskOnce WebUI CLI 命令
 */

import type { Command } from 'commander';
import { startAskOnceWebServer } from '../askonce/webui/server.js';

/**
 * 注册 AskOnce WebUI CLI 命令
 */
export function registerAskOnceWebCli(program: Command): void {
  program
    .command('askonce-web')
    .alias('ask-web')
    .description('启动 AskOnce WebUI 服务器')
    .option('-p, --port <port>', '服务器端口', '3456')
    .action(async (options) => {
      const port = parseInt(options.port);

      console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    AskOnce WebUI                                ║
╠════════════════════════════════════════════════════════════════╣
║  启动前请确保:                                                   ║
║  1. 用调试模式启动 Chrome:                                       ║
║     google-chrome --remote-debugging-port=9222                 ║
║                                                                 ║
║  2. 在浏览器中登录所有 AI 网站:                                  ║
║     - Claude.ai                                                 ║
║     - ChatGPT.com                                               ║
║     - Gemini (gemini.google.com)                                ║
║     - DeepSeek (chat.deepseek.com)                              ║
║     - Qwen (tongyi.aliyun.com)                                  ║
║                                                                 ║
║  3. 保持浏览器窗口打开                                           ║
╚════════════════════════════════════════════════════════════════╝
      `);

      try {
        await startAskOnceWebServer(port);
      } catch (error) {
        console.error('启动失败:', error);
        process.exit(1);
      }
    });
}
