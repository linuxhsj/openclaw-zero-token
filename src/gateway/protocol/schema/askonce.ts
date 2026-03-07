import { Type } from "@sinclair/typebox";

/**
 * AskOnce Protocol Schemas
 */

export const AskOnceQueryParamsSchema = Type.Object(
  {
    question: Type.String({ minLength: 1 }),
    models: Type.Optional(Type.Array(Type.String())),
    timeout: Type.Optional(Type.Integer({ minimum: 1000 })),
    stream: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const AskOnceModelResponseSchema = Type.Object({
  modelId: Type.String(),
  modelName: Type.String(),
  provider: Type.String(),
  status: Type.Union([
    Type.Literal("completed"),
    Type.Literal("error"),
    Type.Literal("timeout"),
  ]),
  content: Type.String(),
  error: Type.Optional(Type.String()),
  responseTime: Type.Number(),
  charCount: Type.Number(),
});

export const AskOnceQueryResultSchema = Type.Object({
  queryId: Type.String(),
  question: Type.String(),
  totalTime: Type.Number(),
  successCount: Type.Number(),
  errorCount: Type.Number(),
  responses: Type.Array(AskOnceModelResponseSchema),
  formatted: Type.Optional(Type.String()),
});

export const AskOnceModelInfoSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  provider: Type.String(),
  available: Type.Boolean(),
});

export const AskOnceListResultSchema = Type.Object({
  models: Type.Array(AskOnceModelInfoSchema),
});
