import type { StreamFn } from "@mariozechner/pi-agent-core";
import { streamSimple } from "@mariozechner/pi-ai";
import { streamWithPayloadPatch } from "./stream-payload-utils.js";

const MINIMAX_FAST_MODEL_IDS = new Map<string, string>([
  ["MiniMax-M2.7", "MiniMax-M2.7-highspeed"],
]);

export function shouldApplyMinimaxM3ThinkingCompat(params: {
  provider: string;
  modelId: string;
}): boolean {
  return (
    (params.provider === "minimax" || params.provider === "minimax-portal") &&
    params.modelId.trim().toLowerCase() === "minimax-m3"
  );
}

export function createMinimaxM3ThinkingWrapper(baseStreamFn: StreamFn | undefined): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    if (
      model.api !== "anthropic-messages" ||
      !shouldApplyMinimaxM3ThinkingCompat({ provider: model.provider, modelId: model.id })
    ) {
      return underlying(model, context, options);
    }

    return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
      const thinking = payloadObj.thinking;
      if (
        thinking &&
        typeof thinking === "object" &&
        !Array.isArray(thinking) &&
        (thinking as Record<string, unknown>).type === "enabled"
      ) {
        payloadObj.thinking = { type: "adaptive" };
      }
    });
  };
}

function resolveMinimaxFastModelId(modelId: unknown): string | undefined {
  if (typeof modelId !== "string") {
    return undefined;
  }
  return MINIMAX_FAST_MODEL_IDS.get(modelId.trim());
}

export function createMinimaxFastModeWrapper(
  baseStreamFn: StreamFn | undefined,
  fastMode: boolean,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    if (
      !fastMode ||
      model.api !== "anthropic-messages" ||
      (model.provider !== "minimax" && model.provider !== "minimax-portal")
    ) {
      return underlying(model, context, options);
    }

    const fastModelId = resolveMinimaxFastModelId(model.id);
    if (!fastModelId) {
      return underlying(model, context, options);
    }

    return underlying({ ...model, id: fastModelId }, context, options);
  };
}
