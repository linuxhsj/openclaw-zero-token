import type { ModelDefinitionConfig } from "../config/types.models.js";

export interface XiaomiMimoWebClientOptions {
  cookie: string;
  bearer?: string;
  userAgent?: string;
}

const XIAOMIMO_BASE_URL = "https://aistudio.xiaomimimo.com";

export class XiaomiMimoWebClient {
  private cookie: string;
  private bearer: string;
  private userAgent: string;

  constructor(options: XiaomiMimoWebClientOptions | string) {
    let finalOptions: XiaomiMimoWebClientOptions;
    if (typeof options === "string") {
      try {
        finalOptions = JSON.parse(options);
        if (typeof finalOptions === "string") {
          finalOptions = { cookie: finalOptions };
        }
      } catch {
        finalOptions = { cookie: options };
      }
    } else {
      finalOptions = options;
    }
    this.cookie = finalOptions.cookie;
    this.bearer = finalOptions.bearer || "";
    this.userAgent =
      finalOptions.userAgent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
  }

  private fetchHeaders() {
    // 提取 serviceToken 作为 Bearer token
    const serviceTokenMatch = this.cookie.match(/serviceToken="([^"]*)"/);
    const serviceToken = serviceTokenMatch?.[1] || "";

    // 提取 xiaomichatbot_ph
    const botPhMatch = this.cookie.match(/xiaomichatbot_ph="([^"]*)"/);
    const botPh = botPhMatch?.[1] || "";

    return {
      Cookie: this.cookie,
      "User-Agent": this.userAgent,
      "Content-Type": "application/json",
      Accept: "*/*",
      ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      Referer: `${XIAOMIMO_BASE_URL}/`,
      Origin: XIAOMIMO_BASE_URL,
      "x-timezone": "Asia/Shanghai",
      bot_ph: botPh,
    };
  }

  async chatCompletions(params: {
    conversationId?: string;
    message: string;
    model: string;
    signal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array> | null> {
    const headers = this.fetchHeaders();

    // 提取 xiaomichatbot_ph 作为 URL 参数
    const botPhMatch = this.cookie.match(/xiaomichatbot_ph="([^"]*)"/);
    const botPh = botPhMatch?.[1] || "";

    let url = `${XIAOMIMO_BASE_URL}/open-apis/bot/chat`;
    if (botPh) {
      url += `?xiaomichatbot_ph=${encodeURIComponent(botPh)}`;
    }

    const body = {
      message: params.message,
      ...(params.conversationId ? { conversation_id: params.conversationId } : {}),
    };

    console.log(`[XiaomiMimoWebClient] Sending chat completion request...`);
    console.log(`[XiaomiMimoWebClient] URL: ${url}`);

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[XiaomiMimoWebClient] Chat completion failed: ${res.status}`, errorText);
      throw new Error(`XiaomiMimo chat completion failed: ${res.status} ${errorText}`);
    }

    console.log(
      `[XiaomiMimoWebClient] Chat completion response OK (status: ${res.status}). Content-Type: ${res.headers.get("content-type")}`,
    );

    return res.body;
  }

  async discoverModels(): Promise<ModelDefinitionConfig[]> {
    return [
      {
        id: "xiaomimo-chat",
        name: "MiMo Chat",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
      {
        id: "mimo-v2-pro",
        name: "MiMo V2 Pro",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ];
  }
}
