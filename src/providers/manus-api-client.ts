/**
 * Manus 官方 API 客户端
 * 文档: https://open.manus.im/docs
 * POST /v1/tasks 创建任务 → 轮询 GET /v1/tasks/{id} 直到 completed
 */

const MANUS_API_BASE = "https://api.manus.ai";
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 120000;

export interface ManusApiClientOptions {
  apiKey: string;
}

interface TaskMessage {
  role: "user" | "assistant";
  content?: Array<{ type?: string; text?: string }>;
}

interface CreateTaskResponse {
  task_id: string;
  task_title?: string;
  task_url?: string;
}

interface GetTaskResponse {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  error?: string;
  output?: TaskMessage[];
}

export class ManusApiClient {
  private apiKey: string;

  constructor(options: ManusApiClientOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) {
      throw new Error("Manus API key is required");
    }
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const res = await fetch(`${MANUS_API_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        API_KEY: this.apiKey,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Manus API ${res.status}: ${text.slice(0, 300)}`);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Manus API invalid JSON: ${text.slice(0, 200)}`);
    }
  }

  async createTask(params: {
    prompt: string;
    agentProfile?: string;
    taskMode?: "chat" | "adaptive" | "agent";
    taskId?: string;
  }): Promise<CreateTaskResponse> {
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      agentProfile: params.agentProfile || "manus-1.6",
      taskMode: params.taskMode || "chat",
    };
    if (params.taskId) body.taskId = params.taskId;

    return this.request<CreateTaskResponse>("/v1/tasks", {
      method: "POST",
      body,
    });
  }

  async getTask(taskId: string): Promise<GetTaskResponse> {
    return this.request<GetTaskResponse>(`/v1/tasks/${taskId}`);
  }

  /** 创建任务并轮询直到完成，返回 assistant 文本 */
  async chat(params: {
    prompt: string;
    agentProfile?: string;
    taskMode?: "chat" | "adaptive" | "agent";
    conversationId?: string;
    signal?: AbortSignal;
  }): Promise<string> {
    const created = await this.createTask({
      prompt: params.prompt,
      agentProfile: params.agentProfile || "manus-1.6",
      taskMode: params.taskMode || "chat",
      taskId: params.conversationId,
    });

    const taskId = created.task_id;
    const start = Date.now();

    while (Date.now() - start < MAX_POLL_MS) {
      if (params.signal?.aborted) {
        throw new Error("Manus task aborted");
      }

      const task = await this.getTask(taskId);

      if (task.status === "completed") {
        const texts: string[] = [];
        for (const msg of task.output || []) {
          if (msg.role === "assistant" && msg.content) {
            for (const c of msg.content) {
              if (c.type === "output_text" && c.text) {
                texts.push(c.text);
              } else if (c.text) {
                texts.push(c.text);
              }
            }
          }
        }
        return texts.join("\n\n").trim() || "(No text output)";
      }

      if (task.status === "failed") {
        throw new Error(task.error || "Manus task failed");
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    throw new Error(`Manus task timeout after ${MAX_POLL_MS / 1000}s`);
  }
}
