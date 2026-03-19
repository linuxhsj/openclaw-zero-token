import type { StreamFn } from "@mariozechner/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type TextContent,
  type ToolCall,
  type ToolResultMessage,
} from "@mariozechner/pi-ai";
import {
  GeminiWebClientBrowser,
  type GeminiWebClientOptions,
} from "../providers/gemini-web-client-browser.js";

// Helper to strip messages for web providers
function stripForWebProvider(prompt: string): string {
  return prompt;
}

// Helper to build XML tool prompt section
function buildXmlToolPromptSection(tools: unknown[]): string {
  if (!tools || tools.length === 0) return "";
  return "\n## Tool Use Instructions\n";
}

// Helper to get XML tool reminder
function getXmlToolReminder(): string {
  return "\nRemember to use tools when needed.";
}

const conversationMap = new Map<string, string>();

export function createGeminiWebStreamFn(cookieOrJson: string): StreamFn {
  let options: GeminiWebClientOptions;
  try {
    const parsed = JSON.parse(cookieOrJson);
    options = typeof parsed === "string" ? { cookie: parsed, userAgent: "Mozilla/5.0" } : parsed;
  } catch {
    options = { cookie: cookieOrJson, userAgent: "Mozilla/5.0" };
  }
  const client = new GeminiWebClientBrowser(options);

  return (model, context, streamOptions) => {
    const stream = createAssistantMessageEventStream();

    const run = async () => {
      try {
        await client.init();

        const sessionKey = (context as unknown as { sessionId?: string }).sessionId || "default";
        let conversationId = conversationMap.get(sessionKey);

        const messages = context.messages || [];
        const systemPrompt = (context as unknown as { systemPrompt?: string }).systemPrompt || "";
        const tools = context.tools || [];
        const toolPrompt = buildXmlToolPromptSection(tools);

        let prompt = "";

        if (tools.length > 0) {
          // Full conversation with tool support: first turn = full history, continuing = last message only
          if (!conversationId) {
            const historyParts: string[] = [];
            let systemPromptContent = systemPrompt;
            if (toolPrompt) {
              systemPromptContent += toolPrompt;
            }
            if (systemPromptContent && !messages.some((m) => (m.role as string) === "system")) {
              historyParts.push(`System: ${systemPromptContent}`);
            }
            for (const m of messages) {
              const role = m.role === "user" || m.role === "toolResult" ? "User" : "Assistant";
              let content = "";
              if (m.role === "toolResult") {
                const tr = m as unknown as ToolResultMessage;
                let resultText = "";
                if (Array.isArray(tr.content)) {
                  for (const part of tr.content) {
                    if (part.type === "text") {
                      resultText += part.text;
                    }
                  }
                }
                content = `\n<tool_response id="${tr.toolCallId}" name="${tr.toolName}">\n${resultText}\n</tool_response>\n`;
              } else if (Array.isArray(m.content)) {
                for (const part of m.content) {
                  if (part.type === "text") {
                    content += (part as TextContent).text;
                  } else if (part.type === "toolCall") {
                    const tc = part as ToolCall;
                    content += `<tool_call id="${tc.id}" name="${tc.name}">${JSON.stringify(tc.arguments)}</tool_call>`;
                  }
                }
              } else {
                content = String(m.content);
              }
              if (m.role === "user" && content) {
                content = stripForWebProvider(content) || content;
              }
              historyParts.push(`${role}: ${content}`);
            }
            prompt = historyParts.join("\n\n");
          } else {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.role === "toolResult") {
              const tr = lastMsg as unknown as ToolResultMessage;
              let resultText = "";
              if (Array.isArray(tr.content)) {
                for (const part of tr.content) {
                  if (part.type === "text") {
                    resultText += part.text;
                  }
                }
              }
              prompt = `\n<tool_response id="${tr.toolCallId}" name="${tr.toolName}">\n${resultText}\n</tool_response>\n\nPlease proceed based on this tool result.`;
            } else {
              const lastUserMessage = [...messages].toReversed().find((m) => m.role === "user");
              if (lastUserMessage) {
                if (typeof lastUserMessage.content === "string") {
                  prompt = lastUserMessage.content;
                } else if (Array.isArray(lastUserMessage.content)) {
                  prompt = (lastUserMessage.content as TextContent[])
                    .filter((part) => part.type === "text")
                    .map((part) => part.text)
                    .join("");
                }
                prompt = stripForWebProvider(prompt) || prompt;
              }
            }
            if (toolPrompt) {
              prompt += getXmlToolReminder();
            }
          }
        } else {
          // No tools: original behaviour – only last user message
          const lastUserMessage = [...messages].toReversed().find((m) => m.role === "user");
          if (lastUserMessage) {
            if (typeof lastUserMessage.content === "string") {
              prompt = lastUserMessage.content;
            } else if (Array.isArray(lastUserMessage.content)) {
              prompt = (lastUserMessage.content as TextContent[])
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("");
            }
          }
        }

        if (!prompt) {
          throw new Error("No message found to send to Gemini API");
        }

        const cleanPrompt = stripForWebProvider(prompt);
        if (!cleanPrompt) {
          throw new Error("No message content to send after stripping metadata");
        }

        console.log(`[GeminiWebStream] Starting run for session: ${sessionKey}`);
        console.log(`[GeminiWebStream] Conversation ID: ${conversationId || "new"}`);
        console.log(
          `[GeminiWebStream] Tools: ${tools.length}, prompt length: ${cleanPrompt.length}`,
        );

        const responseStream = await client.chatCompletions({
          conversationId,
          message: cleanPrompt,
          model: model.id,
          signal: streamOptions?.signal,
        });

        if (!responseStream) {
          throw new Error("Gemini API returned empty response body");
        }

        const reader = responseStream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const contentParts: (TextContent | ToolCall)[] = [];
        const accumulatedToolCalls: {
          id: string;
          name: string;
          arguments: string;
          index: number;
        }[] = [];
        const indexMap = new Map<string, number>();
        let nextIndex = 0;
        let currentMode: "text" | "toolcall" = "text";
        let currentToolName = "";
        let currentToolIndex = 0;
        let tagBuffer = "";

        const createPartial = (): AssistantMessage => ({
          role: "assistant",
          content: [...contentParts],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: accumulatedToolCalls.length > 0 ? "toolUse" : "stop",
          timestamp: Date.now(),
        });

        const emitDelta = (type: "text" | "toolcall", delta: string, forceId?: string) => {
          if (delta === "" && type !== "toolcall") {
            return;
          }
          const key = type === "toolcall" ? `tool_${currentToolIndex}` : type;
          if (!indexMap.has(key)) {
            const index = nextIndex++;
            indexMap.set(key, index);
            if (type === "text") {
              contentParts[index] = { type: "text", text: "" };
              stream.push({ type: "text_start", contentIndex: index, partial: createPartial() });
            } else {
              const toolId = forceId || `call_${Date.now()}_${index}`;
              contentParts[index] = {
                type: "toolCall",
                id: toolId,
                name: currentToolName,
                arguments: {},
              };
              accumulatedToolCalls[currentToolIndex] = {
                id: toolId,
                name: currentToolName,
                arguments: "",
                index: currentToolIndex,
              };
              stream.push({
                type: "toolcall_start",
                contentIndex: index,
                partial: createPartial(),
              });
            }
          }
          const index = indexMap.get(key)!;
          if (type === "text") {
            (contentParts[index] as TextContent).text += delta;
            stream.push({
              type: "text_delta",
              contentIndex: index,
              delta,
              partial: createPartial(),
            });
          } else {
            accumulatedToolCalls[currentToolIndex].arguments += delta;
            stream.push({
              type: "toolcall_delta",
              contentIndex: index,
              delta,
              partial: createPartial(),
            });
          }
        };

        const pushDelta = (delta: string) => {
          if (!delta) {
            return;
          }
          if (tools.length === 0) {
            if (contentParts.length === 0) {
              contentParts[0] = { type: "text", text: "" };
              stream.push({ type: "text_start", contentIndex: 0, partial: createPartial() });
            }
            (contentParts[0] as TextContent).text += delta;
            stream.push({
              type: "text_delta",
              contentIndex: 0,
              delta,
              partial: createPartial(),
            });
            return;
          }
          tagBuffer += delta;
          const checkTags = () => {
            const toolCallStart = tagBuffer.match(
              /<tool_call\s*(?:id=['"]?([^'"]+)['"]?\s*)?name=['"]?([^'"]+)['"]?\s*>/i,
            );
            const toolCallEnd = tagBuffer.match(/<\/tool_call\s*>/i);
            const indices = [
              {
                type: "tool_start" as const,
                idx: toolCallStart?.index ?? -1,
                len: toolCallStart?.[0].length ?? 0,
                id: toolCallStart?.[1],
                name: toolCallStart?.[2],
              },
              {
                type: "tool_end" as const,
                idx: toolCallEnd?.index ?? -1,
                len: toolCallEnd?.[0].length ?? 0,
              },
            ]
              .filter((t) => t.idx !== -1)
              .toSorted((a, b) => a.idx - b.idx);

            if (indices.length > 0) {
              const first = indices[0];
              const before = tagBuffer.slice(0, first.idx);
              if (before) {
                if (currentMode === "toolcall") {
                  emitDelta("toolcall", before);
                } else {
                  emitDelta("text", before);
                }
              }
              if (first.type === "tool_start") {
                currentMode = "toolcall";
                currentToolName = first.name ?? "";
                emitDelta("toolcall", "", first.id ?? undefined);
              } else if (first.type === "tool_end") {
                const index = indexMap.get(`tool_${currentToolIndex}`);
                if (index !== undefined) {
                  const part = contentParts[index] as ToolCall;
                  let argStr = accumulatedToolCalls[currentToolIndex]?.arguments ?? "{}";
                  let cleaned = argStr.trim();
                  if (cleaned.startsWith("```json")) {
                    cleaned = cleaned.slice(7);
                  } else if (cleaned.startsWith("```")) {
                    cleaned = cleaned.slice(3);
                  }
                  if (cleaned.endsWith("```")) {
                    cleaned = cleaned.slice(0, -3);
                  }
                  cleaned = cleaned.trim();
                  try {
                    part.arguments = JSON.parse(cleaned);
                  } catch {
                    part.arguments = { raw: argStr };
                  }
                  stream.push({
                    type: "toolcall_end",
                    contentIndex: index,
                    toolCall: part,
                    partial: createPartial(),
                  });
                }
                currentMode = "text";
                currentToolIndex++;
                currentToolName = "";
              }
              tagBuffer = tagBuffer.slice(first.idx + first.len);
              checkTags();
            } else {
              const lastAngle = tagBuffer.lastIndexOf("<");
              if (lastAngle === -1) {
                const mode = currentMode === "toolcall" ? "toolcall" : "text";
                emitDelta(mode === "toolcall" ? "toolcall" : "text", tagBuffer);
                tagBuffer = "";
              } else if (lastAngle > 0) {
                const safe = tagBuffer.slice(0, lastAngle);
                emitDelta(currentMode === "toolcall" ? "toolcall" : "text", safe);
                tagBuffer = tagBuffer.slice(lastAngle);
              }
            }
          };
          checkTags();
        };

        const processLine = (line: string) => {
          if (!line || !line.startsWith("data:")) {
            return;
          }
          const dataStr = line.slice(5).trim();
          if (dataStr === "[DONE]" || !dataStr) {
            return;
          }
          try {
            const data = JSON.parse(dataStr);
            if (data.conversation_id) {
              conversationMap.set(sessionKey, data.conversation_id);
            }
            const delta = data.text || data.content || data.delta;
            if (typeof delta === "string" && delta) {
              pushDelta(delta);
            }
          } catch {
            // ignore
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.trim()) {
              processLine(buffer.trim());
            }
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          const combined = buffer + chunk;
          const parts = combined.split("\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            processLine(part.trim());
          }
        }

        if (tools.length > 0 && tagBuffer) {
          const mode = currentMode as "text" | "toolcall";
          if (mode === "toolcall") {
            emitDelta("toolcall", tagBuffer);
          } else {
            emitDelta("text", tagBuffer);
          }
        }

        const stopReason = accumulatedToolCalls.length > 0 ? "toolUse" : "stop";
        const assistantMessage: AssistantMessage = {
          role: "assistant",
          content: contentParts.length > 0 ? contentParts : [{ type: "text", text: "" }],
          stopReason,
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          timestamp: Date.now(),
        };

        stream.push({
          type: "done",
          reason: stopReason,
          message: assistantMessage,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        stream.push({
          type: "error",
          reason: "error",
          error: {
            role: "assistant",
            content: [],
            stopReason: "error",
            errorMessage,
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            timestamp: Date.now(),
          },
        } as any);
      } finally {
        stream.end();
      }
    };

    queueMicrotask(() => void run());
    return stream;
  };
}
