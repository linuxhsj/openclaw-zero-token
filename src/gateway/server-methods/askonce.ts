/**
 * AskOnce Gateway Handler
 * Handles concurrent queries to multiple AI models
 */

import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateAskOnceQueryParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";
import { QueryOrchestrator } from "../../askonce/query-orchestrator.js";
import { ConsoleFormatter } from "../../askonce/formatters/index.js";

export const askonceHandlers: GatewayRequestHandlers = {
  "askonce.query": async ({ params, respond, context }) => {
    if (!validateAskOnceQueryParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid askonce.query params: ${formatValidationErrors(validateAskOnceQueryParams.errors)}`,
        ),
      );
      return;
    }

    const { question, models, timeout, stream } = params as {
      question: string;
      models?: string[];
      timeout?: number;
      stream?: boolean;
    };

    const orchestrator = new QueryOrchestrator();

    try {
      // Execute concurrent query to all models
      const result = await orchestrator.query({
        question,
        models,
        timeout: timeout || 60000,
        stream,
      });

      // Format result
      const formatter = new ConsoleFormatter();
      const formatted = formatter.format(result);

      respond(true, {
        queryId: result.queryId,
        question: result.question,
        totalTime: result.totalTime,
        successCount: result.successCount,
        errorCount: result.errorCount,
        responses: result.responses.map((r) => ({
          modelId: r.modelId,
          modelName: r.modelName,
          provider: r.provider,
          status: r.status,
          content: r.content,
          error: r.error,
          responseTime: r.responseTime,
          charCount: r.charCount,
        })),
        formatted,
      }, undefined);
    } catch (err) {
      context.logGateway.error(`askonce.query failed: ${err}`);
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "askonce.list": async ({ respond, context }) => {
    const orchestrator = new QueryOrchestrator();

    try {
      const models = await orchestrator.listAvailableModels();
      respond(true, { models }, undefined);
    } catch (err) {
      context.logGateway.error(`askonce.list failed: ${err}`);
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
