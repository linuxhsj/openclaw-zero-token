import type { ModelDefinitionConfig } from "openclaw/plugin-sdk/provider-model-shared";
import { matchesExactOrPrefix } from "openclaw/plugin-sdk/provider-model-shared";

export const MINIMAX_DEFAULT_MODEL_ID = "MiniMax-M3";
export const MINIMAX_DEFAULT_MODEL_REF = `minimax/${MINIMAX_DEFAULT_MODEL_ID}`;

export const MINIMAX_TEXT_MODEL_ORDER = ["MiniMax-M3", "MiniMax-M2.7"] as const;

type MinimaxModelCatalogEntry = Pick<
  ModelDefinitionConfig,
  "name" | "reasoning" | "input" | "cost" | "contextWindow" | "maxTokens"
>;

export const MINIMAX_TEXT_MODEL_CATALOG = {
  "MiniMax-M3": {
    name: "MiniMax M3",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.6, output: 2.4, cacheRead: 0.12, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 131_072,
  },
  "MiniMax-M2.7": {
    name: "MiniMax M2.7",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.375 },
    contextWindow: 204_800,
    maxTokens: 131_072,
  },
} satisfies Record<(typeof MINIMAX_TEXT_MODEL_ORDER)[number], MinimaxModelCatalogEntry>;

export const MINIMAX_TEXT_MODEL_REFS = MINIMAX_TEXT_MODEL_ORDER.map(
  (modelId) => `minimax/${modelId}`,
);

const MINIMAX_MODERN_MODEL_MATCHERS = ["minimax-m3", "minimax-m2.7"] as const;

export function isMiniMaxModernModelId(modelId: string): boolean {
  return matchesExactOrPrefix(modelId, MINIMAX_MODERN_MODEL_MATCHERS);
}
