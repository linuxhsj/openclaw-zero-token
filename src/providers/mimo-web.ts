import { Browser, Page } from "playwright";
// src/providers/mimo-web.ts
import { Provider, AuthResult, ChatRequest, ChatResponse } from "../types";

export class MimoWebProvider implements Provider {
  name = "mimo-web";
  displayName = "小米 MiMo-Web";
  description = "通过浏览器登录小米 MiMo AI Studio";

  private credentials: {
    cookie?: string;
    bearer?: string;
    sessionId?: string;
    userAgent?: string;
  } = {};

  // 认证方法
  async authenticate(params: {
    browser: Browser;
    page: Page;
    onProgress: (msg: string) => void;
  }): Promise<AuthResult> {
    const { browser, page, onProgress } = params;

    try {
      onProgress("正在打开小米 MiMo AI Studio...");

      // 导航到 MiMo 登录页面
      await page.goto("https://aistudio.xiaomimimo.com/", {
        waitUntil: "networkidle",
        timeout: 60000,
      });

      onProgress("请在浏览器中完成登录...");
      onProgress("等待登录完成（最多5分钟）...");

      // 等待用户登录并捕获凭证
      const credentials = await this.waitForLogin(page, onProgress);

      if (!credentials) {
        throw new Error("登录超时或失败");
      }

      this.credentials = credentials;

      return {
        success: true,
        credentials: this.credentials,
        message: "MiMo-Web 认证成功",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "认证失败",
      };
    }
  }

  // 等待登录完成并捕获凭证
  private async waitForLogin(
    page: Page,
    onProgress: (msg: string) => void,
  ): Promise<typeof this.credentials | null> {
    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }, 300000); // 5分钟超时

      // 方法1: 监听网络请求捕获 token
      const requestHandler = async (request: any) => {
        if (resolved) return;

        const url = request.url();

        // 检测认证相关的请求
        if (this.isAuthRequest(url)) {
          const headers = request.headers();

          if (headers["authorization"] || headers["cookie"]) {
            onProgress("检测到认证信息，正在保存...");

            const cookies = await page.context().cookies();
            const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

            resolved = true;
            clearTimeout(timeout);
            page.removeListener("request", requestHandler);

            resolve({
              cookie: cookieStr,
              bearer: headers["authorization"]?.replace("Bearer ", ""),
              sessionId: this.extractSessionId(cookies),
              userAgent: await page.evaluate(() => navigator.userAgent),
            });
          }
        }
      };

      page.on("request", requestHandler);

      // 方法2: 检测页面变化判断是否登录成功
      const checkLogin = async () => {
        if (resolved) return;

        try {
          const currentUrl = page.url();

          // 如果 URL 不再是登录页，可能已登录
          if (
            !currentUrl.includes("login") &&
            !currentUrl.includes("signin") &&
            !currentUrl.includes("auth")
          ) {
            // 检查是否有用户相关元素
            const isLoggedIn = await page.evaluate(() => {
              const indicators = [
                document.querySelector('[class*="user"]'),
                document.querySelector('[class*="avatar"]'),
                document.querySelector('[class*="profile"]'),
                document.querySelector('[class*="dashboard"]'),
                document.querySelector('[class*="chat"]'),
              ];
              return indicators.some((el) => el !== null);
            });

            if (isLoggedIn) {
              onProgress("登录成功，正在保存凭证...");

              const cookies = await page.context().cookies();
              const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

              resolved = true;
              clearTimeout(timeout);
              page.removeListener("request", requestHandler);

              resolve({
                cookie: cookieStr,
                sessionId: this.extractSessionId(cookies),
                userAgent: await page.evaluate(() => navigator.userAgent),
              });
            }
          }
        } catch (e) {
          // 忽略检测错误
        }
      };

      // 定期检查登录状态
      const interval = setInterval(() => {
        if (resolved) {
          clearInterval(interval);
          return;
        }
        checkLogin();
      }, 2000);
    });
  }

  // 判断是否是认证请求
  private isAuthRequest(url: string): boolean {
    const authPatterns = [
      "/api/auth",
      "/api/login",
      "/api/user",
      "/api/session",
      "/api/token",
      "/auth/",
      "/login",
      "/oauth",
    ];
    return authPatterns.some((pattern) => url.includes(pattern));
  }

  // 从 cookies 中提取 session ID
  private extractSessionId(cookies: any[]): string | undefined {
    const sessionCookies = ["session", "sessionid", "sid", "token", "auth"];
    for (const cookie of cookies) {
      if (sessionCookies.some((name) => cookie.name.toLowerCase().includes(name))) {
        return cookie.value;
      }
    }
    return undefined;
  }

  // 获取可用模型列表
  async getModels(): Promise<Array<{ id: string; name: string }>> {
    // MiMo 的模型列表
    return [
      { id: "mimo-v1", name: "MiMo V1" },
      { id: "mimo-v1-pro", name: "MiMo V1 Pro" },
      { id: "mimo-v1-lite", name: "MiMo V1 Lite" },
    ];
  }

  // 发送聊天请求
  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.credentials.cookie) {
      throw new Error("未认证，请先登录 MiMo");
    }

    // 尝试不同的 API 端点
    const endpoints = [
      "https://aistudio.xiaomimimo.com/api/v1/chat/completions",
      "https://aistudio.xiaomimimo.com/api/chat/completions",
      "https://aistudio.xiaomimimo.com/v1/chat/completions",
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: this.credentials.cookie,
            "User-Agent": this.credentials.userAgent || "Mozilla/5.0",
            ...(this.credentials.bearer && {
              Authorization: `Bearer ${this.credentials.bearer}`,
            }),
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            temperature: request.temperature || 0.7,
            max_tokens: request.maxTokens || 4096,
            stream: false,
          }),
        });

        if (response.ok) {
          return await response.json();
        }
      } catch (e) {
        continue;
      }
    }

    throw new Error("无法连接到 MiMo API");
  }

  // 流式聊天
  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    if (!this.credentials.cookie) {
      throw new Error("未认证，请先登录 MiMo");
    }

    const response = await fetch("https://aistudio.xiaomimimo.com/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: this.credentials.cookie,
        "User-Agent": this.credentials.userAgent || "Mozilla/5.0",
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens || 4096,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error("MiMo API 请求失败");
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("无法读取响应流");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  }

  // 测试连接
  async testConnection(): Promise<boolean> {
    if (!this.credentials.cookie) {
      return false;
    }

    try {
      const response = await fetch("https://aistudio.xiaomimimo.com/", {
        headers: {
          Cookie: this.credentials.cookie,
          "User-Agent": this.credentials.userAgent || "Mozilla/5.0",
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// 导出 provider 实例
export const mimoWebProvider = new MimoWebProvider();
