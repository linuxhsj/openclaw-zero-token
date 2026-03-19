import crypto from "node:crypto";
import type { ModelDefinitionConfig } from "../config/types.models.js";

export interface DoubaoAuth {
  sessionid: string;
  ttwid?: string;
  userAgent?: string;
  // 动态参数（可选，可以从浏览器实时获取）
  msToken?: string;
  a_bogus?: string;
  fp?: string; // s_v_web_id
  tea_uuid?: string;
  device_id?: string;
  web_tab_id?: string;
  // 额外参数（从浏览器捕获）
  aid?: string;
  version_code?: string;
  pc_version?: string;
  region?: string;
  language?: string;
}

export interface DoubaoMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface DoubaoChatRequest {
  model: string;
  messages: DoubaoMessage[];
  stream?: boolean;
  conversation_id?: string;
}

export interface DoubaoChatResponse {
  id: string;
  model: string;
  object: string;
  choices: Array<{
    index: number;
    message?: {
      role: string;
      content: string;
    };
    delta?: {
      content?: string;
      role?: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  created: number;
}

const DOUBAO_API_BASE = "https://www.doubao.com";
/** 使用 /samantha/chat/completion 端点获取流式响应 */
const USE_SAMANTHA_API = true;

export interface DoubaoWebClientConfig {
  // 从浏览器捕获的查询参数
  aid?: string;
  device_id?: string;
  device_platform?: string;
  fp?: string;
  language?: string;
  pc_version?: string;
  pkg_type?: string;
  real_aid?: string;
  region?: string;
  samantha_web?: string;
  sys_region?: string;
  tea_uuid?: string;
  use_olympus_account?: string;
  version_code?: string;
  web_id?: string;
  web_tab_id?: string;
  // 动态生成的参数（需要从浏览器实时获取）
  msToken?: string;
  a_bogus?: string;
}

export class DoubaoWebClient {
  private auth: DoubaoAuth;
  private config: DoubaoWebClientConfig;

  constructor(auth: DoubaoAuth | string, config: DoubaoWebClientConfig = {}) {
    if (typeof auth === "string") {
      try {
        this.auth = JSON.parse(auth);
      } catch {
        this.auth = { sessionid: auth };
      }
    } else {
      this.auth = auth;
    }

    // 从auth中提取动态参数到config
    const dynamicConfig: Partial<DoubaoWebClientConfig> = {};
    if (this.auth.msToken) dynamicConfig.msToken = this.auth.msToken;
    if (this.auth.a_bogus) dynamicConfig.a_bogus = this.auth.a_bogus;
    if (this.auth.fp) dynamicConfig.fp = this.auth.fp;
    if (this.auth.tea_uuid) dynamicConfig.tea_uuid = this.auth.tea_uuid;
    if (this.auth.device_id) dynamicConfig.device_id = this.auth.device_id;
    if (this.auth.web_tab_id) dynamicConfig.web_tab_id = this.auth.web_tab_id;
    if (this.auth.aid) dynamicConfig.aid = this.auth.aid;
    if (this.auth.version_code) dynamicConfig.version_code = this.auth.version_code;
    if (this.auth.pc_version) dynamicConfig.pc_version = this.auth.pc_version;
    if (this.auth.region) dynamicConfig.region = this.auth.region;
    if (this.auth.language) dynamicConfig.language = this.auth.language;

    // 设置默认配置
    this.config = {
      aid: "497858",
      device_platform: "web",
      language: "zh",
      pkg_type: "release_version",
      real_aid: "497858",
      region: "CN",
      samantha_web: "1",
      sys_region: "CN",
      use_olympus_account: "1",
      version_code: "20800",
      ...dynamicConfig,
      ...config,
    };

    // 调试日志
    console.log(`[DoubaoWebClient] Config keys: ${Object.keys(this.config).join(", ")}`);
    console.log(`[DoubaoWebClient] fp in config: ${this.config.fp}`);
    console.log(`[DoubaoWebClient] tea_uuid in config: ${this.config.tea_uuid}`);
    console.log(`[DoubaoWebClient] device_id in config: ${this.config.device_id}`);
    console.log(`[DoubaoWebClient] web_tab_id in config: ${this.config.web_tab_id}`);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "User-Agent":
        this.auth.userAgent ||
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://www.doubao.com/chat/",
      Origin: "https://www.doubao.com",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
    };

    const sessionId = this.auth.sessionid;
    const ttwid = this.auth.ttwid ? decodeURIComponent(this.auth.ttwid) : undefined;

    if (ttwid) {
      headers["Cookie"] = `sessionid=${sessionId}; ttwid=${ttwid}`;
    } else {
      headers["Cookie"] = `sessionid=${sessionId}`;
    }

    return headers;
  }

  private buildQueryParams(): string {
    const params = new URLSearchParams();

    // 添加固定参数
    Object.entries(this.config).forEach(([key, value]) => {
      if (value !== undefined && value !== null && key !== "msToken" && key !== "a_bogus") {
        params.append(key, value.toString());
      }
    });

    // 添加动态参数（如果有）
    if (this.config.msToken) {
      params.append("msToken", this.config.msToken);
    }
    if (this.config.a_bogus) {
      params.append("a_bogus", this.config.a_bogus);
    }

    return params.toString();
  }

  async discoverModels(): Promise<ModelDefinitionConfig[]> {
    return [
      {
        id: "doubao-seed-2.0",
        name: "Doubao-Seed 2.0 (Web)",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 64000,
        maxTokens: 8192,
      },
      {
        id: "doubao-pro",
        name: "Doubao Pro (Web)",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 64000,
        maxTokens: 8192,
      },
      {
        id: "doubao-lite",
        name: "Doubao Lite (Web)",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 64000,
        maxTokens: 8192,
      },
    ];
  }

  /** 将多轮消息合并为 samantha 接口需要的单条 content（纯文本） */
  private mergeMessagesForSamantha(messages: DoubaoMessage[]): string {
    return (
      messages
        .map((m) => {
          const role = m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : "system";
          return `<|im_start|>${role}\n${m.content}\n`;
        })
        .join("") + "<|im_end|>\n"
    );
  }

  async chatCompletions(
    request: DoubaoChatRequest,
    onChunk?: (chunk: string) => void,
  ): Promise<DoubaoChatResponse | AsyncIterable<string>> {
    const queryParams = this.buildQueryParams();
    let url: string;
    let body: string;

    if (USE_SAMANTHA_API) {
      url = `${DOUBAO_API_BASE}/samantha/chat/completion?${queryParams}`;
      const text = this.mergeMessagesForSamantha(request.messages);
      body = JSON.stringify({
        messages: [
          {
            content: JSON.stringify({ text }),
            content_type: 2001,
            attachments: [],
            references: [],
          },
        ],
        completion_option: {
          is_regen: false,
          with_suggest: true,
          need_create_conversation: true,
          launch_stage: 1,
          is_replace: false,
          is_delete: false,
          message_from: 0,
          event_id: "0",
        },
        conversation_id: "0",
        local_conversation_id: `local_16${Date.now().toString().slice(-14)}`,
        local_message_id: crypto.randomUUID(),
      });
    } else {
      url = `${DOUBAO_API_BASE}/chat/completion?${queryParams}`;
      body = JSON.stringify({
        client_meta: {
          local_conversation_id: `local_${Date.now()}`,
          conversation_id: request.conversation_id || "",
          bot_id: "7338286299411103781",
        },
        ext: { use_deep_think: "0", fp: this.config.fp || "" },
        messages: request.messages.map((msg) => ({ role: msg.role, content: msg.content })),
        option: {
          send_message_scene: "",
          create_time_ms: Date.now(),
          collect_id: "",
          is_audio: false,
        },
      });
    }

    const headers = this.getHeaders();
    if (USE_SAMANTHA_API) {
      (headers as Record<string, string>)["Referer"] = "https://www.doubao.com/chat/";
      (headers as Record<string, string>)["Agw-js-conv"] = "str";
    }

    console.log(`🌐 发送请求到: ${url}`);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ 豆包 API 错误: ${response.status} - ${errorText}`);
      throw new Error(`Doubao API error: ${response.status} - ${errorText}`);
    }

    console.log(`✅ 请求成功，状态码: ${response.status}`);

    if (request.stream && onChunk) {
      return this.handleStreamResponse(response, onChunk);
    }

    if (request.stream) {
      return this.streamGenerator(response);
    }

    // 非流式响应（豆包主要使用流式）
    return this.parseNonStreamResponse(response);
  }

  private async handleStreamResponse(
    response: Response,
    onChunk: (chunk: string) => void,
  ): Promise<DoubaoChatResponse> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body for streaming");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";

    // SSE 解析状态
    let currentEvent: { id?: string; event?: string; data?: string } = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "") {
          if (currentEvent.event && currentEvent.data) {
            await this.processSSEEvent(currentEvent, onChunk, (chunk) => {
              fullContent += chunk;
            });
          }
          currentEvent = {};
          continue;
        }

        // 豆包单行格式：id: 123 event: XXX data: {...}
        const single = this.parseSingleLineSSE(trimmed);
        if (single) {
          await this.processSSEEvent(
            { event: single.event, data: single.data },
            onChunk,
            (chunk) => {
              fullContent += chunk;
            },
          );
          currentEvent = {};
          continue;
        }

        if (trimmed.startsWith("id: ")) {
          currentEvent.id = trimmed.substring(4).trim();
        } else if (trimmed.startsWith("event: ")) {
          currentEvent.event = trimmed.substring(7).trim();
        } else if (trimmed.startsWith("data: ")) {
          currentEvent.data = trimmed.substring(6).trim();
        }
      }
    }

    if (currentEvent.event && currentEvent.data) {
      await this.processSSEEvent(currentEvent, onChunk, (chunk) => {
        fullContent += chunk;
      });
    }

    // 返回一个模拟的响应对象
    return {
      id: `chatcmpl-${Date.now()}`,
      model: "doubao-seed-2.0",
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: fullContent,
          },
          delta: { content: fullContent },
          finish_reason: "stop",
        },
      ],
      created: Math.floor(Date.now() / 1000),
    };
  }

  private async processSSEEvent(
    event: { id?: string; event?: string; data?: string },
    onChunk: (chunk: string) => void,
    onContent: (chunk: string) => void,
  ): Promise<void> {
    if (!event.event || !event.data) return;

    try {
      const data = JSON.parse(event.data);

      switch (event.event) {
        case "CHUNK_DELTA":
          if (data.text) {
            onChunk(data.text);
            onContent(data.text);
          }
          break;

        case "STREAM_CHUNK":
          if (data.patch_op) {
            for (const patch of data.patch_op) {
              if (patch.patch_value?.tts_content) {
                onChunk(patch.patch_value.tts_content);
                onContent(patch.patch_value.tts_content);
              }
            }
          }
          break;

        case "SSE_REPLY_END":
          console.log(`✅ 流式回复结束`);
          break;

        case "SSE_HEARTBEAT":
          // 心跳包，忽略
          break;

        case "SSE_ACK":
          // 确认包，忽略
          break;

        case "STREAM_MSG_NOTIFY":
          // 消息通知，可能包含初始内容
          if (data.content?.content_block) {
            for (const block of data.content.content_block) {
              if (block.content?.text_block?.text) {
                onChunk(block.content.text_block.text);
                onContent(block.content.text_block.text);
              }
            }
          }
          break;

        case "STREAM_ERROR":
          // 处理流式错误，特别是速率限制
          console.error(`❌ 豆包流式错误:`, data);
          if (data.error_code === 710022004) {
            throw new Error(`豆包速率限制: ${data.error_msg} (错误码: ${data.error_code})`);
          } else {
            throw new Error(`豆包API错误: ${data.error_msg} (错误码: ${data.error_code})`);
          }
          break;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `⚠️ 解析 SSE 数据失败: ${errorMessage}, 事件: ${event.event}, 数据: ${event.data?.substring(0, 100)}`,
      );
    }
  }

  /** 豆包可能使用单行 SSE：id: 123 event: CHUNK_DELTA data: {"text":"..."} */
  private parseSingleLineSSE(line: string): { event: string; data: string } | null {
    const m = line.match(/id:\s*\d+\s+event:\s*(\S+)\s+data:\s*(.+)/);
    if (!m) return null;
    return { event: m[1].trim(), data: m[2].trim() };
  }

  /**
   * 豆包 samantha API 响应格式：每行 JSON 含 event_type、event_data。
   * event_type 2001=数据块，event_data 为 JSON 字符串，内有 message.content（再解析得 {text}）；2003=结束。
   */
  private extractTextFromSamanthaLine(line: string): string[] {
    const chunks: string[] = [];
    try {
      const raw = JSON.parse(line) as { event_type?: number; event_data?: string; code?: number };
      if (raw.code != null && raw.code !== 0) return chunks;
      if (raw.event_type === 2003) return chunks;
      if (raw.event_type !== 2001 || !raw.event_data) return chunks;
      const result = JSON.parse(raw.event_data) as {
        message?: { content?: string; content_type?: number };
        is_finish?: boolean;
      };
      if (result.is_finish) return chunks;
      const message = result.message;
      const contentType = message?.content_type;
      if (
        !message ||
        contentType === undefined ||
        ![2001, 2008].includes(contentType) ||
        !message.content
      )
        return chunks;
      const content = JSON.parse(message.content) as { text?: string };
      if (content.text) chunks.push(content.text);
    } catch {
      // 非 samantha 格式，忽略
    }
    return chunks;
  }

  private async *streamGenerator(response: Response): AsyncIterable<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent: { id?: string; event?: string; data?: string } = {};
    let eventCount = 0;
    let textEventCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "") {
          // 空行表示多行格式的一个事件结束
          if (currentEvent.event && currentEvent.data) {
            eventCount++;
            const chunks = await this.extractTextFromEvent(currentEvent);
            if (chunks.length > 0) textEventCount++;
            for (const chunk of chunks) {
              yield chunk;
            }
          }
          currentEvent = {};
          continue;
        }

        // 豆包可能使用单行格式：id: 123 event: XXX data: {...}
        const single = this.parseSingleLineSSE(trimmed);
        if (single) {
          eventCount++;
          const chunks = await this.extractTextFromEvent({
            event: single.event,
            data: single.data,
          });
          if (chunks.length > 0) textEventCount++;
          for (const chunk of chunks) {
            yield chunk;
          }
          currentEvent = {};
          continue;
        }

        // 豆包 samantha API 格式：整行为 JSON 或 "data: {...}"，含 event_type、event_data
        const dataLine = trimmed.startsWith("data: ") ? trimmed.slice(6).trim() : trimmed;
        const samanthaChunks = this.extractTextFromSamanthaLine(dataLine);
        if (samanthaChunks.length > 0) {
          eventCount++;
          textEventCount++;
          for (const chunk of samanthaChunks) {
            yield chunk;
          }
          currentEvent = {};
          continue;
        }

        // 多行 SSE 字段
        if (trimmed.startsWith("id: ")) {
          currentEvent.id = trimmed.substring(4).trim();
        } else if (trimmed.startsWith("event: ")) {
          currentEvent.event = trimmed.substring(7).trim();
        } else if (trimmed.startsWith("data: ")) {
          currentEvent.data = trimmed.substring(6).trim();
        }
      }
    }

    // 处理最后一个多行事件
    if (currentEvent.event && currentEvent.data) {
      eventCount++;
      const chunks = await this.extractTextFromEvent(currentEvent);
      if (chunks.length > 0) textEventCount++;
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    if (eventCount > 0 && textEventCount === 0) {
      const msg = `[DoubaoWebClient] 收到 ${eventCount} 个 SSE 事件但未解析出文本，豆包 API 格式可能已变更。请检查认证 (sessionid/cookie) 是否有效，或查看控制台调试输出。`;
      console.warn(msg);
      throw new Error(msg);
    }
  }

  private async extractTextFromEvent(event: {
    id?: string;
    event?: string;
    data?: string;
  }): Promise<string[]> {
    const chunks: string[] = [];

    if (!event.event || !event.data) return chunks;

    try {
      const data = JSON.parse(event.data);

      switch (event.event) {
        case "CHUNK_DELTA":
          if (data.text) {
            chunks.push(data.text);
          }
          break;

        case "STREAM_CHUNK":
          if (data.patch_op) {
            for (const patch of data.patch_op) {
              if (patch.patch_value?.tts_content) {
                chunks.push(patch.patch_value.tts_content);
              }
            }
          }
          break;

        case "STREAM_MSG_NOTIFY":
          if (data.content?.content_block) {
            for (const block of data.content.content_block) {
              if (block.content?.text_block?.text) {
                chunks.push(block.content.text_block.text);
              }
            }
          }
          break;
        default:
          // 未识别的 event 类型，便于排查豆包实际返回格式
          if (
            event.event !== "SSE_HEARTBEAT" &&
            event.event !== "SSE_ACK" &&
            event.event !== "SSE_REPLY_END"
          ) {
            console.warn(
              `[DoubaoWebClient] 未处理的 SSE event: ${event.event}, data 前 120 字符: ${event.data.substring(0, 120)}`,
            );
          }
      }
    } catch (error) {
      // 忽略解析错误
    }

    return chunks;
  }

  private async parseNonStreamResponse(response: Response): Promise<DoubaoChatResponse> {
    const text = await response.text();

    // 尝试解析为 SSE 格式
    const lines = text.split("\n");
    let fullContent = "";

    for (const line of lines) {
      if (line.trim() === "") continue;

      if (line.startsWith("id: ")) {
        const match = line.match(/id: (\d+) event: (\w+) data: (.+)/);
        if (match) {
          const [, , event, dataStr] = match;

          try {
            const data = JSON.parse(dataStr);

            if (event === "CHUNK_DELTA" && data.text) {
              fullContent += data.text;
            } else if (event === "STREAM_CHUNK" && data.patch_op) {
              data.patch_op.forEach((patch: any) => {
                if (patch.patch_value?.tts_content) {
                  fullContent += patch.patch_value.tts_content;
                }
              });
            }
          } catch (error) {
            // 忽略解析错误
          }
        }
      }
    }

    return {
      id: `chatcmpl-${Date.now()}`,
      model: "doubao-seed-2.0",
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: fullContent,
          },
          delta: { content: fullContent },
          finish_reason: "stop",
        },
      ],
      created: Math.floor(Date.now() / 1000),
    };
  }

  async checkSession(): Promise<boolean> {
    try {
      // 使用一个简单的检查端点
      const url = `${DOUBAO_API_BASE}/im/conversation/info?${this.buildQueryParams()}`;
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // 更新配置方法
  updateConfig(config: Partial<DoubaoWebClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // 获取当前配置
  getConfig(): DoubaoWebClientConfig {
    return { ...this.config };
  }
}
