/**
 * Per-model tool calling prompt templates.
 *
 * Reference:
 * - Paper: https://arxiv.org/html/2407.04997v1
 * - ComfyUI LLM Party: https://github.com/heshengtao/comfyui_LLM_party
 */

import { toolDefsJson } from "./web-tool-defs.js";

const TOOL_DEFS = toolDefsJson();

// Example-based teaching (key insight from arXiv:2407.04997 and ComfyUI LLM Party):
// A trivial example teaches the model the output format without confusing it with real tools.
const TOOL_EXAMPLE = `## Tool Call Format
You MUST use EXACT XML format to call tools. Plain text descriptions WILL NOT work.
Single tool call example:
<tool_call id="call_001" name="plus_one">
{"name":"plus_one","arguments":{"number":"5"}}
</tool_call>
(plus_one is just an example, not a real tool)`;

const EN_TEMPLATE = `Tools: ${TOOL_DEFS}

${TOOL_EXAMPLE}

Your actual tools are listed above. To use one, reply ONLY with the XML tool_call block,
and ensure the inner JSON includes "name" and "arguments".
No tool needed? Answer directly.

`;

const EN_STRICT_TEMPLATE = `Tools: ${TOOL_DEFS}

${TOOL_EXAMPLE}

Your actual tools are listed above. To use one, reply ONLY with the XML tool_call block. No extra text.
No tool needed? Answer directly.

`;

const CN_TEMPLATE = `工具: ${TOOL_DEFS}

## 工具调用格式
必须使用精确的XML格式调用工具，纯文本描述无效。
单工具调用示例：
<tool_call id="call_001" name="plus_one">
{"name":"plus_one","arguments":{"number":"5"}}
</tool_call>
(plus_one仅为示例，非真实工具)

你的真实工具见上方列表。需要时只回复XML tool_call块，
且块内JSON必须包含"name"和"arguments"。不需要则直接回答。
`;

/** No web models skip prompt injection — web interfaces don't pass native tools.
 *  Even DeepSeek/Claude/GLM need prompt injection when accessed via browser. */
const NATIVE_TOOL_MODELS = new Set<string>();

/** Models excluded from tool calling entirely */
const EXCLUDED_MODELS = new Set(["perplexity-web", "doubao-web"]);

/** Chinese-language models */
const CN_MODELS = new Set([
  "deepseek-web",
  "doubao-web",
  "qwen-cn-web",
  "kimi-web",
  "glm-web",
  "xiaomimo-web",
]);

/** Models that tend to add extra text after XML */
const STRICT_MODELS = new Set(["chatgpt-web"]);

export function shouldInjectToolPrompt(api: string): boolean {
  return !NATIVE_TOOL_MODELS.has(api) && !EXCLUDED_MODELS.has(api);
}

export function getToolPrompt(api: string): string {
  if (STRICT_MODELS.has(api)) {
    return EN_STRICT_TEMPLATE;
  }
  if (CN_MODELS.has(api)) {
    return CN_TEMPLATE;
  }
  return EN_TEMPLATE;
}

/** Format tool result for feedback to the model */
export function formatToolResult(toolName: string, result: string): string {
  return `Tool ${toolName} returned: ${result}\nPlease continue answering based on this result.`;
}
