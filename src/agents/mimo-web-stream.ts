// src/agents/mimo-web-stream.ts
import { Readable } from "stream";

export interface MimoStreamOptions {
  credentials: {
    cookie: string;
    bearer?: string;
    userAgent?: string;
    sessionId?: string;
  };
  baseUrl?: string;
}

export type MimoStreamFn = (
  messages: Array<{ role: string; content: string }>,
  model: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
  },
) => Promise<Readable>;

export function createMimoWebStreamFn(credentials: MimoStreamOptions["credentials"]): MimoStreamFn {
  return async (messages, model, options = {}) => {
    const { MimoWebClient } = await import("./mimo-web-client");

    const client = new MimoWebClient({
      cookie: credentials.cookie,
      bearer: credentials.bearer,
      userAgent: credentials.userAgent,
      sessionId: credentials.sessionId,
    });

    try {
      const stream = await client.chatCompletions({
        model,
        messages: messages as any,
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 4096,
        stream: true,
      });

      // Transform MiMo's response format to OpenClaw's expected format
      return transformMimoStream(stream);
    } catch (error) {
      throw new Error(`MiMo stream error: ${error}`);
    }
  };
}

function transformMimoStream(stream: Readable): Readable {
  const transformed = new Readable({
    read() {},
  });

  let buffer = "";

  stream.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();

    // Process complete SSE messages
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim() === "") continue;

      if (line.startsWith("data: ")) {
        const data = line.slice(6);

        if (data === "[DONE]") {
          transformed.push("data: [DONE]\n\n");
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const transformedData = transformMimoChunk(parsed);
          transformed.push(`data: ${JSON.stringify(transformedData)}\n\n`);
        } catch (error) {
          // Pass through if we can't parse
          transformed.push(`data: ${data}\n\n`);
        }
      } else if (line.startsWith(":")) {
        // Comment line, pass through
        transformed.push(`${line}\n`);
      }
    }
  });

  stream.on("end", () => {
    transformed.push(null);
  });

  stream.on("error", (error) => {
    transformed.destroy(error);
  });

  return transformed;
}

function transformMimoChunk(mimoChunk: any): any {
  // Handle different possible response formats from MiMo
  if (mimoChunk.choices && Array.isArray(mimoChunk.choices)) {
    // Already in expected format
    return mimoChunk;
  }

  // Transform from alternative formats
  const content =
    mimoChunk.content || mimoChunk.text || mimoChunk.response || mimoChunk.message?.content || "";

  return {
    id: mimoChunk.id || "mimo-" + Date.now(),
    object: "chat.completion.chunk",
    created: mimoChunk.created || Date.now(),
    model: mimoChunk.model || "mimo-v1",
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          content: content,
        },
        finish_reason: mimoChunk.finish_reason || (mimoChunk.done ? "stop" : null),
      },
    ],
  };
}

// Tool calling support for MiMo
export function supportsMimoToolCalling(model: string): boolean {
  // MiMo models that support tool calling
  const toolCapableModels = ["mimo-v1", "mimo-v1-pro", "mimo-v1-turbo"];

  return toolCapableModels.some((m) => model.toLowerCase().includes(m));
}

export function formatMimoTools(tools: any[]): any[] {
  // Convert OpenClaw tool format to MiMo's expected format
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
