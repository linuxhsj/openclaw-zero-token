import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_RUNTIME_REFLECTIONS_ROOT =
  "/Users/lixun/.openclaw/workspace/artifacts/self-improve";

export type RuntimeReflectionSurface =
  | "cron"
  | "startup_advisory"
  | "memory_operator"
  | "timeline_intel";

export type RuntimeReflectionRecord = {
  version: 1;
  id: string;
  surface: RuntimeReflectionSurface;
  entityId: string;
  sessionKey?: string;
  taskShape?: string;
  claimedOutcome: string;
  observedOutcome: string;
  claimMismatch?: boolean;
  recoveryKind?: string;
  sourceRefs: string[];
  benchmarkTags: string[];
  operatorActionable: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type RuntimeReflectionWriteInput = Omit<RuntimeReflectionRecord, "version" | "id"> & {
  id?: string;
};

export type RuntimeReflectionArtifact = {
  path: string;
  record: RuntimeReflectionRecord;
};

function resolveRuntimeReflectionsRoot(): string {
  return (
    process.env.OPENCLAW_RUNTIME_REFLECTIONS_ROOT?.trim() || DEFAULT_RUNTIME_REFLECTIONS_ROOT
  );
}

function slugify(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "artifact";
}

function normalizeRefs(values: string[] | undefined): string[] {
  return Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  );
}

function resolveCreatedAt(value?: string): string {
  const createdAt = value?.trim() || new Date().toISOString();
  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid runtime reflection createdAt: ${value}`);
  }
  return new Date(parsed).toISOString();
}

function buildRuntimeReflectionId(
  surface: RuntimeReflectionSurface,
  entityId: string,
  createdAt: string,
): string {
  const stamp = createdAt.replace(/[-:.TZ]/g, "").slice(0, 17);
  return `${surface.replace(/_/g, "-")}-${slugify(entityId)}-${stamp}`;
}

function resolveRuntimeReflectionPath(record: RuntimeReflectionRecord): string {
  const datePart = record.createdAt.slice(0, 10);
  return path.join(
    resolveRuntimeReflectionsRoot(),
    datePart,
    record.surface,
    `${record.id}.json`,
  );
}

async function resolveUniqueRuntimeReflectionArtifact(record: RuntimeReflectionRecord): Promise<{
  record: RuntimeReflectionRecord;
  path: string;
}> {
  let nextRecord = record;
  let filePath = resolveRuntimeReflectionPath(nextRecord);
  let suffix = 2;
  while (true) {
    try {
      await fs.access(filePath);
      nextRecord = { ...record, id: `${record.id}-${suffix}` };
      filePath = resolveRuntimeReflectionPath(nextRecord);
      suffix += 1;
    } catch {
      return { record: nextRecord, path: filePath };
    }
  }
}

export async function writeRuntimeReflection(
  input: RuntimeReflectionWriteInput,
): Promise<RuntimeReflectionArtifact> {
  const createdAt = resolveCreatedAt(input.createdAt);
  const record: RuntimeReflectionRecord = {
    version: 1,
    id: input.id?.trim() || buildRuntimeReflectionId(input.surface, input.entityId, createdAt),
    surface: input.surface,
    entityId: input.entityId.trim(),
    sessionKey: input.sessionKey?.trim() || undefined,
    taskShape: input.taskShape?.trim() || undefined,
    claimedOutcome: input.claimedOutcome.trim(),
    observedOutcome: input.observedOutcome.trim(),
    claimMismatch: input.claimMismatch === true ? true : undefined,
    recoveryKind: input.recoveryKind?.trim() || undefined,
    sourceRefs: normalizeRefs(input.sourceRefs),
    benchmarkTags: normalizeRefs(input.benchmarkTags),
    operatorActionable: input.operatorActionable.trim(),
    createdAt,
    metadata: input.metadata,
  };
  const { record: uniqueRecord, path: filePath } =
    await resolveUniqueRuntimeReflectionArtifact(record);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(uniqueRecord, null, 2)}\n`, "utf8");
  return { path: filePath, record: uniqueRecord };
}

function parseReflectionRecord(raw: string, filePath: string): RuntimeReflectionRecord | null {
  try {
    const parsed = JSON.parse(raw) as Partial<RuntimeReflectionRecord> | null;
    if (!parsed || parsed.version !== 1 || typeof parsed.id !== "string") {
      return null;
    }
    if (
      typeof parsed.surface !== "string" ||
      typeof parsed.entityId !== "string" ||
      typeof parsed.claimedOutcome !== "string" ||
      typeof parsed.observedOutcome !== "string" ||
      typeof parsed.operatorActionable !== "string" ||
      typeof parsed.createdAt !== "string"
    ) {
      return null;
    }
    const createdAt = resolveCreatedAt(parsed.createdAt);
    return {
      version: 1,
      id: parsed.id,
      surface: parsed.surface as RuntimeReflectionSurface,
      entityId: parsed.entityId,
      sessionKey: typeof parsed.sessionKey === "string" ? parsed.sessionKey : undefined,
      taskShape: typeof parsed.taskShape === "string" ? parsed.taskShape : undefined,
      claimedOutcome: parsed.claimedOutcome,
      observedOutcome: parsed.observedOutcome,
      claimMismatch: parsed.claimMismatch === true ? true : undefined,
      recoveryKind: typeof parsed.recoveryKind === "string" ? parsed.recoveryKind : undefined,
      sourceRefs: normalizeRefs(Array.isArray(parsed.sourceRefs) ? parsed.sourceRefs : []),
      benchmarkTags: normalizeRefs(Array.isArray(parsed.benchmarkTags) ? parsed.benchmarkTags : []),
      operatorActionable: parsed.operatorActionable,
      createdAt,
      metadata:
        parsed.metadata && typeof parsed.metadata === "object"
          ? (parsed.metadata as Record<string, unknown>)
          : undefined,
    };
  } catch {
    return null;
  }
}

async function walkJsonFiles(root: string): Promise<string[]> {
  const pending = [root];
  const results: string[] = [];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(nextPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        results.push(nextPath);
      }
    }
  }
  return results;
}

export async function loadRecentRuntimeReflections(params?: {
  nowMs?: number;
  windowMs?: number;
  surfaces?: RuntimeReflectionSurface[];
  limit?: number;
}): Promise<RuntimeReflectionArtifact[]> {
  const nowMs = params?.nowMs ?? Date.now();
  const windowMs = Math.max(1, params?.windowMs ?? 24 * 60 * 60_000);
  const limit = Math.max(1, params?.limit ?? 50);
  const surfaceFilter = params?.surfaces?.length ? new Set(params.surfaces) : null;
  const root = resolveRuntimeReflectionsRoot();
  const files = await walkJsonFiles(root);
  const artifacts: RuntimeReflectionArtifact[] = [];
  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf8").catch(() => null);
    if (!raw) {
      continue;
    }
    const record = parseReflectionRecord(raw, filePath);
    if (!record) {
      continue;
    }
    if (surfaceFilter && !surfaceFilter.has(record.surface)) {
      continue;
    }
    const createdAtMs = Date.parse(record.createdAt);
    if (!Number.isFinite(createdAtMs) || nowMs - createdAtMs > windowMs) {
      continue;
    }
    artifacts.push({ path: filePath, record });
  }
  return artifacts
    .toSorted((a, b) => {
      const bMs = Date.parse(b.record.createdAt);
      const aMs = Date.parse(a.record.createdAt);
      if (bMs !== aMs) {
        return bMs - aMs;
      }
      return a.record.id.localeCompare(b.record.id);
    })
    .slice(0, limit);
}
