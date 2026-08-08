import type { ModelDefinitionConfig } from "openclaw/plugin-sdk/provider-model-shared";
import { MINIMAX_DEFAULT_MODEL_ID, MINIMAX_TEXT_MODEL_CATALOG } from "./provider-models.js";

export const DEFAULT_MINIMAX_BASE_URL = "https://api.minimax.io/v1";
export const MINIMAX_API_BASE_URL = "https://api.minimax.io/anthropic";
export const MINIMAX_CN_API_BASE_URL = "https://api.minimaxi.com/anthropic";
export const MINIMAX_HOSTED_MODEL_ID = MINIMAX_DEFAULT_MODEL_ID;
export const MINIMAX_HOSTED_MODEL_REF = `minimax/${MINIMAX_HOSTED_MODEL_ID}`;
const DEFAULT_MINIMAX_MODEL = MINIMAX_TEXT_MODEL_CATALOG[MINIMAX_DEFAULT_MODEL_ID];
export const DEFAULT_MINIMAX_CONTEXT_WINDOW = DEFAULT_MINIMAX_MODEL.contextWindow;
export const DEFAULT_MINIMAX_MAX_TOKENS = DEFAULT_MINIMAX_MODEL.maxTokens;

export const MINIMAX_API_COST = { ...DEFAULT_MINIMAX_MODEL.cost };
export const MINIMAX_HOSTED_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};
export const MINIMAX_LM_STUDIO_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

type MinimaxCatalogId = keyof typeof MINIMAX_TEXT_MODEL_CATALOG;

export function buildMinimaxModelDefinition(params: {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: ModelDefinitionConfig["input"];
  cost: ModelDefinitionConfig["cost"];
  contextWindow: number;
  maxTokens: number;
}): ModelDefinitionConfig {
  const catalog = MINIMAX_TEXT_MODEL_CATALOG[params.id as MinimaxCatalogId];
  return {
    id: params.id,
    name: params.name ?? catalog?.name ?? `MiniMax ${params.id}`,
    reasoning: params.reasoning ?? catalog?.reasoning ?? false,
    input: [...(params.input ?? catalog?.input ?? ["text"])],
    cost: { ...params.cost },
    contextWindow: params.contextWindow,
    maxTokens: params.maxTokens,
  };
}

export function buildMinimaxApiModelDefinition(modelId: string): ModelDefinitionConfig {
  const catalog = MINIMAX_TEXT_MODEL_CATALOG[modelId as MinimaxCatalogId];
  return buildMinimaxModelDefinition({
    id: modelId,
    name: catalog?.name,
    reasoning: catalog?.reasoning,
    input: catalog?.input,
    cost: catalog?.cost ?? MINIMAX_API_COST,
    contextWindow: catalog?.contextWindow ?? DEFAULT_MINIMAX_CONTEXT_WINDOW,
    maxTokens: catalog?.maxTokens ?? DEFAULT_MINIMAX_MAX_TOKENS,
  });
}
