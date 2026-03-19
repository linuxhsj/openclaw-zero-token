// src/providers/mimo-web-client.ts
import { Readable } from "stream";

export interface MimoModel {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  description?: string;
}

export interface MimoChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface MimoChatParams {
  model: string;
  messages: MimoChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export class MimoWebClient {
  private baseUrl: string;
  private cookie: string;
  private bearer: string;
  private userAgent: string;
  private sessionId?: string;

  constructor(options: {
    cookie: string;
    bearer?: string;
    userAgent?: string;
    sessionId?: string;
  }) {
    this.baseUrl = "https://aistudio.xiaomimimo.com";
    this.cookie = options.cookie;
    this.bearer = options.bearer || "";
    this.userAgent = options.userAgent || "Mozilla/5.0";
    this.sessionId = options.sessionId;
  }

  async getModels(): Promise<MimoModel[]> {
    try {
      // Try to fetch available models from MiMo API
      const response = await this.makeRequest("/api/models", "GET");

      if (response.ok) {
        const data = await response.json();
        return this.parseModels(data);
      }
    } catch (error) {
      console.warn("Failed to fetch MiMo models via API, using defaults");
    }

    // Return default MiMo models if API call fails
    return [
      {
        id: "mimo-v1",
        name: "MiMo V1",
        contextWindow: 128000,
        maxTokens: 4096,
        description: "Xiaomi MiMo V1 Model",
      },
      {
        id: "mimo-v1-pro",
        name: "MiMo V1 Pro",
        contextWindow: 256000,
        maxTokens: 8192,
        description: "Xiaomi MiMo V1 Pro Model",
      },
      {
        id: "mimo-v1-lite",
        name: "MiMo V1 Lite",
        contextWindow: 64000,
        maxTokens: 2048,
        description: "Xiaomi MiMo V1 Lite Model",
      },
    ];
  }

  async chatCompletions(params: MimoChatParams): Promise<Readable> {
    const { model, messages, temperature = 0.7, maxTokens = 4096, stream = true } = params;

    // Prepare the request payload
    const payload = {
      model,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature,
      max_tokens: maxTokens,
      stream,
    };

    // Try different possible API endpoints
    const endpoints = [
      "/api/v1/chat/completions",
      "/api/chat/completions",
      "/api/completions",
      "/v1/chat/completions",
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await this.makeRequest(endpoint, "POST", payload);

        if (response.ok) {
          if (stream) {
            return response.body as unknown as Readable;
          } else {
            const data = await response.json();
            return this.createStreamFromResponse(data);
          }
        }
      } catch (error) {
        // Try next endpoint
        continue;
      }
    }

    throw new Error("Failed to find working MiMo API endpoint");
  }

  private async makeRequest(path: string, method: "GET" | "POST", body?: any): Promise<Response> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      "User-Agent": this.userAgent,
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: this.cookie,
    };

    if (this.bearer) {
      headers["Authorization"] = `Bearer ${this.bearer}`;
    }

    if (this.sessionId) {
      headers["X-Session-ID"] = this.sessionId;
    }

    const options: RequestInit = {
      method,
      headers,
      credentials: "include",
    };

    if (body && method === "POST") {
      options.body = JSON.stringify(body);
    }

    return fetch(url, options);
  }

  private parseModels(data: any): MimoModel[] {
    // Handle different response formats
    if (Array.isArray(data)) {
      return data.map((item) => ({
        id: item.id || item.model || item.name,
        name: item.name || item.model || item.id,
        contextWindow: item.context_length || item.contextWindow || 128000,
        maxTokens: item.max_tokens || item.maxTokens || 4096,
        description: item.description,
      }));
    }

    if (data.models && Array.isArray(data.models)) {
      return this.parseModels(data.models);
    }

    if (data.data && Array.isArray(data.data)) {
      return this.parseModels(data.data);
    }

    return [];
  }

  private createStreamFromResponse(data: any): Readable {
    const stream = new Readable({
      read() {},
    });

    // Convert non-streaming response to streaming format
    const content =
      data.choices?.[0]?.message?.content || data.content || data.text || JSON.stringify(data);

    const chunk = {
      id: data.id || "mimo-" + Date.now(),
      object: "chat.completion.chunk",
      created: data.created || Date.now(),
      model: data.model || "mimo-v1",
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            content: content,
          },
          finish_reason: "stop",
        },
      ],
    };

    stream.push(`data: ${JSON.stringify(chunk)}\n\n`);
    stream.push("data: [DONE]\n\n");
    stream.push(null);

    return stream;
  }

  // Test connection to MiMo
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.makeRequest("/api/health", "GET");
      return response.ok;
    } catch {
      try {
        // Fallback: try to access the main page
        const response = await this.makeRequest("/", "GET");
        return response.ok;
      } catch {
        return false;
      }
    }
  }
}
