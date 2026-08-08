import type { StreamFn } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
  createMinimaxM3ThinkingWrapper,
  shouldApplyMinimaxM3ThinkingCompat,
} from "./minimax-stream-wrappers.js";

function captureThinkingPayload(model: Parameters<StreamFn>[0]) {
  let captured: unknown;
  const underlying: StreamFn = (payloadModel, _context, options) => {
    const payload = { thinking: { type: "enabled", budget_tokens: 1024 } };
    options?.onPayload?.(payload, payloadModel);
    captured = payload;
    return {} as ReturnType<StreamFn>;
  };

  void createMinimaxM3ThinkingWrapper(underlying)(
    model,
    { messages: [] } as Parameters<StreamFn>[1],
    {} as Parameters<StreamFn>[2],
  );
  return captured;
}

describe("minimax stream wrappers", () => {
  it("recognizes M3 on both MiniMax providers", () => {
    expect(shouldApplyMinimaxM3ThinkingCompat({ provider: "minimax", modelId: "MiniMax-M3" })).toBe(
      true,
    );
    expect(
      shouldApplyMinimaxM3ThinkingCompat({
        provider: "minimax-portal",
        modelId: "MiniMax-M3",
      }),
    ).toBe(true);
    expect(
      shouldApplyMinimaxM3ThinkingCompat({ provider: "minimax", modelId: "MiniMax-M2.7" }),
    ).toBe(false);
  });

  it("normalizes Anthropic M3 thinking to adaptive", () => {
    expect(
      captureThinkingPayload({
        api: "anthropic-messages",
        provider: "minimax",
        id: "MiniMax-M3",
      } as Parameters<StreamFn>[0]),
    ).toEqual({ thinking: { type: "adaptive" } });
  });

  it("leaves other model payloads unchanged", () => {
    expect(
      captureThinkingPayload({
        api: "anthropic-messages",
        provider: "minimax",
        id: "MiniMax-M2.7",
      } as Parameters<StreamFn>[0]),
    ).toEqual({ thinking: { type: "enabled", budget_tokens: 1024 } });
  });
});
