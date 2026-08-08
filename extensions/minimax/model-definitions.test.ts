import { describe, expect, it } from "vitest";
import {
  buildMinimaxApiModelDefinition,
  buildMinimaxModelDefinition,
  DEFAULT_MINIMAX_CONTEXT_WINDOW,
  DEFAULT_MINIMAX_MAX_TOKENS,
  MINIMAX_API_COST,
  MINIMAX_HOSTED_MODEL_ID,
} from "./model-definitions.js";

describe("minimax model definitions", () => {
  it("uses M3 as the default hosted model", () => {
    expect(MINIMAX_HOSTED_MODEL_ID).toBe("MiniMax-M3");
  });

  it("uses the M3 context and standard pricing defaults", () => {
    expect(DEFAULT_MINIMAX_CONTEXT_WINDOW).toBe(1_000_000);
    expect(DEFAULT_MINIMAX_MAX_TOKENS).toBe(131_072);
    expect(MINIMAX_API_COST).toEqual({
      input: 0.6,
      output: 2.4,
      cacheRead: 0.12,
      cacheWrite: 0,
    });
  });

  it("builds M3 with multimodal input and adaptive reasoning capability", () => {
    const model = buildMinimaxApiModelDefinition("MiniMax-M3");
    expect(model).toMatchObject({
      id: "MiniMax-M3",
      name: "MiniMax M3",
      reasoning: true,
      input: ["text", "image"],
      cost: MINIMAX_API_COST,
      contextWindow: 1_000_000,
      maxTokens: 131_072,
    });
  });

  it("keeps M2.7 model-specific context and pricing", () => {
    const model = buildMinimaxApiModelDefinition("MiniMax-M2.7");
    expect(model).toMatchObject({
      id: "MiniMax-M2.7",
      name: "MiniMax M2.7",
      reasoning: true,
      input: ["text"],
      cost: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.375 },
      contextWindow: 204_800,
      maxTokens: 131_072,
    });
  });

  it("builds explicit definitions with catalog names", () => {
    const model = buildMinimaxModelDefinition({
      id: "MiniMax-M3",
      input: ["text", "image"],
      cost: MINIMAX_API_COST,
      contextWindow: DEFAULT_MINIMAX_CONTEXT_WINDOW,
      maxTokens: DEFAULT_MINIMAX_MAX_TOKENS,
    });
    expect(model).toMatchObject({ name: "MiniMax M3", input: ["text", "image"] });
  });

  it("uses catalog input when explicit input is omitted", () => {
    const model = buildMinimaxModelDefinition({
      id: "MiniMax-M3",
      cost: MINIMAX_API_COST,
      contextWindow: DEFAULT_MINIMAX_CONTEXT_WINDOW,
      maxTokens: DEFAULT_MINIMAX_MAX_TOKENS,
    });
    expect(model.input).toEqual(["text", "image"]);
  });

  it("falls back to generated name for unknown model id", () => {
    const model = buildMinimaxApiModelDefinition("MiniMax-Future");
    expect(model.name).toBe("MiniMax MiniMax-Future");
    expect(model.reasoning).toBe(false);
  });
});
