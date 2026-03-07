/**
 * Markdown 输出格式化
 */

import type { QueryResult, ModelResponse } from '../types.js';

export class MarkdownFormatter {
  format(result: QueryResult): string {
    const lines: string[] = [];

    // 标题
    lines.push('# AskOnce 查询结果\n');
    lines.push('---');
    lines.push('');

    // 问题信息
    lines.push('## 问题');
    lines.push(result.question);
    lines.push('');

    // 统计信息
    lines.push('## 统计');
    lines.push(`- **耗时**: ${result.totalTime}ms`);
    lines.push(`- **成功**: ${result.successCount}`);
    lines.push(`- **失败**: ${result.errorCount}`);
    lines.push('');

    // 按响应时间排序
    const sortedResponses = [...result.responses].sort(
      (a, b) => a.responseTime - b.responseTime
    );

    // 各模型回答
    lines.push('## 回答详情\n');

    for (const response of sortedResponses) {
      lines.push(this.formatResponse(response));
    }

    // 速度排名
    lines.push('## 速度排名\n');
    const completed = result.responses.filter((r) => r.status === 'completed');
    const speedRank = [...completed]
      .sort((a, b) => a.responseTime - b.responseTime)
      .slice(0, 5);

    speedRank.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.modelName} - ${r.responseTime}ms`);
    });
    lines.push('');

    return lines.join('\n');
  }

  private formatResponse(response: ModelResponse): string {
    const lines: string[] = [];

    const statusEmoji = response.status === 'completed' ? '✅' : '❌';

    lines.push(`### ${statusEmoji} ${response.modelName}`);
    lines.push('');
    lines.push(`- **模型**: ${response.modelId}`);
    lines.push(`- **提供商**: ${response.provider}`);
    lines.push(`- **耗时**: ${response.responseTime}ms`);
    lines.push(`- **字数**: ${response.charCount}`);
    lines.push('');

    if (response.status === 'completed') {
      lines.push('**回答:**');
      lines.push('');
      lines.push(response.content);
    } else {
      lines.push(`**错误**: ${response.error}`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');

    return lines.join('\n');
  }
}
