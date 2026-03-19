import crypto from "node:crypto";
import type { ModelDefinitionConfig } from "../config/types.models.js";

export interface ClaudeWebClientOptions {
  sessionKey: string;
  cookie?: string;
  userAgent?: string;
  organizationId?: string;
  deviceId?: string;
}

export interface ClaudeConversation {
  uuid: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export class ClaudeWebClient {
  private sessionKey: string;
  private cookie: string;
  private userAgent: string;
  private organizationId?: string;
  private deviceId: string;
  private baseUrl = "https://claude.ai/api";

  constructor(options: ClaudeWebClientOptions | string) {
    if (typeof options === "string") {
      const parsed = JSON.parse(options) as ClaudeWebClientOptions;
      this.sessionKey = parsed.sessionKey;
      this.cookie = parsed.cookie || `sessionKey=${parsed.sessionKey}`;
      this.userAgent = parsed.userAgent || "Mozilla/5.0";
      this.organizationId = parsed.organizationId;
      this.deviceId = parsed.deviceId || this.extractDeviceId(this.cookie) || crypto.randomUUID();
    } else {
      this.sessionKey = options.sessionKey;
      this.cookie = options.cookie || `sessionKey=${options.sessionKey}`;
      this.userAgent = options.userAgent || "Mozilla/5.0";
      this.organizationId = options.organizationId;
      this.deviceId = options.deviceId || this.extractDeviceId(this.cookie) || crypto.randomUUID();
    }
  }

  private extractDeviceId(cookie: string): string | undefined {
    const match = cookie.match(/anthropic-device-id=([^;]+)/);
    return match ? match[1] : undefined;
  }

  private async fetchHeaders() {
    return {
      "Content-Type": "application/json",
      Cookie: this.cookie,
      "User-Agent": this.userAgent,
      Accept: "text/event-stream",
      Referer: "https://claude.ai/",
      Origin: "https://claude.ai",
      "anthropic-client-platform": "web_claude_ai",
      "anthropic-device-id": this.deviceId,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "sec-ch-ua": '"Not A(Brand";v="99", "Google Chrome";v="120", "Chromium";v="120"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
    };
  }

  async init() {
    if (this.organizationId) {
      return;
    }

    try {
      const headers = await this.fetchHeaders();
      const response = await fetch(`${this.baseUrl}/organizations`, {
        headers,
      });

      if (!response.ok) {
        console.warn(`[Claude Web] Failed to fetch organizations: ${response.status}`);
        return;
      }

      const orgs = (await response.json()) as any[];
      if (orgs && orgs.length > 0 && orgs[0].uuid) {
        this.organizationId = orgs[0].uuid;
        console.log(`[Claude Web] Discovered organization ID: ${this.organizationId}`);
      }
    } catch (e) {
      console.warn(`[Claude Web] Failed to discover organization: ${String(e)}`);
    }
  }

  async createConversation(): Promise<ClaudeConversation> {
    const headers = await this.fetchHeaders();
    const url = this.organizationId
      ? `${this.baseUrl}/organizations/${this.organizationId}/chat_conversations`
      : `${this.baseUrl}/chat_conversations`;

    console.log(`[Claude Web] Creating conversation at: ${url}`);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: `Conversation ${new Date().toISOString()}`,
        uuid: crypto.randomUUID(),
      }),
    });

    console.log(`[Claude Web] Create conversation response: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[Claude Web] Create conversation failed: ${response.status} - ${errorText}`);
      throw new Error(`Failed to create conversation: ${response.status}`);
    }

    return (await response.json()) as ClaudeConversation;
  }

  async chatCompletions(params: {
    conversationId?: string;
    message: string;
    model?: string;
    signal?: AbortSignal;
    attachments?: Array<{
      file_name: string;
      file_type: string;
      file_size: number;
      extracted_content: string;
    }>;
  }): Promise<ReadableStream<Uint8Array>> {
    let conversationId = params.conversationId;

    if (!conversationId) {
      const conversation = await this.createConversation();
      conversationId = conversation.uuid;
    }

    const headers = await this.fetchHeaders();
    const url = this.organizationId
      ? `${this.baseUrl}/organizations/${this.organizationId}/chat_conversations/${conversationId}/completion`
      : `${this.baseUrl}/chat_conversations/${conversationId}/completion`;

    console.log(`[Claude Web] Sending message to: ${url}`);
    console.log(`[Claude Web] Conversation ID: ${conversationId}`);
    console.log(`[Claude Web] Model: ${params.model || "claude-sonnet-4-6"}`);

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const body: any = {
      prompt: params.message,
      parent_message_uuid: "00000000-0000-4000-8000-000000000000",
      model: params.model || "claude-sonnet-4-6",
      timezone,
      rendering_mode: "messages",
      attachments: params.attachments || [],
      files: [],
      locale: "en-US",
      personalized_styles: [],
      sync_sources: [],
      tools: [],
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: params.signal,
    });

    console.log(`[Claude Web] Message response: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[Claude Web] Message failed: ${response.status} - ${errorText}`);

      if (response.status === 401) {
        throw new Error(
          "Authentication failed. Please re-run onboarding to refresh your Claude session.",
        );
      }
      throw new Error(`Claude API error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body from Claude API");
    }

    return response.body;
  }

  async discoverModels(): Promise<ModelDefinitionConfig[]> {
    return [
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        provider: "claude-web",
        api: "claude-web",
        contextWindow: 200000,
        maxOutputTokens: 8192,
      },
      {
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        provider: "claude-web",
        api: "claude-web",
        contextWindow: 200000,
        maxOutputTokens: 16384,
      },
      {
        id: "claude-haiku-4-6",
        name: "Claude Haiku 4.6",
        provider: "claude-web",
        api: "claude-web",
        contextWindow: 200000,
        maxOutputTokens: 8192,
      },
    ];
  }
}
