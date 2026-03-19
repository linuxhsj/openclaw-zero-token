/**
 * Doubao (豆包) Web 适配器
 */

import { ensureAuthProfileStore, listProfilesForProvider } from "../../agents/auth-profiles.js";
import { createDoubaoWebStreamFn } from "../../agents/doubao-web-stream.js";
import type { ModelResponse, AdapterQueryOptions } from "../types.js";
import { BaseAdapter } from "./base.js";

export class DoubaoAdapter extends BaseAdapter {
  readonly id = "doubao-web";
  readonly name = "Doubao";
  readonly provider = "bytedance";
  readonly models = ["doubao"];
  readonly defaultModel = "doubao";
  // Doubao Web 实际使用的模型 ID
  private readonly actualModelId = "doubao-seed-2.0";

  private cachedCredential: string | null = null;

  async isAvailable(): Promise<boolean> {
    const credential = await this.getCredential();
    return credential !== null;
  }

  private async getCredential(): Promise<string | null> {
    if (this.cachedCredential) {
      return this.cachedCredential;
    }

    try {
      const store = ensureAuthProfileStore();
      const profiles = listProfilesForProvider(store, "doubao-web");

      if (profiles.length === 0) {
        return null;
      }

      const profileId = profiles[0];
      const credential = store.profiles[profileId];

      if (!credential) {
        return null;
      }

      if (credential.type === "api_key" && credential.key) {
        this.cachedCredential = credential.key;
      } else if (credential.type === "oauth") {
        this.cachedCredential = JSON.stringify(credential);
      } else if (credential.type === "token" && credential.token) {
        this.cachedCredential = credential.token;
      }

      return this.cachedCredential;
    } catch {
      return null;
    }
  }

  async query(question: string, options?: AdapterQueryOptions): Promise<ModelResponse> {
    const startTime = Date.now();
    const modelId = options?.modelId || this.defaultModel;

    try {
      const credential = await this.getCredential();
      if (!credential) {
        return this.createResponse(
          modelId,
          "error",
          "",
          "Doubao Web 未认证，请先运行 openclaw onboard doubao-web",
          startTime,
        );
      }

      const streamFn = createDoubaoWebStreamFn(credential);

      const model = {
        id: this.actualModelId,
        api: "doubao-web",
        provider: "bytedance",
      };

      const sessionId = `askonce-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const context = {
        messages: [{ role: "user", content: question }],
        systemPrompt: options?.systemPrompt || "",
        tools: [],
        sessionId,
      };

      const stream = streamFn(model as any, context as any, { signal: options?.signal });

      let content = "";
      try {
        for await (const event of stream) {
          if (event.type === "text_delta" && event.delta) {
            content += event.delta;
          } else if (event.type === "error") {
            return this.createResponse(
              modelId,
              "error",
              content,
              event.error?.errorMessage || "Stream error",
              startTime,
            );
          }
        }
      } catch (error) {
        return this.createResponse(
          modelId,
          "error",
          content,
          error instanceof Error ? error.message : String(error),
          startTime,
        );
      }

      return this.createResponse(modelId, "completed", content, undefined, startTime);
    } catch (error) {
      return this.createResponse(modelId, "error", "", this.parseError(error), startTime);
    }
  }
}
