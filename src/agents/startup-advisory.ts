import type { AgentMessage } from "@mariozechner/pi-agent-core";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type {
  SessionTaskTextSource,
  SessionStartupAdvisory,
  SessionStartupRecommendationFile,
  SessionStartupRecommendationSection,
} from "../config/sessions/types.js";
import { resolveStateDir } from "../config/paths.js";
import { execFileUtf8 } from "../daemon/exec-file.js";
import { buildBootstrapContextFiles } from "./pi-embedded-helpers.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import { writeRuntimeReflection } from "./runtime-reflection.js";
import type { WorkspaceBootstrapFile } from "./workspace.js";

const DEFAULT_RECOMMEND_BIN =
  "/Users/lixun/.openclaw/workspace/scripts/pageindex/recommend-startup-context";
const DEFAULT_PYTHON_BINS = ["/opt/homebrew/bin/python3", "/usr/bin/python3", "python3"];
const DEFAULT_RECOMMEND_TIMEOUT_MS = 8_000;
const INITIAL_UNCACHED_RECOMMEND_TIMEOUT_MS = 15_000;
const BACKGROUND_REFRESH_TIMEOUT_MS = 30_000;
const STARTUP_ADVISORY_CACHE_FILENAME = "last_advisory_cache.json";
const STARTUP_ADVISORY_CACHE_VERSION = 1;
const AUTO_ATTACH_MAX_CHARS = 6_000;
const AUTO_ATTACH_MIN_SCORE = 18;
const POLICY_AUTO_ATTACH_MAX_CHARS = 4_000;
const POLICY_AUTO_ATTACH_MIN_SCORE = 20;
const STARTUP_TASK_TEXT_MAX_CHARS = 1_200;
const CACHED_STARTUP_ADVISORY_NOTE = "Using cached advisory, refreshing in background.";
const CACHED_STARTUP_AUTO_ATTACH_NOTE =
  "Auto-attach is skipped for cached startup advisory; wait for a fresh refresh before attaching files.";
const INITIAL_INDEXING_NOTE = "首次启动索引中，下次将秒级生效";

type StartupAdvisoryCacheEntry = {
  version: number;
  cachedAt: string;
  taskShape: SessionStartupAdvisory["taskShape"];
  taskPreview?: string;
  advisory: SessionStartupAdvisory;
};

const startupAdvisoryBackgroundRefreshes = new Map<string, Promise<void>>();

export function resetStartupAdvisoryBackgroundRefreshesForTest(): void {
  startupAdvisoryBackgroundRefreshes.clear();
}

export type StartupContextRecommendationPayload = {
  corpus: string;
  task: string;
  generatedAt: string;
  indexVersion: string;
  recommendedFiles: SessionStartupRecommendationFile[];
};

export type StartupRouteContract = {
  routeMode: "skill" | "workflow" | "hybrid";
  skillHints: string[];
  workflowHints: string[];
  routeReason: string;
};

export type StartupTaskTextResolution = {
  taskText: string | undefined;
  source: SessionTaskTextSource;
};

type StartupReflectionContext = {
  sessionKey?: string;
  taskTextSource?: SessionTaskTextSource;
};

function resolveStartupAdvisoryCachePath(): string {
  return path.join(resolveStateDir(), "memory", STARTUP_ADVISORY_CACHE_FILENAME);
}

function supportsStartupAdvisoryCache(taskShape: SessionStartupAdvisory["taskShape"]): boolean {
  return taskShape !== "general" && taskShape !== "source_discovery";
}

function isTimeoutLikeStartupError(errorMessage: string | undefined): boolean {
  return /timed out|timeout|etimedout|sigterm|killed/i.test(errorMessage ?? "");
}

function emitStartupAdvisoryReflection(params: {
  taskText?: string;
  taskShape: SessionStartupAdvisory["taskShape"];
  sessionKey?: string;
  taskTextSource?: SessionTaskTextSource;
  claimedOutcome: string;
  observedOutcome: string;
  claimMismatch?: boolean;
  recoveryKind?: string;
  route?: StartupRouteContract;
  advisory?: SessionStartupAdvisory;
  operatorActionable: string;
  sourceRefs?: string[];
  metadata?: Record<string, unknown>;
}): void {
  const taskPreview = normalizeTaskTextCandidate(params.taskText);
  const entityId = taskPreview ?? params.sessionKey ?? params.taskShape;
  void writeRuntimeReflection({
    surface: "startup_advisory",
    entityId,
    sessionKey: params.sessionKey,
    taskShape: params.taskShape,
    claimedOutcome: params.claimedOutcome,
    observedOutcome: params.observedOutcome,
    claimMismatch: params.claimMismatch,
    recoveryKind: params.recoveryKind,
    sourceRefs: [
      ...(params.sourceRefs ?? []),
      params.sessionKey ? `session:${params.sessionKey}` : "",
      params.taskTextSource ? `task-text-source:${params.taskTextSource}` : "",
    ].filter(Boolean),
    benchmarkTags: ["startup-advisory", "honest-outcome"],
    operatorActionable: params.operatorActionable,
    metadata: {
      taskPreview,
      taskTextSource: params.taskTextSource,
      routeMode: params.route?.routeMode ?? params.advisory?.routeMode,
      autoAttachStatus: params.advisory?.autoAttachStatus,
      advisorySource: params.advisory?.source,
      advisoryStatus: params.advisory?.status,
      ...params.metadata,
    },
  }).catch(() => {});
}

function buildUnavailableStartupAdvisory(params: {
  taskShape: SessionStartupAdvisory["taskShape"];
  route: StartupRouteContract;
  note: string;
  error: string;
  autoAttachNote?: string;
}): SessionStartupAdvisory {
  return {
    mode: "advisory",
    source: "pageindex-startup-context",
    status: "unavailable",
    taskShape: params.taskShape,
    ...params.route,
    note: params.note,
    recommendationCount: 0,
    recommendedFiles: [],
    autoAttachStatus: "not_eligible",
    autoAttachNote:
      params.autoAttachNote ??
      "Auto-attach did not run because startup advisory was unavailable.",
    autoAttachedFiles: [],
    error: params.error,
  };
}

function validateStartupAdvisoryCacheEntry(
  value: unknown,
): asserts value is StartupAdvisoryCacheEntry {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid startup advisory cache: entry must be an object");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.version !== "number" ||
    typeof record.cachedAt !== "string" ||
    typeof record.taskShape !== "string" ||
    !record.advisory ||
    typeof record.advisory !== "object"
  ) {
    throw new Error("Invalid startup advisory cache: missing metadata");
  }
  const advisory = record.advisory as Record<string, unknown>;
  if (
    advisory.mode !== "advisory" ||
    typeof advisory.source !== "string" ||
    typeof advisory.status !== "string" ||
    typeof advisory.taskShape !== "string" ||
    !Array.isArray(advisory.recommendedFiles)
  ) {
    throw new Error("Invalid startup advisory cache: malformed advisory");
  }
}

async function readStartupAdvisoryCache(
  taskShape: SessionStartupAdvisory["taskShape"],
): Promise<StartupAdvisoryCacheEntry | undefined> {
  if (!supportsStartupAdvisoryCache(taskShape)) {
    return undefined;
  }
  try {
    const raw = await readFile(resolveStartupAdvisoryCachePath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    validateStartupAdvisoryCacheEntry(parsed);
    if (parsed.version !== STARTUP_ADVISORY_CACHE_VERSION) {
      return undefined;
    }
    if (parsed.taskShape !== taskShape) {
      return undefined;
    }
    if (parsed.advisory.status !== "ready") {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function toCachedStartupAdvisory(
  entry: StartupAdvisoryCacheEntry,
): SessionStartupAdvisory {
  return {
    ...entry.advisory,
    source: "cached",
    note: CACHED_STARTUP_ADVISORY_NOTE,
    autoAttachStatus: "not_eligible",
    autoAttachNote: CACHED_STARTUP_AUTO_ATTACH_NOTE,
    autoAttachedFiles: [],
  };
}

async function persistStartupAdvisoryCache(params: {
  task: string;
  advisory: SessionStartupAdvisory;
}): Promise<void> {
  if (!supportsStartupAdvisoryCache(params.advisory.taskShape)) {
    return;
  }
  if (params.advisory.status !== "ready") {
    return;
  }
  const advisoryToPersist: SessionStartupAdvisory = {
    ...params.advisory,
    source: "pageindex-startup-context",
  };
  const cachePath = resolveStartupAdvisoryCachePath();
  const payload: StartupAdvisoryCacheEntry = {
    version: STARTUP_ADVISORY_CACHE_VERSION,
    cachedAt: new Date().toISOString(),
    taskShape: advisoryToPersist.taskShape,
    taskPreview: normalizeTaskTextCandidate(params.task),
    advisory: advisoryToPersist,
  };
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

async function resolvePythonFallbackInvocation(
  binPath: string,
  args: string[],
): Promise<{ command: string; args: string[] } | undefined> {
  let header = "";
  try {
    header = (await readFile(binPath, "utf8")).slice(0, 256);
  } catch {
    return undefined;
  }
  const firstLine = header.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine.startsWith("#!")) {
    return undefined;
  }
  if (!/python3?/.test(firstLine)) {
    return undefined;
  }
  const override = process.env.OPENCLAW_RECOMMEND_STARTUP_CONTEXT_PYTHON?.trim();
  const pythonBin = override || DEFAULT_PYTHON_BINS[0];
  return {
    command: pythonBin,
    args: [binPath, ...args],
  };
}

function normalizeTaskTextCandidate(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= STARTUP_TASK_TEXT_MAX_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, STARTUP_TASK_TEXT_MAX_CHARS - 1).trimEnd()}…`;
}

function extractLatestUserMessageText(messages: AgentMessage[] | undefined): string | undefined {
  if (!messages?.length) {
    return undefined;
  }

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.role !== "user") {
      continue;
    }
    if (typeof message.content === "string") {
      const normalized = normalizeTaskTextCandidate(message.content);
      if (normalized) {
        return normalized;
      }
      continue;
    }
    if (!Array.isArray(message.content)) {
      continue;
    }
    const text = message.content
      .map((block) => {
        if (!block || typeof block !== "object") {
          return "";
        }
        const typedBlock = block as { text?: unknown };
        return typeof typedBlock.text === "string" ? typedBlock.text : "";
      })
      .filter(Boolean)
      .join(" ")
      .trim();
    const normalized = normalizeTaskTextCandidate(text);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

export function resolveStartupTaskText(params: {
  startupTaskText?: string;
  startupTaskTextSourceHint?: SessionTaskTextSource;
  prompt?: string;
  historyMessages?: AgentMessage[];
  extraSystemPrompt?: string;
}): StartupTaskTextResolution {
  const hintedTaskText = normalizeTaskTextCandidate(params.startupTaskText);
  if (hintedTaskText) {
    return { taskText: hintedTaskText, source: params.startupTaskTextSourceHint ?? "prompt" };
  }

  const promptText = normalizeTaskTextCandidate(params.prompt);
  if (promptText) {
    return { taskText: promptText, source: "prompt" };
  }

  const historyText = extractLatestUserMessageText(params.historyMessages);
  if (historyText) {
    return { taskText: historyText, source: "history" };
  }

  const extraPromptText = normalizeTaskTextCandidate(params.extraSystemPrompt);
  if (extraPromptText) {
    return { taskText: extraPromptText, source: "extra_system_prompt" };
  }
  return { taskText: undefined, source: "none" };
}

function isSourceDiscoveryTask(normalized: string): boolean {
  if (!normalized) {
    return false;
  }

  if (
    /(read-github|read github|direct source read|source discovery|source unresolved|repo slug|github 404|原始信源|原始链接|仓库名不是|仓库地址不确定)/i.test(
      normalized,
    )
  ) {
    return true;
  }

  const sourceContext =
    /(github|repo|repository|slug|source|original link|source link|url|x\.com|tweet|tweet thread|网页|页面|链接|原帖|原文|原始链接|原始信源|仓库|仓库名|仓库地址|github 链接|源地址)/i.test(
      normalized,
    );
  const failureSignal =
    /(404|not found|missing|unresolved|can't find|cannot find|couldn't find|failed|failure|guess|guessed|uncertain|unknown|找不到|未确认|不确定|猜的|不存在|读取失败|直读失败|没找到)/i.test(
      normalized,
    );

  return sourceContext && failureSignal;
}

function isSkillRoutingPolicyTask(normalized: string): boolean {
  if (!normalized) {
    return false;
  }

  if (
    /(skill routing|routing policy|route contract|route rules?|policy drift|bootstrap contract|startup advisory|startup context|context policy|system prompt|prompt contract|global-rules|skill-health-check|memory governance|governance contract|agents\.md|claude\.md)/i.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /\bskill\b/i.test(normalized) &&
    /\b(route|routing|policy|governance|context|startup|bootstrap|health|contract)\b/i.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /(技能路由|路由策略|策略漂移|启动建议|启动上下文|上下文策略|系统提示词|提示词契约|全局规则|技能健康检查|记忆治理|治理契约|agents\.md|claude\.md)/i.test(
      normalized,
    )
  ) {
    return true;
  }

  return false;
}

function validateRecommendationSection(
  value: unknown,
): asserts value is SessionStartupRecommendationSection {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Record<string, unknown>).section !== "string" ||
    typeof (value as Record<string, unknown>).excerpt !== "string" ||
    typeof (value as Record<string, unknown>).score !== "number"
  ) {
    throw new Error("Invalid recommend-startup payload: malformed section entry");
  }
}

function validateRecommendationFile(
  value: unknown,
): asserts value is SessionStartupRecommendationFile {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Record<string, unknown>).rank !== "number" ||
    typeof (value as Record<string, unknown>).path !== "string" ||
    typeof (value as Record<string, unknown>).sourceType !== "string" ||
    typeof (value as Record<string, unknown>).title !== "string" ||
    typeof (value as Record<string, unknown>).rationale !== "string" ||
    !Array.isArray((value as Record<string, unknown>).sections)
  ) {
    throw new Error("Invalid recommend-startup payload: malformed recommended file entry");
  }

  for (const section of (value as Record<string, unknown>).sections as unknown[]) {
    validateRecommendationSection(section);
  }
}

function validateRecommendationPayload(
  value: unknown,
): asserts value is StartupContextRecommendationPayload {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Record<string, unknown>).corpus !== "string" ||
    typeof (value as Record<string, unknown>).task !== "string" ||
    typeof (value as Record<string, unknown>).generatedAt !== "string" ||
    typeof (value as Record<string, unknown>).indexVersion !== "string" ||
    !Array.isArray((value as Record<string, unknown>).recommendedFiles)
  ) {
    throw new Error("Invalid recommend-startup payload: missing top-level fields");
  }

  for (const item of (value as Record<string, unknown>).recommendedFiles as unknown[]) {
    validateRecommendationFile(item);
  }
}

export function classifyStartupTaskShape(
  task: string | undefined,
): SessionStartupAdvisory["taskShape"] {
  const normalized = (task ?? "").trim().toLowerCase();
  if (!normalized) {
    return "general";
  }

  if (isSourceDiscoveryTask(normalized)) {
    return "source_discovery";
  }

  if (
    /(debug|bug|error|failing|failure|traceback|incident|cron|runtime|router|crash|broken|fix)/i.test(
      normalized,
    )
  ) {
    return "debug_runtime";
  }

  if (
    /(research|analy[sz]e|compare|paper|pdf|whitepaper|report|long doc|long-document|study|survey|read and summarize)/i.test(
      normalized,
    )
  ) {
    return "research_long_doc";
  }

  if (isSkillRoutingPolicyTask(normalized)) {
    return "skill_routing_policy";
  }

  return "general";
}

export function resolveStartupRouteContract(
  taskShape: SessionStartupAdvisory["taskShape"],
): StartupRouteContract {
  switch (taskShape) {
    case "source_discovery":
      return {
        routeMode: "workflow",
        skillHints: ["ll", "bb"],
        workflowHints: [
          'll 调研 "<goal>"',
          "ll 网页 <url>",
          "bb open <url> (only if low-level page inspection is still needed)",
        ],
        routeReason:
          "When a direct source read fails with 404 or an unresolved repo/link guess, escalate into source discovery: use ll first for read-only discovery and only drop to bb for low-level browser inspection.",
      };
    case "debug_runtime":
      return {
        routeMode: "skill",
        skillHints: ["runtime-debug-playbook"],
        workflowHints: [],
        routeReason:
          "Debug/runtime tasks stay primarily skill-routed because diagnosis and sequencing are still judgment-heavy.",
      };
    case "skill_routing_policy":
      return {
        routeMode: "skill",
        skillHints: ["global-rules", "skill-health-check"],
        workflowHints: [],
        routeReason:
          "Routing and policy tasks should stay on model-routed skills unless they harden into a stable artifact workflow.",
      };
    case "research_long_doc":
      return {
        routeMode: "hybrid",
        skillHints: [],
        workflowHints: ["/context recommend <task>"],
        routeReason:
          "Long-doc research benefits from soft skill routing plus an explicit retrieval workflow for repeatable evidence gathering.",
      };
    case "general":
    default:
      return {
        routeMode: "skill",
        skillHints: [],
        workflowHints: [],
        routeReason:
          "General startup keeps the default skill-routed path unless a repeatable operator workflow clearly fits better.",
      };
  }
}

export async function fetchStartupContextRecommendations(
  task: string,
  options?: {
    binPath?: string;
    limitFiles?: number;
    sectionsPerFile?: number;
    timeoutMs?: number;
  },
): Promise<StartupContextRecommendationPayload> {
  const binPath =
    options?.binPath ??
    process.env.OPENCLAW_RECOMMEND_STARTUP_CONTEXT_BIN ??
    DEFAULT_RECOMMEND_BIN;
  const args = [
    "--task",
    task,
    "--limit-files",
    String(options?.limitFiles ?? 3),
    "--sections-per-file",
    String(options?.sectionsPerFile ?? 2),
  ];
  const result = await execFileUtf8(binPath, args, {
    timeout: options?.timeoutMs ?? DEFAULT_RECOMMEND_TIMEOUT_MS,
  });
  let finalResult = result;
  if (result.code !== 0) {
    const pythonFallback = await resolvePythonFallbackInvocation(binPath, args);
    if (pythonFallback) {
      const retried = await execFileUtf8(pythonFallback.command, pythonFallback.args, {
        timeout: options?.timeoutMs ?? DEFAULT_RECOMMEND_TIMEOUT_MS,
      });
      if (retried.code === 0 || (!retried.stderr && !retried.stdout)) {
        finalResult = retried;
      } else if (!result.stderr && !result.stdout) {
        finalResult = retried;
      }
    }
  }
  if (finalResult.code !== 0) {
    throw new Error(
      `recommend-startup-context failed (${finalResult.code}): ${finalResult.stderr || finalResult.stdout || "unknown error"}`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(finalResult.stdout);
  } catch (error) {
    throw new Error(
      `recommend-startup-context returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  validateRecommendationPayload(payload);
  return payload;
}

async function buildFreshStartupContextAdvisory(params: {
  task: string;
  taskShape: SessionStartupAdvisory["taskShape"];
  route: StartupRouteContract;
  options?: {
    limitFiles?: number;
    sectionsPerFile?: number;
    timeoutMs?: number;
    binPath?: string;
  };
}): Promise<SessionStartupAdvisory> {
  try {
    const payload = await fetchStartupContextRecommendations(params.task, {
      binPath: params.options?.binPath,
      limitFiles: params.options?.limitFiles,
      sectionsPerFile: params.options?.sectionsPerFile,
      timeoutMs: params.options?.timeoutMs,
    });
    return {
      mode: "advisory",
      source: "pageindex-startup-context",
      status: "ready",
      taskShape: params.taskShape,
      ...params.route,
      note: "Advisory only. Review these after mandatory reads; nothing was auto-injected into the prompt.",
      recommendationCount: payload.recommendedFiles.length,
      generatedAt: payload.generatedAt,
      indexVersion: payload.indexVersion,
      recommendedFiles: payload.recommendedFiles,
      autoAttachStatus: "not_eligible",
      autoAttachNote: "Advisory generated, but auto-attach policy has not been evaluated yet.",
      autoAttachedFiles: [],
    };
  } catch (error) {
    return buildUnavailableStartupAdvisory({
      taskShape: params.taskShape,
      route: params.route,
      note: "Startup advisory was attempted but unavailable. Bootstrap stayed unchanged.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function scheduleStartupAdvisoryRefresh(params: {
  task: string;
  taskShape: SessionStartupAdvisory["taskShape"];
  route: StartupRouteContract;
  options?: {
    limitFiles?: number;
    sectionsPerFile?: number;
    binPath?: string;
  };
}): void {
  if (!supportsStartupAdvisoryCache(params.taskShape)) {
    return;
  }
  const key = params.taskShape;
  if (startupAdvisoryBackgroundRefreshes.has(key)) {
    return;
  }
  const refreshPromise = (async () => {
    const advisory = await buildFreshStartupContextAdvisory({
      task: params.task,
      taskShape: params.taskShape,
      route: params.route,
      options: {
        ...params.options,
        timeoutMs: BACKGROUND_REFRESH_TIMEOUT_MS,
      },
    });
    if (advisory.status === "ready") {
      await persistStartupAdvisoryCache({ task: params.task, advisory });
      console.log("[startup-advisory] 后台刷新缓存完成");
      return;
    }
    console.warn(
      "[startup-advisory] 后台刷新失败，保留旧缓存:",
      new Error(advisory.error ?? "unknown refresh failure"),
    );
  })()
    .catch((error: unknown) => {
      console.warn(
        "[startup-advisory] 后台刷新失败，保留旧缓存:",
        error instanceof Error ? error : new Error(String(error)),
      );
    })
    .finally(() => {
      startupAdvisoryBackgroundRefreshes.delete(key);
    });
  startupAdvisoryBackgroundRefreshes.set(key, refreshPromise);
}

export async function buildStartupContextAdvisory(
  taskText: string | undefined,
  options?: {
    limitFiles?: number;
    sectionsPerFile?: number;
    timeoutMs?: number;
    binPath?: string;
    sessionKey?: string;
    taskTextSource?: SessionTaskTextSource;
  },
): Promise<SessionStartupAdvisory | undefined> {
  const task = taskText?.trim();
  if (!task) {
    const route = resolveStartupRouteContract("general");
    const advisory: SessionStartupAdvisory = {
      mode: "advisory",
      source: "pageindex-startup-context",
      status: "not_applicable",
      taskShape: "general",
      ...route,
      note: "No task text available for this session.",
      recommendationCount: 0,
      recommendedFiles: [],
    };
    emitStartupAdvisoryReflection({
      taskText,
      taskShape: "general",
      sessionKey: options?.sessionKey,
      taskTextSource: options?.taskTextSource,
      claimedOutcome: "startup_advisory_requested",
      observedOutcome: "task_text_missing",
      route,
      advisory,
      operatorActionable: advisory.note ?? "Capture task text at session start before relying on startup advisory.",
    });
    return advisory;
  }

  const taskShape = classifyStartupTaskShape(task);
  const route = resolveStartupRouteContract(taskShape);
  if (taskShape === "general") {
    const advisory: SessionStartupAdvisory = {
      mode: "advisory",
      source: "pageindex-startup-context",
      status: "not_applicable",
      taskShape,
      ...route,
      note: "No focused startup recommendation profile matched this task. Bootstrap stayed on mandatory reads only.",
      recommendationCount: 0,
      recommendedFiles: [],
    };
    emitStartupAdvisoryReflection({
      taskText: task,
      taskShape,
      sessionKey: options?.sessionKey,
      taskTextSource: options?.taskTextSource,
      claimedOutcome: "startup_advisory_requested",
      observedOutcome: "classifier_short_circuit_general",
      route,
      advisory,
      operatorActionable: advisory.note ?? "Escalate only if this recurring task needs a dedicated startup profile.",
    });
    return advisory;
  }

  if (taskShape === "source_discovery") {
    const advisory: SessionStartupAdvisory = {
      mode: "advisory",
      source: "pageindex-startup-context",
      status: "not_applicable",
      taskShape,
      ...route,
      note: "Source discovery stays on the ll-first workflow path. PageIndex startup recommendation is skipped for unresolved-source tasks.",
      recommendationCount: 0,
      recommendedFiles: [],
      autoAttachStatus: "not_eligible",
      autoAttachNote:
        "Auto-attach does not run for source discovery. Keep source lookup lightweight and operator-visible.",
      autoAttachedFiles: [],
    };
    emitStartupAdvisoryReflection({
      taskText: task,
      taskShape,
      sessionKey: options?.sessionKey,
      taskTextSource: options?.taskTextSource,
      claimedOutcome: "startup_advisory_requested",
      observedOutcome: "classifier_short_circuit_source_discovery",
      route,
      advisory,
      operatorActionable: advisory.note ?? "Stay on the ll-first source discovery path instead of PageIndex startup attach.",
    });
    return advisory;
  }

  const cachedAdvisory = await readStartupAdvisoryCache(taskShape);
  if (cachedAdvisory) {
    scheduleStartupAdvisoryRefresh({
      task,
      taskShape,
      route,
      options: {
        binPath: options?.binPath,
        limitFiles: options?.limitFiles,
        sectionsPerFile: options?.sectionsPerFile,
      },
    });
    const advisory = toCachedStartupAdvisory(cachedAdvisory);
    emitStartupAdvisoryReflection({
      taskText: task,
      taskShape,
      sessionKey: options?.sessionKey,
      taskTextSource: options?.taskTextSource,
      claimedOutcome: "fresh_advisory",
      observedOutcome: "cached_advisory",
      route,
      advisory,
      operatorActionable: advisory.note ?? CACHED_STARTUP_ADVISORY_NOTE,
    });
    return advisory;
  }

  const advisory = await buildFreshStartupContextAdvisory({
    task,
    taskShape,
    route,
    options: {
      binPath: options?.binPath,
      limitFiles: options?.limitFiles,
      sectionsPerFile: options?.sectionsPerFile,
      timeoutMs: options?.timeoutMs ?? INITIAL_UNCACHED_RECOMMEND_TIMEOUT_MS,
    },
  });
  if (advisory.status === "ready") {
    await persistStartupAdvisoryCache({ task, advisory });
    emitStartupAdvisoryReflection({
      taskText: task,
      taskShape,
      sessionKey: options?.sessionKey,
      taskTextSource: options?.taskTextSource,
      claimedOutcome: "fresh_advisory",
      observedOutcome: "ready",
      route,
      advisory,
      operatorActionable: advisory.note ?? "Review the recommended files before attaching more context.",
    });
    return advisory;
  }
  if (isTimeoutLikeStartupError(advisory.error)) {
    scheduleStartupAdvisoryRefresh({
      task,
      taskShape,
      route,
      options: {
        binPath: options?.binPath,
        limitFiles: options?.limitFiles,
        sectionsPerFile: options?.sectionsPerFile,
      },
    });
    const timeoutAdvisory = {
      ...advisory,
      note: INITIAL_INDEXING_NOTE,
      autoAttachStatus: "not_eligible",
      autoAttachNote:
        "Auto-attach did not run because startup advisory is still building its first cache.",
    };
    emitStartupAdvisoryReflection({
      taskText: task,
      taskShape,
      sessionKey: options?.sessionKey,
      taskTextSource: options?.taskTextSource,
      claimedOutcome: "fresh_advisory",
      observedOutcome: "advisory_unavailable_timeout",
      route,
      advisory: timeoutAdvisory,
      operatorActionable: timeoutAdvisory.note ?? INITIAL_INDEXING_NOTE,
    });
    return timeoutAdvisory;
  }
  emitStartupAdvisoryReflection({
    taskText: task,
    taskShape,
    sessionKey: options?.sessionKey,
    taskTextSource: options?.taskTextSource,
    claimedOutcome: "fresh_advisory",
    observedOutcome: "advisory_unavailable",
    route,
    advisory,
    operatorActionable:
      advisory.autoAttachNote ??
      advisory.note ??
      "Inspect recommend-startup-context errors before trusting startup advisory coverage.",
  });
  return advisory;
}

function isEligibleAutoAttachPath(file: SessionStartupRecommendationFile): boolean {
  if (file.sourceType === "incident") {
    return true;
  }
  return file.sourceType === "docs" && file.path.includes("/docs/runbooks/");
}

function isEligiblePolicyAutoAttachPath(file: SessionStartupRecommendationFile): boolean {
  if (file.sourceType !== "docs") {
    return false;
  }
  return (
    file.path.includes("/docs/context/") ||
    file.path.includes("/docs/runbooks/") ||
    file.path.includes("/rules/")
  );
}

function topRecommendationScore(file: SessionStartupRecommendationFile): number {
  return file.sections[0]?.score ?? 0;
}

async function loadAutoAttachCandidate(
  file: SessionStartupRecommendationFile,
): Promise<WorkspaceBootstrapFile> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const content = await fs.readFile(file.path, "utf8");
  return {
    name: path.basename(file.path),
    path: file.path,
    content,
    missing: false,
  };
}

export async function applyStartupAutoAttachPolicy(params: {
  advisory: SessionStartupAdvisory | undefined;
  contextFiles: EmbeddedContextFile[];
  bootstrapFiles: WorkspaceBootstrapFile[];
  bootstrapMaxChars: number;
  bootstrapTotalMaxChars?: number;
  sessionKey?: string;
  taskTextSource?: SessionTaskTextSource;
}): Promise<{
  advisory: SessionStartupAdvisory | undefined;
  contextFiles: EmbeddedContextFile[];
}> {
  const advisory = params.advisory;
  if (!advisory) {
    return { advisory, contextFiles: params.contextFiles };
  }
  if (advisory.source === "cached") {
    const cachedResult = {
      advisory: {
        ...advisory,
        autoAttachStatus: "not_eligible",
        autoAttachNote: CACHED_STARTUP_AUTO_ATTACH_NOTE,
        autoAttachedFiles: [],
      },
      contextFiles: params.contextFiles,
    };
    emitStartupAdvisoryReflection({
      taskShape: advisory.taskShape,
      sessionKey: params.sessionKey,
      taskTextSource: params.taskTextSource,
      claimedOutcome: "fresh_auto_attach",
      observedOutcome: "auto_attach_skipped_cached",
      advisory: cachedResult.advisory,
      operatorActionable: cachedResult.advisory.autoAttachNote ?? CACHED_STARTUP_AUTO_ATTACH_NOTE,
    });
    return cachedResult;
  }

  if (advisory.status !== "ready") {
    const unavailableResult = {
      advisory: {
        ...advisory,
        autoAttachStatus: "not_eligible",
        autoAttachNote:
          advisory.autoAttachNote ?? "Auto-attach only runs when startup advisory is ready.",
        autoAttachedFiles: [],
      },
      contextFiles: params.contextFiles,
    };
    emitStartupAdvisoryReflection({
      taskShape: advisory.taskShape,
      sessionKey: params.sessionKey,
      taskTextSource: params.taskTextSource,
      claimedOutcome: "fresh_auto_attach",
      observedOutcome: "auto_attach_skipped_unready",
      advisory: unavailableResult.advisory,
      operatorActionable:
        unavailableResult.advisory.autoAttachNote ??
        "Wait for a ready startup advisory before auto-attaching files.",
    });
    return unavailableResult;
  }

  if (advisory.taskShape !== "debug_runtime") {
    if (advisory.taskShape === "skill_routing_policy") {
      const existingPaths = new Set([
        ...params.bootstrapFiles.map((file) => file.path),
        ...params.contextFiles.map((file) => file.path),
      ]);
      const candidate = advisory.recommendedFiles.find(
        (file) =>
          isEligiblePolicyAutoAttachPath(file) &&
          topRecommendationScore(file) >= POLICY_AUTO_ATTACH_MIN_SCORE &&
          !existingPaths.has(file.path),
      );
      if (!candidate) {
        const skippedResult = {
          advisory: {
            ...advisory,
            autoAttachStatus: "skipped",
            autoAttachNote:
              "No eligible policy/context recommendation met the v2 auto-attach policy.",
            autoAttachedFiles: [],
          },
          contextFiles: params.contextFiles,
        };
        emitStartupAdvisoryReflection({
          taskShape: advisory.taskShape,
          sessionKey: params.sessionKey,
          taskTextSource: params.taskTextSource,
          claimedOutcome: "fresh_auto_attach",
          observedOutcome: "auto_attach_skipped_no_candidate",
          advisory: skippedResult.advisory,
          operatorActionable: skippedResult.advisory.autoAttachNote ?? "No policy candidate met the attach threshold.",
        });
        return skippedResult;
      }

      const totalBudget = Math.max(params.bootstrapTotalMaxChars ?? params.bootstrapMaxChars, 1);
      const usedBudget = params.contextFiles.reduce((sum, file) => sum + file.content.length, 0);
      const remainingBudget = Math.max(0, totalBudget - usedBudget);
      if (remainingBudget <= 0) {
        const budgetResult = {
          advisory: {
            ...advisory,
            autoAttachStatus: "skipped",
            autoAttachNote:
              "No remaining bootstrap context budget was available for policy auto-attach.",
            autoAttachedFiles: [],
          },
          contextFiles: params.contextFiles,
        };
        emitStartupAdvisoryReflection({
          taskShape: advisory.taskShape,
          sessionKey: params.sessionKey,
          taskTextSource: params.taskTextSource,
          claimedOutcome: "fresh_auto_attach",
          observedOutcome: "auto_attach_skipped_budget",
          advisory: budgetResult.advisory,
          operatorActionable: budgetResult.advisory.autoAttachNote ?? "Free bootstrap budget before auto-attaching more policy context.",
        });
        return budgetResult;
      }

      try {
        const attachCandidate = await loadAutoAttachCandidate(candidate);
        const attachedContextFiles = buildBootstrapContextFiles([attachCandidate], {
          maxChars: Math.min(params.bootstrapMaxChars, POLICY_AUTO_ATTACH_MAX_CHARS),
          totalMaxChars: remainingBudget,
        });
        if (!attachedContextFiles.length) {
          const fitResult = {
            advisory: {
              ...advisory,
              autoAttachStatus: "skipped",
              autoAttachNote:
                "The chosen policy/context file could not fit inside the remaining context budget.",
              autoAttachedFiles: [],
            },
            contextFiles: params.contextFiles,
          };
          emitStartupAdvisoryReflection({
            taskShape: advisory.taskShape,
            sessionKey: params.sessionKey,
            taskTextSource: params.taskTextSource,
            claimedOutcome: "fresh_auto_attach",
            observedOutcome: "auto_attach_skipped_budget_fit",
            advisory: fitResult.advisory,
            operatorActionable: fitResult.advisory.autoAttachNote ?? "Trim context before retrying policy auto-attach.",
          });
          return fitResult;
        }

        return {
          advisory: {
            ...advisory,
            autoAttachStatus: "applied",
            autoAttachNote:
              "Auto-attach v2 added one high-confidence policy/context reference to the prompt context.",
            autoAttachedFiles: attachedContextFiles.map((file) => file.path),
          },
          contextFiles: [...params.contextFiles, ...attachedContextFiles],
        };
      } catch (error) {
        const failedResult = {
          advisory: {
            ...advisory,
            autoAttachStatus: "skipped",
            autoAttachNote: "Failed to read the chosen policy/context file for auto-attach.",
            autoAttachedFiles: [],
            error: advisory.error ?? (error instanceof Error ? error.message : String(error)),
          },
          contextFiles: params.contextFiles,
        };
        emitStartupAdvisoryReflection({
          taskShape: advisory.taskShape,
          sessionKey: params.sessionKey,
          taskTextSource: params.taskTextSource,
          claimedOutcome: "fresh_auto_attach",
          observedOutcome: "auto_attach_failed_read",
          advisory: failedResult.advisory,
          operatorActionable: failedResult.advisory.autoAttachNote ?? "Fix file access before retrying policy auto-attach.",
        });
        return failedResult;
      }
    }

    if (advisory.taskShape === "source_discovery") {
      const sourceDiscoveryResult = {
        advisory: {
          ...advisory,
          autoAttachStatus: "not_eligible",
          autoAttachNote:
            "Auto-attach v1 does not run for source discovery; keep the fallback lightweight and operator-visible.",
          autoAttachedFiles: [],
        },
        contextFiles: params.contextFiles,
      };
      emitStartupAdvisoryReflection({
        taskShape: advisory.taskShape,
        sessionKey: params.sessionKey,
        taskTextSource: params.taskTextSource,
        claimedOutcome: "fresh_auto_attach",
        observedOutcome: "auto_attach_not_eligible_source_discovery",
        advisory: sourceDiscoveryResult.advisory,
        operatorActionable:
          sourceDiscoveryResult.advisory.autoAttachNote ??
          "Keep source discovery lightweight instead of auto-attaching extra files.",
      });
      return sourceDiscoveryResult;
    }

    const notEligibleResult = {
      advisory: {
        ...advisory,
        autoAttachStatus: "not_eligible",
        autoAttachNote: "Auto-attach is only enabled for debug/runtime and policy/context tasks.",
        autoAttachedFiles: [],
      },
      contextFiles: params.contextFiles,
    };
    emitStartupAdvisoryReflection({
      taskShape: advisory.taskShape,
      sessionKey: params.sessionKey,
      taskTextSource: params.taskTextSource,
      claimedOutcome: "fresh_auto_attach",
      observedOutcome: "auto_attach_not_eligible",
      advisory: notEligibleResult.advisory,
      operatorActionable:
        notEligibleResult.advisory.autoAttachNote ??
        "Only debug/runtime and policy tasks are currently eligible for startup auto-attach.",
    });
    return notEligibleResult;
  }

  const existingPaths = new Set([
    ...params.bootstrapFiles.map((file) => file.path),
    ...params.contextFiles.map((file) => file.path),
  ]);
  const candidate = advisory.recommendedFiles.find(
    (file) =>
      isEligibleAutoAttachPath(file) &&
      topRecommendationScore(file) >= AUTO_ATTACH_MIN_SCORE &&
      !existingPaths.has(file.path),
  );

  if (!candidate) {
    const skippedResult = {
      advisory: {
        ...advisory,
        autoAttachStatus: "skipped",
        autoAttachNote:
          "No eligible debug/runtime recommendation met the v1 auto-attach policy.",
        autoAttachedFiles: [],
      },
      contextFiles: params.contextFiles,
    };
    emitStartupAdvisoryReflection({
      taskShape: advisory.taskShape,
      sessionKey: params.sessionKey,
      taskTextSource: params.taskTextSource,
      claimedOutcome: "fresh_auto_attach",
      observedOutcome: "auto_attach_skipped_no_candidate",
      advisory: skippedResult.advisory,
      operatorActionable:
        skippedResult.advisory.autoAttachNote ?? "No debug/runtime candidate met the attach threshold.",
    });
    return skippedResult;
  }

  const totalBudget = Math.max(params.bootstrapTotalMaxChars ?? params.bootstrapMaxChars, 1);
  const usedBudget = params.contextFiles.reduce((sum, file) => sum + file.content.length, 0);
  const remainingBudget = Math.max(0, totalBudget - usedBudget);
  if (remainingBudget <= 0) {
    const budgetResult = {
      advisory: {
        ...advisory,
        autoAttachStatus: "skipped",
        autoAttachNote: "No remaining bootstrap context budget was available for auto-attach.",
        autoAttachedFiles: [],
      },
      contextFiles: params.contextFiles,
    };
    emitStartupAdvisoryReflection({
      taskShape: advisory.taskShape,
      sessionKey: params.sessionKey,
      taskTextSource: params.taskTextSource,
      claimedOutcome: "fresh_auto_attach",
      observedOutcome: "auto_attach_skipped_budget",
      advisory: budgetResult.advisory,
      operatorActionable: budgetResult.advisory.autoAttachNote ?? "Free context budget before retrying auto-attach.",
    });
    return budgetResult;
  }

  try {
    const attachCandidate = await loadAutoAttachCandidate(candidate);
    const attachedContextFiles = buildBootstrapContextFiles([attachCandidate], {
      maxChars: Math.min(params.bootstrapMaxChars, AUTO_ATTACH_MAX_CHARS),
      totalMaxChars: remainingBudget,
    });
    if (!attachedContextFiles.length) {
      const fitResult = {
        advisory: {
          ...advisory,
          autoAttachStatus: "skipped",
          autoAttachNote: "The chosen startup file could not fit inside the remaining context budget.",
          autoAttachedFiles: [],
        },
        contextFiles: params.contextFiles,
      };
      emitStartupAdvisoryReflection({
        taskShape: advisory.taskShape,
        sessionKey: params.sessionKey,
        taskTextSource: params.taskTextSource,
        claimedOutcome: "fresh_auto_attach",
        observedOutcome: "auto_attach_skipped_budget_fit",
        advisory: fitResult.advisory,
        operatorActionable: fitResult.advisory.autoAttachNote ?? "Trim context before retrying startup auto-attach.",
      });
      return fitResult;
    }

    return {
      advisory: {
        ...advisory,
        autoAttachStatus: "applied",
        autoAttachNote:
          "Auto-attach v1 added one high-confidence debug/runtime reference to the prompt context.",
        autoAttachedFiles: attachedContextFiles.map((file) => file.path),
      },
      contextFiles: [...params.contextFiles, ...attachedContextFiles],
    };
  } catch (error) {
    const failedResult = {
      advisory: {
        ...advisory,
        autoAttachStatus: "skipped",
        autoAttachNote: "Failed to read the chosen startup file for auto-attach.",
        autoAttachedFiles: [],
        error: advisory.error ?? (error instanceof Error ? error.message : String(error)),
      },
      contextFiles: params.contextFiles,
    };
    emitStartupAdvisoryReflection({
      taskShape: advisory.taskShape,
      sessionKey: params.sessionKey,
      taskTextSource: params.taskTextSource,
      claimedOutcome: "fresh_auto_attach",
      observedOutcome: "auto_attach_failed_read",
      advisory: failedResult.advisory,
      operatorActionable: failedResult.advisory.autoAttachNote ?? "Fix file access before retrying startup auto-attach.",
    });
    return failedResult;
  }
}
