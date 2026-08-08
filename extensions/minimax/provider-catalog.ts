import type { ModelProviderConfig } from "openclaw/plugin-sdk/provider-model-shared";
import { buildMinimaxApiModelDefinition } from "./model-definitions.js";
import { MINIMAX_TEXT_MODEL_ORDER } from "./provider-models.js";

const MINIMAX_PORTAL_BASE_URL = "https://api.minimax.io/anthropic";

function buildMinimaxCatalog() {
  return MINIMAX_TEXT_MODEL_ORDER.map((id) => buildMinimaxApiModelDefinition(id));
}

export function buildMinimaxProvider(): ModelProviderConfig {
  return {
    baseUrl: MINIMAX_PORTAL_BASE_URL,
    api: "anthropic-messages",
    authHeader: true,
    models: buildMinimaxCatalog(),
  };
}

export function buildMinimaxPortalProvider(): ModelProviderConfig {
  return {
    baseUrl: MINIMAX_PORTAL_BASE_URL,
    api: "anthropic-messages",
    authHeader: true,
    models: buildMinimaxCatalog(),
  };
}
