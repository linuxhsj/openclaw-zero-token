import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  loadRecentRuntimeReflections,
  writeRuntimeReflection,
  type RuntimeReflectionRecord,
} from "./runtime-reflection.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-reflection-"));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("runtime reflections", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes a reflection artifact into the dated surface directory", async () => {
    await withTempDir(async (dir) => {
      vi.stubEnv("OPENCLAW_RUNTIME_REFLECTIONS_ROOT", dir);

      const written = await writeRuntimeReflection({
        surface: "cron",
        entityId: "daily-knowledge-archiver",
        sessionKey: "agent:ops:main",
        taskShape: "debug_runtime",
        claimedOutcome: "core_success",
        observedOutcome: "partial_delivery_failure",
        claimMismatch: true,
        sourceRefs: ["cron:Daily Knowledge Archiver", "runs/daily.jsonl"],
        benchmarkTags: ["cron-triage", "honest-outcome"],
        operatorActionable: "Check delivery target and rerun only after confirming announce path.",
        createdAt: "2026-03-24T10:00:00.000Z",
      });

      expect(written.record.id).toContain("cron-daily-knowledge-archiver");
      expect(written.path).toContain(path.join("2026-03-24", "cron"));

      const raw = JSON.parse(await fs.readFile(written.path, "utf8")) as RuntimeReflectionRecord;
      expect(raw.surface).toBe("cron");
      expect(raw.claimMismatch).toBe(true);
      expect(raw.benchmarkTags).toContain("cron-triage");
    });
  });

  it("loads recent reflections, filters by age, and sorts newest first", async () => {
    await withTempDir(async (dir) => {
      vi.stubEnv("OPENCLAW_RUNTIME_REFLECTIONS_ROOT", dir);
      const nowMs = Date.parse("2026-03-24T12:00:00.000Z");

      await writeRuntimeReflection({
        surface: "startup_advisory",
        entityId: "agent-main",
        sessionKey: "agent:main:main",
        taskShape: "skill_routing_policy",
        claimedOutcome: "fresh_ready",
        observedOutcome: "cached_advisory",
        sourceRefs: ["agent:main:main"],
        benchmarkTags: ["startup-advisory"],
        operatorActionable: "Wait for background refresh before trusting auto-attach.",
        createdAt: "2026-03-24T11:30:00.000Z",
      });
      await writeRuntimeReflection({
        surface: "timeline_intel",
        entityId: "home_timeline",
        claimedOutcome: "top_item_candidate",
        observedOutcome: "rejected_hype_noise",
        sourceRefs: ["x_timeline_20260324_113000.json"],
        benchmarkTags: ["001-timeline-intel"],
        operatorActionable: "Keep freshness-first lane and reject hype-only tweets.",
        createdAt: "2026-03-24T11:50:00.000Z",
      });
      await writeRuntimeReflection({
        surface: "memory_operator",
        entityId: "mem-legacy",
        claimedOutcome: "edited",
        observedOutcome: "edited",
        sourceRefs: ["op-old"],
        benchmarkTags: ["memory-operator"],
        operatorActionable: "Legacy sample.",
        createdAt: "2026-03-23T00:00:00.000Z",
      });

      const recent = await loadRecentRuntimeReflections({ nowMs, windowMs: 6 * 60 * 60_000 });
      expect(recent.map((entry) => entry.record.surface)).toEqual([
        "timeline_intel",
        "startup_advisory",
      ]);
      expect(recent[0]?.record.id).toContain("timeline-intel-home-timeline");
    });
  });
});
