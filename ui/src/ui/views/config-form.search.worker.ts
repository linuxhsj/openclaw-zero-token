// Web Worker for processing search matching in background thread
import {
  matchesNodeSearch,
  type ConfigSearchCriteria,
} from "./config-form.node.ts";
import type { JsonSchema } from "./config-form.shared.ts";

type SearchRequest = {
  id: string;
  schema: JsonSchema;
  value: unknown;
  path: Array<string | number>;
  hints: Record<string, { label?: string; help?: string; tags?: string[] }>;
  criteria: ConfigSearchCriteria;
};

type SearchResponse = {
  id: string;
  matches: boolean;
};

type MessageType = "search" | "clear-cache";

type WorkerMessage = {
  type: MessageType;
  payload: SearchRequest;
};

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;

  if (type === "search") {
    try {
      const result = matchesNodeSearch({
        schema: payload.schema,
        value: payload.value,
        path: payload.path,
        hints: payload.hints,
        criteria: payload.criteria,
      });

      const response: SearchResponse = {
        id: payload.id,
        matches: result,
      };

      self.postMessage({
        type: "result",
        payload: response,
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        payload: {
          id: payload.id,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  } else if (type === "clear-cache") {
    // Clear any worker-side caches if needed
    self.postMessage({
      type: "cache-cleared",
    });
  }
};

export {};
