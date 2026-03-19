import type { StreamFn } from "@mariozechner/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type TextContent,
  type ThinkingContent,
  type ToolCall,
  type ToolResultMessage,
} from "@mariozechner/pi-ai";
import {
  QwenCNWebClientBrowser,
  type QwenCNWebClientOptions,
} from "../providers/qwen-cn-web-client-browser.js";

const sessionMap = new Map<string, string>();

export function createQwenCNWebStreamFn(cookieOrJson: string): StreamFn {
  let options: QwenCNWebClientOptions;
  try {
    const parsed = JSON.parse(cookieOrJson);
    options = parsed;
  } catch {
    options = { cookie: cookieOrJson, xsrfToken: "" };
  }
  const client = new QwenCNWebClientBrowser(options);

  return (model, context, streamOptions) => {
    const stream = createAssistantMessageEventStream();

    const run = async () => {
      try {
        await client.init();

        const sessionKey = (context as unknown as { sessionId?: string }).sessionId || "default";
        let sessionId = sessionMap.get(sessionKey);

        const messages = context.messages || [];
        const systemPrompt = (context as unknown as { systemPrompt?: string }).systemPrompt || "";

        // Build tool prompt if tools are available
        const tools = context.tools || [];
        let toolPrompt = "";

        if (tools.length > 0) {
          toolPrompt = "\n## Tool Use Instructions\n";
          toolPrompt +=
            "You are equipped with specialized tools to perform actions or retrieve information. " +
            'To use a tool, output a specific XML tag: <tool_call id="unique_id" name="tool_name">{"arg": "value"}</tool_call>. ' +
            "Rules for tool use:\n" +
            "1. ALWAYS think before calling a tool. Explain your reasoning inside <think> tags.\n" +
            "2. The 'id' attribute should be a unique 8-character string for each call.\n" +
            "3. Wait for the tool result before proceeding with further analysis.\n\n" +
            "### Special Instructions for Browser Tool\n" +
            "- **Profile 'openclaw' (Independent/Recommended)**: Opens a SEPARATE independent browser window. Use this for consistent, isolated sessions. Highly recommended for complex automation.\n" +
            "- Profile 'chrome' (Shared): Uses your existing Chrome tabs (requires extension). Use this if you need to access personal logins or already open tabs.\n" +
            "- **CONSISTENCY RULE**: Once you have started using a profile (or if you are switched to 'openclaw' due to connection errors), STAY with that profile for the remainder of the session. Do NOT switch back and forth as it will open redundant browser instances.\n\n" +
            "### Automation Policy\n" +
            "- DO NOT use the 'exec' tool to install secondary automation libraries like Playwright, Selenium, or Puppeteer if the 'browser' tool fails.\n" +
            "- Instead, inform the user about the connection issue or try the alternative browser profile ('openclaw').\n" +
            "- Installing automation tools via 'exec' is slow and redundant; the 'browser' tool is the primary way to interact with web content.\n\n" +
            "### Available Tools\n";

          for (const tool of tools) {
            toolPrompt += `#### ${tool.name}\n${tool.description}\n`;
            toolPrompt += `Parameters: ${JSON.stringify(tool.parameters)}\n\n`;
          }
        }

        // Build prompt based on conversation state
        let prompt = "";

        if (!sessionId) {
          // First turn: aggregate all history including system prompt
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
                  content += part.text;
                } else if (part.type === "thinking") {
                  content += `<think>\n${part.thinking}\n</think>\n`;
                } else if (part.type === "toolCall") {
                  const tc = part;
                  content += `<tool_call id="${tc.id}" name="${tc.name}">${JSON.stringify(tc.arguments)}</tool_call>`;
                }
              }
            } else {
              content = String(m.content);
            }
            historyParts.push(`${role}: ${content}`);
          }
          prompt = historyParts.join("\n\n");
        } else {
          // Continuing turn: check if last message is toolResult or user
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
                prompt = lastUserMessage.content
                  .filter((part) => part.type === "text")
                  .map((part) => (part as TextContent).text)
                  .join("");
              }
            }
          }
        }

        // Add tool reminder for continuing conversations
        if (toolPrompt && sessionId) {
          prompt +=
            '\n\n[SYSTEM HINT]: Keep in mind your available tools. To use a tool, you MUST output the EXACT XML format: <tool_call id="unique_id" name="tool_name">{"arg": "value"}</tool_call>. Using plain text to describe your action will FAIL to execute the tool.';
        }

        if (!prompt) {
          throw new Error("No message found to send to Qwen API");
        }

        console.log(`[QwenCNWebStream] Starting run for session: ${sessionKey}`);
        console.log(`[QwenCNWebStream] Conversation ID: ${sessionId || "new"}`);
        console.log(`[QwenCNWebStream] Tools available: ${tools.length}`);
        console.log(`[QwenCNWebStream] Prompt length: ${prompt.length}`);

        const responseStream = await client.chatCompletions({
          sessionId,
          message: prompt,
          model: model.id,
          signal: streamOptions?.signal,
        });

        if (!responseStream) {
          throw new Error("Qwen API returned empty response body");
        }

        const reader = responseStream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const indexMap = new Map<string, number>();
        let nextIndex = 0;
        const contentParts: (TextContent | ThinkingContent | ToolCall)[] = [];
        const accumulatedToolCalls: {
          id: string;
          name: string;
          arguments: string;
          index: number;
        }[] = [];

        const createPartial = (): AssistantMessage => {
          const msg: AssistantMessage = {
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
          };
          (msg as AssistantMessage & { thinking_enabled?: boolean }).thinking_enabled =
            contentParts.some((p) => p.type === "thinking");
          return msg;
        };

        let currentMode: "text" | "thinking" | "tool_call" = "text";
        let currentToolName = "";
        let currentToolIndex = 0;
        let tagBuffer = "";

        const emitDelta = (
          type: "text" | "thinking" | "toolcall",
          delta: string,
          forceId?: string,
        ) => {
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
            } else if (type === "thinking") {
              contentParts[index] = { type: "thinking", thinking: "" };
              stream.push({
                type: "thinking_start",
                contentIndex: index,
                partial: createPartial(),
              });
            } else if (type === "toolcall") {
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
          } else if (type === "thinking") {
            (contentParts[index] as ThinkingContent).thinking += delta;
            stream.push({
              type: "thinking_delta",
              contentIndex: index,
              delta,
              partial: createPartial(),
            });
          } else if (type === "toolcall") {
            accumulatedToolCalls[currentToolIndex].arguments += delta;
            stream.push({
              type: "toolcall_delta",
              contentIndex: index,
              delta,
              partial: createPartial(),
            });
          }
        };

        const pushDelta = (delta: string, forceType?: "text" | "thinking") => {
          if (!delta) {
            return;
          }
          if (forceType === "thinking") {
            emitDelta("thinking", delta);
            return;
          }
          tagBuffer += delta;

          const checkTags = () => {
            const thinkStart = tagBuffer.match(/<think\b[^<>]*>/i);
            const thinkEnd = tagBuffer.match(/<\/think\b[^<>]*>/i);
            const toolCallStart = tagBuffer.match(
              /<tool_call\s*(?:id=['"]?([^'"]+)['"]?\s*)?name=['"]?([^'"]+)['"]?\s*>/i,
            );
            const toolCallEnd = tagBuffer.match(/<\/tool_call\s*>/i);

            const indices = [
              {
                type: "think_start",
                idx: thinkStart?.index ?? -1,
                len: thinkStart?.[0].length ?? 0,
              },
              { type: "think_end", idx: thinkEnd?.index ?? -1, len: thinkEnd?.[0].length ?? 0 },
              {
                type: "tool_start",
                idx: toolCallStart?.index ?? -1,
                len: toolCallStart?.[0].length ?? 0,
                id: toolCallStart?.[1],
                name: toolCallStart?.[2],
              },
              {
                type: "tool_end",
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
                if (currentMode === "thinking") {
                  emitDelta("thinking", before);
                } else if (currentMode === "tool_call") {
                  emitDelta("toolcall", before);
                } else {
                  emitDelta("text", before);
                }
              }

              if (first.type === "think_start") {
                currentMode = "thinking";
              } else if (first.type === "think_end") {
                currentMode = "text";
              } else if (first.type === "tool_start") {
                currentMode = "tool_call";
                currentToolName = first.name!;
                emitDelta("toolcall", "", first.id);
              } else if (first.type === "tool_end") {
                const index = indexMap.get(`tool_${currentToolIndex}`);
                if (index !== undefined) {
                  const part = contentParts[index] as ToolCall;
                  const argStr = accumulatedToolCalls[currentToolIndex].arguments || "{}";

                  let cleanedArg = argStr.trim();
                  if (cleanedArg.startsWith("```json")) {
                    cleanedArg = cleanedArg.substring(7);
                  } else if (cleanedArg.startsWith("```")) {
                    cleanedArg = cleanedArg.substring(3);
                  }
                  if (cleanedArg.endsWith("```")) {
                    cleanedArg = cleanedArg.substring(0, cleanedArg.length - 3);
                  }
                  cleanedArg = cleanedArg.trim();

                  try {
                    part.arguments = JSON.parse(cleanedArg);
                  } catch (e) {
                    part.arguments = { raw: argStr };
                    console.error(
                      `[Qwen Stream] Failed to parse JSON for tool call ${currentToolName}:`,
                      argStr,
                      "\nError:",
                      e,
                    );
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
              }
              tagBuffer = tagBuffer.slice(first.idx + first.len);
              checkTags();
            } else {
              const lastAngle = tagBuffer.lastIndexOf("<");
              if (lastAngle === -1) {
                const mode =
                  currentMode === "thinking"
                    ? "thinking"
                    : currentMode === "tool_call"
                      ? "toolcall"
                      : "text";
                emitDelta(mode, tagBuffer);
                tagBuffer = "";
              } else if (lastAngle > 0) {
                const safe = tagBuffer.slice(0, lastAngle);
                const mode =
                  currentMode === "thinking"
                    ? "thinking"
                    : currentMode === "tool_call"
                      ? "toolcall"
                      : "text";
                emitDelta(mode, safe);
                tagBuffer = tagBuffer.slice(lastAngle);
              }
            }
          };
          checkTags();
        };

        let hasExtractedContent = false;
        let lastExtractedContent = "";
        const processLine = (line: string) => {
          if (!line) {
            return;
          }

          // Parse SSE format: event: xxx\ndata: yyy
          // Current line could be event: or data:
          if (line.startsWith("event:")) {
            const eventType = line.slice(6).trim();
            console.log(`[QwenCNWebStream] SSE event type: ${eventType}`);
            return;
          }

          if (!line.startsWith("data:")) {
            return;
          }

          const dataStr = line.slice(5).trim();
          if (dataStr === "[DONE]" || !dataStr) {
            return;
          }

          try {
            const data = JSON.parse(dataStr);
            console.log(`[QwenCNWebStream] Parsed data keys: ${Object.keys(data).join(", ")}`);
            if (Object.keys(data).length > 0) {
              console.log(
                `[QwenCNWebStream] Data sample: ${JSON.stringify(data).substring(0, 200)}...`,
              );
            }
            // Deep debug for data.data
            if (data.data && typeof data.data === "object") {
              console.log(`[QwenCNWebStream] data.data keys: ${Object.keys(data.data).join(", ")}`);
              if (data.data.messages && Array.isArray(data.data.messages)) {
                console.log(
                  `[QwenCNWebStream] messages array length: ${data.data.messages.length}`,
                );
                for (let i = 0; i < data.data.messages.length; i++) {
                  const msg = data.data.messages[i];
                  console.log(
                    `[QwenCNWebStream] messages[${i}] keys: ${Object.keys(msg).join(", ")}`,
                  );
                  if (msg.content)
                    console.log(
                      `[QwenCNWebStream] messages[${i}].content: "${String(msg.content).substring(0, 100)}"`,
                    );
                  if (msg.text)
                    console.log(
                      `[QwenCNWebStream] messages[${i}].text: "${String(msg.text).substring(0, 100)}"`,
                    );
                  if (msg.delta)
                    console.log(
                      `[QwenCNWebStream] messages[${i}].delta: "${String(msg.delta).substring(0, 100)}"`,
                    );
                }
              }
            }

            // Extract conversation ID
            if (data.sessionId || data.sessionId) {
              sessionMap.set(sessionKey, data.sessionId || data.sessionId);
            }

            // Extract content delta - Qwen v2 uses choices[0].delta.content
            // Qwen CN Web returns different structure
            console.log(
              `[QwenCNWebStream] Debug data.data: ${JSON.stringify(data.data)?.substring(0, 200)}`,
            );
            console.log(
              `[QwenCNWebStream] Debug data.communication: ${JSON.stringify(data.communication)?.substring(0, 200)}`,
            );

            // Debug messages array if present
            if (
              data.data?.messages &&
              Array.isArray(data.data.messages) &&
              data.data.messages.length > 0
            ) {
              console.log(
                `[QwenCNWebStream] Debug messages[0]: ${JSON.stringify(data.data.messages[0])?.substring(0, 300)}`,
              );
              // Check for content in various possible locations
              const msg = data.data.messages[0];
              console.log(`[QwenCNWebStream] Debug msg keys: ${Object.keys(msg).join(", ")}`);
              if (msg.content)
                console.log(
                  `[QwenCNWebStream] Debug msg.content: ${typeof msg.content} = "${String(msg.content).substring(0, 100)}"`,
                );
              if (msg.text)
                console.log(
                  `[QwenCNWebStream] Debug msg.text: ${typeof msg.text} = "${String(msg.text).substring(0, 100)}"`,
                );
              if (msg.delta)
                console.log(
                  `[QwenCNWebStream] Debug msg.delta: ${typeof msg.delta} = "${String(msg.delta).substring(0, 100)}"`,
                );
            }

            let delta = "";
            // Qwen CN Web specific extraction
            if (data.data?.messages && Array.isArray(data.data.messages)) {
              // Find the last message with content field (likely assistant response)
              for (let i = data.data.messages.length - 1; i >= 0; i--) {
                const msg = data.data.messages[i];
                if (msg.content && typeof msg.content === "string") {
                  delta = msg.content;
                  console.log(
                    `[QwenCNWebStream] Extracted content from messages[${i}], length: ${delta.length}`,
                  );
                  break;
                }
              }
            }

            // Fallback to other fields if no content found in messages
            if (!delta) {
              delta = data.choices?.[0]?.delta?.content;
              if (!delta && data.data) {
                delta = data.data.text ?? data.data.content ?? data.data.delta;
              }
              if (!delta && data.communication) {
                delta = data.communication.text ?? data.communication.content;
              }
              if (!delta) {
                delta = data.text ?? data.content ?? data.delta;
              }
            }
            console.log(`[QwenCNWebStream] Delta extracted: ${typeof delta}, value="${delta}"`);
            if (typeof delta === "string" && delta) {
              // Avoid duplicate content from multiple SSE events
              if (delta !== lastExtractedContent) {
                lastExtractedContent = delta;
                pushDelta(delta);
              } else {
                console.log(`[QwenCNWebStream] Skipping duplicate content`);
              }
            }
          } catch {
            // Ignore parse errors
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

        // Flush remaining tag buffer
        if (tagBuffer) {
          const mode =
            (currentMode as string) === "thinking"
              ? "thinking"
              : (currentMode as string) === "tool_call"
                ? "toolcall"
                : "text";
          emitDelta(mode, tagBuffer);
        }

        console.log(
          `[QwenCNWebStream] Stream completed. Parts: ${contentParts.length}, Tools: ${accumulatedToolCalls.length}`,
        );

        stream.push({
          type: "done",
          reason: accumulatedToolCalls.length > 0 ? "toolUse" : "stop",
          message: createPartial(),
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
