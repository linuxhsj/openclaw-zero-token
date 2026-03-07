/**
 * AskOnce UI Controller
 * Handles multi-model concurrent queries from the UI
 */

import type { GatewayBrowserClient } from "../gateway.ts";

export type AskOnceModelInfo = {
  id: string;
  name: string;
  provider: string;
  available: boolean;
};

export type AskOnceModelResponse = {
  modelId: string;
  modelName: string;
  provider: string;
  status: "completed" | "error" | "timeout";
  content: string;
  error?: string;
  responseTime: number;
  charCount: number;
};

export type AskOnceQueryResult = {
  queryId: string;
  question: string;
  totalTime: number;
  successCount: number;
  errorCount: number;
  responses: AskOnceModelResponse[];
  formatted?: string;
};

export type AskOnceState = {
  client: GatewayBrowserClient | null;
  connected: boolean;

  // Model list
  modelsLoading: boolean;
  models: AskOnceModelInfo[];
  modelsError: string | null;

  // Query state
  queryLoading: boolean;
  queryQuestion: string;
  queryResult: AskOnceQueryResult | null;
  queryError: string | null;

  // Selected models (empty = all available)
  selectedModels: string[];
};

/**
 * Load available models for AskOnce
 */
export async function loadAskOnceModels(state: AskOnceState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }

  state.modelsLoading = true;
  state.modelsError = null;

  try {
    const result = await state.client.request<{ models: AskOnceModelInfo[] }>("askonce.list", {});
    state.models = result.models || [];
  } catch (err) {
    state.modelsError = String(err);
  } finally {
    state.modelsLoading = false;
  }
}

/**
 * Execute AskOnce query
 */
export async function executeAskOnceQuery(
  state: AskOnceState,
  question: string,
  selectedModels?: string[],
): Promise<AskOnceQueryResult | null> {
  if (!state.client || !state.connected) {
    return null;
  }

  if (!question.trim()) {
    return null;
  }

  state.queryLoading = true;
  state.queryError = null;
  state.queryResult = null;

  try {
    const params: Record<string, unknown> = {
      question: question.trim(),
      timeout: 60000,
    };

    if (selectedModels && selectedModels.length > 0) {
      params.models = selectedModels;
    }

    const result = await state.client.request<AskOnceQueryResult>("askonce.query", params);
    state.queryResult = result;
    return result;
  } catch (err) {
    state.queryError = String(err);
    return null;
  } finally {
    state.queryLoading = false;
  }
}

/**
 * Get available models from state
 */
export function getAvailableModels(state: AskOnceState): AskOnceModelInfo[] {
  return state.models.filter((m) => m.available);
}

/**
 * Create initial AskOnce state
 */
export function createAskOnceState(): AskOnceState {
  return {
    client: null,
    connected: false,
    modelsLoading: false,
    models: [],
    modelsError: null,
    queryLoading: false,
    queryQuestion: "",
    queryResult: null,
    queryError: null,
    selectedModels: [],
  };
}
