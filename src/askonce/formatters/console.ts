/**
 * 终端输出格式化
 */

import chalk from 'chalk';
import type { QueryResult, ModelResponse } from '../types.js';

export class ConsoleFormatter {
  format(result: QueryResult): string {
    const lines: string[] = [];

    // 标题
    lines.push(chalk.bold.blue('\n═══════════════════════════════════════════════════════════'));
    lines.push(chalk.bold.blue('                    AskOnce 查询结果                        '));
    lines.push(chalk.bold.blue('═══════════════════════════════════════════════════════════\n'));

    // 问题
    lines.push(chalk.gray('问题: ') + chalk.white(result.question));
    lines.push(chalk.gray(`耗时: ${result.totalTime}ms | 成功: ${result.successCount} | 失败: ${result.errorCount}`));
    lines.push('');

    // 按响应时间排序
    const sortedResponses = [...result.responses].sort(
      (a, b) => a.responseTime - b.responseTime
    );

    // 每个模型的响应
    for (let i = 0; i < sortedResponses.length; i++) {
      const response = sortedResponses[i];
      lines.push(this.formatResponse(response, i + 1));
    }

    // 统计摘要
    lines.push(this.formatSummary(result));

    return lines.join('\n');
  }

  private formatResponse(response: ModelResponse, index: number): string {
    const lines: string[] = [];

    // 状态图标
    const statusIcon = this.getStatusIcon(response.status);

    // 头部
    lines.push(
      chalk.gray('┌─────────────────────────────────────────────────────────┐')
    );
    lines.push(
      chalk.gray('│ ') +
        statusIcon + ' ' +
        chalk.bold(response.modelName) +
        chalk.gray(` | ${response.responseTime}ms | ${response.charCount} 字`)
    );
    lines.push(chalk.gray('├─────────────────────────────────────────────────────────┤'));

    // 内容
    if (response.status === 'completed') {
      const content = this.truncateContent(response.content, 500);
      lines.push(chalk.gray('│ ') + chalk.white(content));
    } else {
      lines.push(chalk.gray('│ ') + chalk.red(`错误: ${response.error}`));
    }

    lines.push(chalk.gray('└─────────────────────────────────────────────────────────┘'));
    lines.push('');

    return lines.join('\n');
  }

  private getStatusIcon(status: ModelResponse['status']): string {
    switch (status) {
      case 'completed':
        return chalk.green('✓');
      case 'error':
        return chalk.red('✗');
      case 'timeout':
        return chalk.yellow('⏱');
      default:
        return chalk.gray('○');
    }
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.slice(0, maxLength) + '...';
  }

  private formatSummary(result: QueryResult): string {
    const lines: string[] = [];

    lines.push(chalk.bold('\n📊 统计摘要:'));
    lines.push(chalk.gray('─────────────────────────────────────────'));

    // 速度排名
    const completed = result.responses.filter((r) => r.status === 'completed');
    const speedRank = [...completed]
      .sort((a, b) => a.responseTime - b.responseTime)
      .slice(0, 3);

    if (speedRank.length > 0) {
      lines.push(chalk.bold('\n⚡ 响应速度排名:'));
      speedRank.forEach((r, i) => {
        lines.push(`  ${i + 1}. ${r.modelName} (${r.responseTime}ms)`);
      });
    }

    // 长度统计
    if (completed.length > 0) {
      lines.push(chalk.bold('\n📏 回答长度:'));
      completed
        .sort((a, b) => b.charCount - a.charCount)
        .forEach((r) => {
          const bar = '█'.repeat(Math.min(Math.floor(r.charCount / 50), 20));
          lines.push(`  ${r.modelName.padEnd(15)} ${bar} (${r.charCount})`);
        });
    }

    return lines.join('\n');
  }
}
