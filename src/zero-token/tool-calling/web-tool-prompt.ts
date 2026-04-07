/**
 * Per-model tool calling prompt templates.
 * Minimal version - MAX token saving
 */
import { toolDefsJson } from "./web-tool-defs.js";

const TOOL_DEFS = toolDefsJson();

// 极简示例（超级省token）
const TOOL_EXAMPLE = `## Tool Call Format
Use XML only.
Example:
<tool_call id="call_001" name="read">{"file_path":"/path/to/file.txt"}</tool_call>`;

const CN_TOOL_EXAMPLE = `## 工具调用格式
仅使用XML。
示例：
<tool_call id="call_001" name="read">{"file_path":"/path/to/file.txt"}</tool_call>`;

// 英文模板（极省）
const EN_TEMPLATE = `Tools: ${TOOL_DEFS}
${TOOL_EXAMPLE}
Use XML only. No extra text.`;

// 严格模板（给ChatGPT）
const EN_STRICT_TEMPLATE = `Tools: ${TOOL_DEFS}
${TOOL_EXAMPLE}
Use XML ONLY. NO extra text.`;

// 中文模板（极省）
const CN_TEMPLATE = `工具: ${TOOL_DEFS}
${CN_TOOL_EXAMPLE}
仅回复XML，无多余文字。`;

// --- 模型配置不变 ---
const NATIVE_TOOL_MODELS = new Set<string>();
const EXCLUDED_MODELS = new Set<string>(["perplexity-web"]);
const CN_MODELS = new Set<string>(["deepseek-web","doubao-web","qwen-cn-web","kimi-web","glm-web","xiaomimo-web"]);
const STRICT_MODELS = new Set<string>(["chatgpt-web"]);

// --- 导出函数（添加类型注解）---
export function shouldInjectToolPrompt(api: string): boolean {
  return !NATIVE_TOOL_MODELS.has(api) && !EXCLUDED_MODELS.has(api);
}

export function getToolPrompt(api: string): string {
  if (STRICT_MODELS.has(api)) return EN_STRICT_TEMPLATE;
  if (CN_MODELS.has(api)) return CN_TEMPLATE;
  return EN_TEMPLATE;
}

/**
 * 后端：自动提取 + 修复 XML（0 额外 token）
 * 使用更严谨的正则表达式
 * @param text AI 返回内容
 * @returns 标准 XML 或 null
 */
export function extractAndFixToolXML(text: string): string | null {
  // 空值检查 + 类型保护
  if (!text || typeof text !== 'string') return null;
  
  // 更严谨的正则：匹配完整的 id 和 name 属性，支持任意顺序和额外空格
  // 解释：
  // <tool_call\s+            - 开始标签 + 至少一个空白符
  // (?=[^>]*\bid="[^"]*")    - 正向前瞻：确保存在 id 属性
  // (?=[^>]*\bname="[^"]*")  - 正向前瞻：确保存在 name 属性
  // [^>]*>                   - 匹配属性结束，到 > 符号
  // ([\s\S]*?)               - 捕获组1：内容（非贪婪，支持换行）
  // </tool_call>             - 闭合标签
  const strictRegex = /<tool_call\s+(?=[^>]*\bid="[^"]*")(?=[^>]*\bname="[^"]*")[^>]*>([\s\S]*?)<\/tool_call>/i;
  
  // 备选正则：宽松匹配，只要格式大致正确（降级方案）
  const looseRegex = /<tool_call[^>]*>([\s\S]*?)<\/tool_call>/i;
  
  // 优先使用严格匹配
  let match = text.match(strictRegex);
  
  // 如果严格匹配失败，尝试宽松匹配
  if (!match) {
    match = text.match(looseRegex);
  }
  
  // 仍然不匹配？尝试提取未闭合的标签
  if (!match) {
    const unclosedMatch = text.match(/<tool_call[^>]*>([\s\S]*?)$/);
    if (unclosedMatch) {
      // 自动补全闭合标签
      let xml = unclosedMatch[0].trim();
      if (!xml.endsWith("</tool_call>")) xml += "</tool_call>";
      return xml;
    }
    return null;
  }
  
  // 提取完整的 XML
  let xml = match[0].trim();
  
  // 二次验证：确保 id 和 name 属性存在（针对宽松匹配的结果）
  if (!xml.includes('id="') || !xml.includes('name="')) {
    // 缺少必要属性，返回 null 让上层处理
    return null;
  }
  
  return xml;
}

/**
 * 从 XML 中提取工具调用信息
 * @param xml 标准格式的 <tool_call> XML
 * @returns { id: string, name: string, parameters: object } 或 null
 */
export function parseToolXML(xml: string): { id: string; name: string; parameters: Record<string, unknown> } | null {
  if (!xml || typeof xml !== 'string') return null;
  
  // 提取 id
  const idMatch = xml.match(/id="([^"]+)"/);
  // 提取 name
  const nameMatch = xml.match(/name="([^"]+)"/);
  // 提取内容（JSON 参数）
  const contentMatch = xml.match(/<tool_call[^>]*>([\s\S]*?)<\/tool_call>/i);
  
  if (!idMatch || !nameMatch || !contentMatch) return null;
  
  const id = idMatch[1];
  const name = nameMatch[1];
  let parameters: Record<string, unknown> = {};
  
  // 尝试解析 JSON
  const content = contentMatch[1].trim();
  if (content) {
    try {
      parameters = JSON.parse(content);
    } catch (e) {
      // JSON 解析失败，返回空对象
      console.warn(`Failed to parse tool parameters JSON: ${content}`);
      return null;
    }
  }
  
  return { id, name, parameters };
}

// 工具结果格式化（添加类型注解）
export function formatToolResult(toolName: string, result: string): string {
  return `Tool ${toolName} returned: ${result}\nContinue answering.`;
}
