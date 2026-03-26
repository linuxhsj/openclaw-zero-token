import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileUtf8Mock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());
const mkdirMock = vi.hoisted(() => vi.fn());
const writeRuntimeReflectionMock = vi.hoisted(() => vi.fn());

vi.mock("../daemon/exec-file.js", () => ({
  execFileUtf8: execFileUtf8Mock,
}));

vi.mock("node:fs/promises", () => ({
  readFile: readFileMock,
  writeFile: writeFileMock,
  mkdir: mkdirMock,
}));

vi.mock("./runtime-reflection.js", () => ({
  writeRuntimeReflection: writeRuntimeReflectionMock,
}));

import {
  applyStartupAutoAttachPolicy,
  buildStartupContextAdvisory,
  classifyStartupTaskShape,
  fetchStartupContextRecommendations,
  resetStartupAdvisoryBackgroundRefreshesForTest,
  resolveStartupTaskText,
  resolveStartupRouteContract,
} from "./startup-advisory.js";

beforeEach(() => {
  execFileUtf8Mock.mockReset();
  readFileMock.mockReset();
  writeFileMock.mockReset();
  mkdirMock.mockReset();
  mkdirMock.mockResolvedValue(undefined);
  writeFileMock.mockResolvedValue(undefined);
  writeRuntimeReflectionMock.mockReset();
  writeRuntimeReflectionMock.mockResolvedValue({
    path: "/tmp/runtime-reflection.json",
    record: {
      version: 1,
      id: "runtime-reflection",
      surface: "startup_advisory",
      entityId: "test",
      claimedOutcome: "ok",
      observedOutcome: "ok",
      sourceRefs: [],
      benchmarkTags: [],
      operatorActionable: "test",
      createdAt: "2026-03-24T00:00:00.000Z",
    },
  });
  resetStartupAdvisoryBackgroundRefreshesForTest();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetStartupAdvisoryBackgroundRefreshesForTest();
});

describe("classifyStartupTaskShape", () => {
  it("upgrades failed direct source reads into source discovery", () => {
    expect(
      classifyStartupTaskShape(
        "read-github returned 404 for the guessed gstack repo, find the original GitHub link",
      ),
    ).toBe("source_discovery");
  });

  it("detects debug/runtime tasks", () => {
    expect(classifyStartupTaskShape("Debug the cron router after a failing run")).toBe(
      "debug_runtime",
    );
  });

  it("detects skill/routing/policy tasks", () => {
    expect(classifyStartupTaskShape("Review skill routing policy drift in bootstrap")).toBe(
      "skill_routing_policy",
    );
  });

  it("does not treat ordinary skill execution requests as policy work", () => {
    expect(classifyStartupTaskShape("Run the knowledge-archiver skill.")).toBe("general");
  });

  it("does not treat prompt file execution tasks as policy work", () => {
    expect(
      classifyStartupTaskShape(
        "Read /Users/lixun/.openclaw/workspace/overnight-mini-app-builder/DAILY_PROMPT.md and follow it exactly.",
      ),
    ).toBe("general");
  });

  it("does not treat skill script stdout wrappers as policy work", () => {
    expect(
      classifyStartupTaskShape(
        "运行这个本地脚本并原样返回它的 stdout： APEX_X_MODE=timeline_primary /opt/homebrew/bin/python3 /Users/lixun/.openclaw/skills/x-scavenger/scripts/run_miner.py",
      ),
    ).toBe("general");
  });

  it("detects research/long-doc tasks", () => {
    expect(classifyStartupTaskShape("Research this PDF and summarize the report")).toBe(
      "research_long_doc",
    );
  });

  it("prefers research classification over governance/policy keywords when both appear", () => {
    expect(
      classifyStartupTaskShape(
        "Research long documents about agent memory governance contracts and compare the reports",
      ),
    ).toBe("research_long_doc");
  });

  it("falls back to general for non-matching tasks", () => {
    expect(classifyStartupTaskShape("Say hi to the team")).toBe("general");
  });
});

describe("resolveStartupRouteContract", () => {
  it("upgrades source discovery tasks into an ll-first fallback workflow", () => {
    expect(resolveStartupRouteContract("source_discovery")).toEqual({
      routeMode: "workflow",
      skillHints: ["ll", "bb"],
      workflowHints: [
        'll 调研 "<goal>"',
        "ll 网页 <url>",
        "bb open <url> (only if low-level page inspection is still needed)",
      ],
      routeReason:
        "When a direct source read fails with 404 or an unresolved repo/link guess, escalate into source discovery: use ll first for read-only discovery and only drop to bb for low-level browser inspection.",
    });
  });

  it("keeps debug/runtime work on skill routing with debug playbook hints", () => {
    expect(resolveStartupRouteContract("debug_runtime")).toEqual({
      routeMode: "skill",
      skillHints: ["runtime-debug-playbook"],
      workflowHints: [],
      routeReason:
        "Debug/runtime tasks stay primarily skill-routed because diagnosis and sequencing are still judgment-heavy.",
    });
  });

  it("keeps skill/routing/policy work on skill routing with policy skill hints", () => {
    expect(resolveStartupRouteContract("skill_routing_policy")).toEqual({
      routeMode: "skill",
      skillHints: ["global-rules", "skill-health-check"],
      workflowHints: [],
      routeReason:
        "Routing and policy tasks should stay on model-routed skills unless they harden into a stable artifact workflow.",
    });
  });

  it("marks long-doc research as hybrid with an explicit retrieval command hint", () => {
    expect(resolveStartupRouteContract("research_long_doc")).toEqual({
      routeMode: "hybrid",
      skillHints: [],
      workflowHints: ["/context recommend <task>"],
      routeReason:
        "Long-doc research benefits from soft skill routing plus an explicit retrieval workflow for repeatable evidence gathering.",
    });
  });
});

describe("resolveStartupTaskText", () => {
  it("uses the entrypoint source hint when startup task text is provided", () => {
    expect(
      resolveStartupTaskText({
        startupTaskText: "Summarize the latest webhook payload",
        startupTaskTextSourceHint: "webhook",
        prompt: "ignored fallback prompt",
      }),
    ).toEqual({
      taskText: "Summarize the latest webhook payload",
      source: "webhook",
    });
  });

  it("prefers an explicit startup task hint over a rewritten fallback prompt", () => {
    expect(
      resolveStartupTaskText({
        startupTaskText: "Find the original GitHub repo after read-github returned 404.",
        prompt: "Continue where you left off. The previous model attempt failed or timed out.",
      }),
    ).toEqual({
      taskText: "Find the original GitHub repo after read-github returned 404.",
      source: "prompt",
    });
  });

  it("falls back to history when prompt text is empty", () => {
    expect(
      resolveStartupTaskText({
        prompt: "   ",
        historyMessages: [
          { role: "assistant", content: "done" },
          { role: "user", content: "Debug the runtime router from yesterday's incident." },
        ],
      }),
    ).toEqual({
      taskText: "Debug the runtime router from yesterday's incident.",
      source: "history",
    });
  });

  it("uses extra system prompt when prompt and history are empty", () => {
    expect(
      resolveStartupTaskText({
        prompt: "",
        extraSystemPrompt: "Review the routing contract drift in bootstrap.",
      }),
    ).toEqual({
      taskText: "Review the routing contract drift in bootstrap.",
      source: "extra_system_prompt",
    });
  });
});

describe("fetchStartupContextRecommendations", () => {
  it("retries python shebang scripts with an explicit interpreter when the direct exec fails", async () => {
    readFileMock.mockResolvedValueOnce("#!/usr/bin/env python3\nprint('ok')\n");
    execFileUtf8Mock
      .mockResolvedValueOnce({
        code: 1,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({
          corpus: "openclaw-internal-knowledge",
          task: "debug cron routing",
          generatedAt: "2026-03-19T10:00:00Z",
          indexVersion: "test-version",
          recommendedFiles: [],
        }),
        stderr: "",
      });

    const payload = await fetchStartupContextRecommendations("debug cron routing", {
      binPath: "/tmp/recommend-startup-context",
      timeoutMs: 1234,
    });

    expect(execFileUtf8Mock).toHaveBeenNthCalledWith(
      1,
      "/tmp/recommend-startup-context",
      ["--task", "debug cron routing", "--limit-files", "3", "--sections-per-file", "2"],
      { timeout: 1234 },
    );
    expect(execFileUtf8Mock).toHaveBeenNthCalledWith(
      2,
      "/opt/homebrew/bin/python3",
      [
        "/tmp/recommend-startup-context",
        "--task",
        "debug cron routing",
        "--limit-files",
        "3",
        "--sections-per-file",
        "2",
      ],
      { timeout: 1234 },
    );
    expect(payload.indexVersion).toBe("test-version");
  });

  it("calls the shared recommend script with a timeout and parses the payload", async () => {
    execFileUtf8Mock.mockResolvedValueOnce({
      code: 0,
      stdout: JSON.stringify({
        corpus: "openclaw-internal-knowledge",
        task: "debug cron routing",
        generatedAt: "2026-03-19T10:00:00Z",
        indexVersion: "test-version",
        recommendedFiles: [
          {
            rank: 1,
            path: "/tmp/cron-runbook.md",
            sourceType: "runbook",
            title: "Cron Runbook",
            rationale: "Top runbook match after mandatory reads.",
            sections: [
              {
                section: "Cron > Router",
                excerpt: "Investigate the router script first.",
                score: 12.5,
              },
            ],
          },
        ],
      }),
      stderr: "",
    });

    const payload = await fetchStartupContextRecommendations("debug cron routing", {
      binPath: "/tmp/recommend-startup-context",
      limitFiles: 2,
      sectionsPerFile: 1,
      timeoutMs: 1234,
    });

    expect(execFileUtf8Mock).toHaveBeenCalledWith(
      "/tmp/recommend-startup-context",
      ["--task", "debug cron routing", "--limit-files", "2", "--sections-per-file", "1"],
      { timeout: 1234 },
    );
    expect(payload.recommendedFiles[0]?.path).toBe("/tmp/cron-runbook.md");
  });
});

describe("buildStartupContextAdvisory", () => {
  it("returns a not_applicable stub when no task text is available", async () => {
    await expect(buildStartupContextAdvisory(undefined)).resolves.toEqual({
      mode: "advisory",
      source: "pageindex-startup-context",
      status: "not_applicable",
      taskShape: "general",
      routeMode: "skill",
      skillHints: [],
      workflowHints: [],
      routeReason:
        "General startup keeps the default skill-routed path unless a repeatable operator workflow clearly fits better.",
      note: "No task text available for this session.",
      recommendationCount: 0,
      recommendedFiles: [],
    });
    expect(writeRuntimeReflectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "startup_advisory",
        claimedOutcome: "startup_advisory_requested",
        observedOutcome: "task_text_missing",
      }),
    );
  });
});

describe("buildStartupContextAdvisory", () => {
  it("writes a cache artifact after the first successful advisory", async () => {
    vi.stubEnv("OPENCLAW_STATE_DIR", "/tmp/openclaw-state");
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));
    execFileUtf8Mock.mockResolvedValueOnce({
      code: 0,
      stdout: JSON.stringify({
        corpus: "openclaw-internal-knowledge",
        task: "Debug the cron router",
        generatedAt: "2026-03-20T10:00:00Z",
        indexVersion: "fresh-version",
        recommendedFiles: [
          {
            rank: 1,
            path: "/tmp/docs/runbooks/cron-runbook.md",
            sourceType: "docs",
            title: "Cron Runbook",
            rationale: "Top docs match.",
            sections: [
              {
                section: "Cron Runbook",
                excerpt: "Start with the runbook.",
                score: 25,
              },
            ],
          },
        ],
      }),
      stderr: "",
    });

    const advisory = await buildStartupContextAdvisory("Debug the cron router");

    expect(advisory?.source).toBe("pageindex-startup-context");
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock.mock.calls[0]?.[0]).toBe(
      "/tmp/openclaw-state/memory/last_advisory_cache.json",
    );
    const persisted = JSON.parse(String(writeFileMock.mock.calls[0]?.[1] ?? "{}"));
    expect(persisted.advisory?.source).toBe("pageindex-startup-context");
    expect(persisted.advisory?.taskShape).toBe("debug_runtime");
  });

  it("returns a cached advisory immediately and refreshes it in the background", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("OPENCLAW_STATE_DIR", "/tmp/openclaw-state");
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        version: 1,
        cachedAt: "2026-03-20T10:00:00Z",
        taskShape: "debug_runtime",
        taskPreview: "Debug the cron router",
        advisory: {
          mode: "advisory",
          source: "pageindex-startup-context",
          status: "ready",
          taskShape: "debug_runtime",
          routeMode: "skill",
          skillHints: ["runtime-debug-playbook"],
          workflowHints: [],
          routeReason:
            "Debug/runtime tasks stay primarily skill-routed because diagnosis and sequencing are still judgment-heavy.",
          note: "Advisory only. Review these after mandatory reads; nothing was auto-injected into the prompt.",
          recommendationCount: 1,
          generatedAt: "2026-03-20T10:00:00Z",
          indexVersion: "cached-version",
          recommendedFiles: [
            {
              rank: 1,
              path: "/tmp/docs/runbooks/cron-runbook.md",
              sourceType: "docs",
              title: "Cron Runbook",
              rationale: "Top docs match.",
              sections: [
                {
                  section: "Cron Runbook",
                  excerpt: "Start with the runbook.",
                  score: 25,
                },
              ],
            },
          ],
          autoAttachStatus: "not_eligible",
          autoAttachNote: "Advisory generated, but auto-attach policy has not been evaluated yet.",
          autoAttachedFiles: [],
        },
      }),
    );
    execFileUtf8Mock.mockResolvedValueOnce({
      code: 0,
      stdout: JSON.stringify({
        corpus: "openclaw-internal-knowledge",
        task: "Debug the cron router",
        generatedAt: "2026-03-20T11:00:00Z",
        indexVersion: "fresh-version",
        recommendedFiles: [
          {
            rank: 1,
            path: "/tmp/docs/runbooks/cron-runbook-v2.md",
            sourceType: "docs",
            title: "Cron Runbook v2",
            rationale: "New top docs match.",
            sections: [
              {
                section: "Cron Runbook v2",
                excerpt: "Use the refreshed runbook.",
                score: 26,
              },
            ],
          },
        ],
      }),
      stderr: "",
    });

    const advisory = await buildStartupContextAdvisory("Debug the cron router");

    expect(advisory?.source).toBe("cached");
    expect(advisory?.note).toBe("Using cached advisory, refreshing in background.");
    expect(advisory?.autoAttachStatus).toBe("not_eligible");
    expect(writeRuntimeReflectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "startup_advisory",
        claimedOutcome: "fresh_advisory",
        observedOutcome: "cached_advisory",
      }),
    );
    await vi.waitFor(() => expect(writeFileMock).toHaveBeenCalledTimes(1));
    expect(logSpy).toHaveBeenCalledWith("[startup-advisory] 后台刷新缓存完成");
    const persisted = JSON.parse(String(writeFileMock.mock.calls[0]?.[1] ?? "{}"));
    expect(persisted.advisory?.indexVersion).toBe("fresh-version");
    logSpy.mockRestore();
  });

  it("returns a first-run indexing note after the uncached fetch times out and refreshes the cache later", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("OPENCLAW_STATE_DIR", "/tmp/openclaw-state");
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));
    readFileMock.mockRejectedValueOnce(new Error("not a python script"));
    execFileUtf8Mock
      .mockResolvedValueOnce({
        code: 1,
        stdout: "",
        stderr: "Command timed out after 15000ms",
      })
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({
          corpus: "openclaw-internal-knowledge",
          task: "Debug the cron router",
          generatedAt: "2026-03-20T11:00:00Z",
          indexVersion: "refreshed-version",
          recommendedFiles: [],
        }),
        stderr: "",
      });

    const advisory = await buildStartupContextAdvisory("Debug the cron router");

    expect(advisory?.status).toBe("unavailable");
    expect(advisory?.note).toBe("首次启动索引中，下次将秒级生效");
    expect(execFileUtf8Mock).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.any(Array),
      { timeout: 15_000 },
    );
    await vi.waitFor(() =>
      expect(execFileUtf8Mock).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.any(Array),
        { timeout: 30_000 },
      ),
    );
    await vi.waitFor(() => expect(writeFileMock).toHaveBeenCalledTimes(1));
    expect(logSpy).toHaveBeenCalledWith("[startup-advisory] 后台刷新缓存完成");
    logSpy.mockRestore();
  });

  it("logs a warning when the background refresh fails and keeps the previous cache", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("OPENCLAW_STATE_DIR", "/tmp/openclaw-state");
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        version: 1,
        cachedAt: "2026-03-20T10:00:00Z",
        taskShape: "debug_runtime",
        advisory: {
          mode: "advisory",
          source: "pageindex-startup-context",
          status: "ready",
          taskShape: "debug_runtime",
          routeMode: "skill",
          skillHints: ["runtime-debug-playbook"],
          workflowHints: [],
          routeReason:
            "Debug/runtime tasks stay primarily skill-routed because diagnosis and sequencing are still judgment-heavy.",
          note: "Advisory only.",
          recommendationCount: 0,
          recommendedFiles: [],
          autoAttachStatus: "not_eligible",
          autoAttachNote: "Advisory generated, but auto-attach policy has not been evaluated yet.",
          autoAttachedFiles: [],
        },
      }),
    );
    execFileUtf8Mock.mockResolvedValueOnce({
      code: 1,
      stdout: "",
      stderr: "boom",
    });

    const advisory = await buildStartupContextAdvisory("Debug the cron router");

    expect(advisory?.source).toBe("cached");
    await vi.waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith(
        "[startup-advisory] 后台刷新失败，保留旧缓存:",
        expect.any(Error),
      ),
    );
    expect(writeFileMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns not_applicable for general tasks", async () => {
    const advisory = await buildStartupContextAdvisory("Say hi to the team");

    expect(advisory?.status).toBe("not_applicable");
    expect(advisory?.taskShape).toBe("general");
    expect(advisory?.routeMode).toBe("skill");
    expect(advisory?.recommendationCount).toBe(0);
  });

  it("short-circuits source discovery tasks to not_applicable without calling PageIndex", async () => {
    execFileUtf8Mock.mockClear();
    const advisory = await buildStartupContextAdvisory(
      "read-github returned 404 for the guessed repo slug, find the authoritative source link",
    );

    expect(execFileUtf8Mock).not.toHaveBeenCalled();
    expect(advisory?.status).toBe("not_applicable");
    expect(advisory?.taskShape).toBe("source_discovery");
    expect(advisory?.routeMode).toBe("workflow");
    expect(advisory?.skillHints).toEqual(["ll", "bb"]);
    expect(advisory?.recommendationCount).toBe(0);
    expect(advisory?.autoAttachStatus).toBe("not_eligible");
    expect(advisory?.autoAttachNote).toBe(
      "Auto-attach does not run for source discovery. Keep source lookup lightweight and operator-visible.",
    );
    expect(writeRuntimeReflectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "startup_advisory",
        claimedOutcome: "startup_advisory_requested",
        observedOutcome: "classifier_short_circuit_source_discovery",
      }),
    );
  });

  it("degrades to unavailable when recommendation fails", async () => {
    execFileUtf8Mock.mockResolvedValueOnce({
      code: 1,
      stdout: "",
      stderr: "boom",
    });

    const advisory = await buildStartupContextAdvisory("Debug the cron router");

    expect(advisory?.status).toBe("unavailable");
    expect(advisory?.taskShape).toBe("debug_runtime");
    expect(advisory?.routeMode).toBe("skill");
    expect(advisory?.skillHints).toEqual(["runtime-debug-playbook"]);
    expect(advisory?.autoAttachNote).toBe(
      "Auto-attach did not run because startup advisory was unavailable.",
    );
    expect(advisory?.error).toContain("boom");
    expect(writeRuntimeReflectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "startup_advisory",
        claimedOutcome: "fresh_advisory",
        observedOutcome: "advisory_unavailable",
      }),
    );
  });

  it("preserves unavailable auto-attach note through the auto-attach policy stage", async () => {
    const result = await applyStartupAutoAttachPolicy({
      advisory: {
        mode: "advisory",
        source: "pageindex-startup-context",
        status: "unavailable",
        taskShape: "debug_runtime",
        routeMode: "skill",
        skillHints: ["runtime-debug-playbook"],
        workflowHints: [],
        routeReason:
          "Debug/runtime tasks stay primarily skill-routed because diagnosis and sequencing are still judgment-heavy.",
        note: "Startup advisory was attempted but unavailable. Bootstrap stayed unchanged.",
        recommendationCount: 0,
        recommendedFiles: [],
        autoAttachStatus: "not_eligible",
        autoAttachNote: "Auto-attach did not run because startup advisory was unavailable.",
        autoAttachedFiles: [],
        error: "boom",
      },
      bootstrapFiles: [],
      contextFiles: [],
      bootstrapMaxChars: 20_000,
      bootstrapTotalMaxChars: 150_000,
    });

    expect(result.advisory?.autoAttachStatus).toBe("not_eligible");
    expect(result.advisory?.autoAttachNote).toBe(
      "Auto-attach did not run because startup advisory was unavailable.",
    );
  });
});

describe("applyStartupAutoAttachPolicy", () => {
  it("attaches one eligible debug/runtime file into prompt context", async () => {
    readFileMock.mockResolvedValueOnce("# Cron Runbook\n\nUse the artifact-first rule.");

    const result = await applyStartupAutoAttachPolicy({
      advisory: {
        mode: "advisory",
        source: "pageindex-startup-context",
        status: "ready",
        taskShape: "debug_runtime",
        routeMode: "skill",
        skillHints: ["runtime-debug-playbook"],
        workflowHints: [],
        routeReason:
          "Debug/runtime tasks stay primarily skill-routed because diagnosis and sequencing are still judgment-heavy.",
        note: "Advisory only.",
        recommendationCount: 1,
        recommendedFiles: [
          {
            rank: 1,
            path: "/tmp/docs/runbooks/cron-runbook.md",
            sourceType: "docs",
            title: "Cron Runbook",
            rationale: "Top docs match.",
            sections: [
              {
                section: "Cron Runbook",
                excerpt: "# Cron Runbook",
                score: 22,
              },
            ],
          },
        ],
      },
      bootstrapFiles: [],
      contextFiles: [],
      bootstrapMaxChars: 20_000,
      bootstrapTotalMaxChars: 150_000,
    });

    expect(result.advisory?.autoAttachStatus).toBe("applied");
    expect(result.advisory?.autoAttachedFiles).toEqual(["/tmp/docs/runbooks/cron-runbook.md"]);
    expect(result.contextFiles.some((file) => file.path === "/tmp/docs/runbooks/cron-runbook.md")).toBe(
      true,
    );
  });

  it("skips when the best recommendation does not meet the attach policy", async () => {
    const result = await applyStartupAutoAttachPolicy({
      advisory: {
        mode: "advisory",
        source: "pageindex-startup-context",
        status: "ready",
        taskShape: "debug_runtime",
        routeMode: "skill",
        skillHints: ["runtime-debug-playbook"],
        workflowHints: [],
        routeReason:
          "Debug/runtime tasks stay primarily skill-routed because diagnosis and sequencing are still judgment-heavy.",
        note: "Advisory only.",
        recommendationCount: 1,
        recommendedFiles: [
          {
            rank: 1,
            path: "/tmp/docs/context/skill-routing-notes.md",
            sourceType: "docs",
            title: "Skill Routing Notes",
            rationale: "Top docs match.",
            sections: [
              {
                section: "Skill Routing Notes",
                excerpt: "Debug notes",
                score: 12,
              },
            ],
          },
        ],
      },
      bootstrapFiles: [],
      contextFiles: [],
      bootstrapMaxChars: 20_000,
      bootstrapTotalMaxChars: 150_000,
    });

    expect(result.advisory?.autoAttachStatus).toBe("skipped");
    expect(result.contextFiles).toHaveLength(0);
  });

  it("keeps source discovery advisory visible instead of auto-attaching", async () => {
    const result = await applyStartupAutoAttachPolicy({
      advisory: {
        mode: "advisory",
        source: "pageindex-startup-context",
        status: "ready",
        taskShape: "source_discovery",
        routeMode: "workflow",
        skillHints: ["ll", "bb"],
        workflowHints: ['ll 调研 "<goal>"', "ll 网页 <url>"],
        routeReason:
          "When a direct source read fails with 404 or an unresolved repo/link guess, escalate into source discovery: use ll first for read-only discovery and only drop to bb for low-level browser inspection.",
        note: "Advisory only.",
        recommendationCount: 1,
        recommendedFiles: [
          {
            rank: 1,
            path: "/tmp/docs/context/skill-routing-escalation.md",
            sourceType: "docs",
            title: "Skill Routing Escalation",
            rationale: "Route the operator toward source discovery.",
            sections: [
              {
                section: "Failure upgrade",
                excerpt: "Escalate source read failures into discovery.",
                score: 24,
              },
            ],
          },
        ],
      },
      bootstrapFiles: [],
      contextFiles: [],
      bootstrapMaxChars: 20_000,
      bootstrapTotalMaxChars: 150_000,
    });

    expect(result.advisory?.autoAttachStatus).toBe("not_eligible");
    expect(result.advisory?.autoAttachNote).toBe(
      "Auto-attach v1 does not run for source discovery; keep the fallback lightweight and operator-visible.",
    );
    expect(result.contextFiles).toHaveLength(0);
  });

  it("does not auto-attach cached startup advisories", async () => {
    const result = await applyStartupAutoAttachPolicy({
      advisory: {
        mode: "advisory",
        source: "cached",
        status: "ready",
        taskShape: "debug_runtime",
        routeMode: "skill",
        skillHints: ["runtime-debug-playbook"],
        workflowHints: [],
        routeReason:
          "Debug/runtime tasks stay primarily skill-routed because diagnosis and sequencing are still judgment-heavy.",
        note: "Using cached advisory, refreshing in background.",
        recommendationCount: 1,
        recommendedFiles: [
          {
            rank: 1,
            path: "/tmp/docs/runbooks/cron-runbook.md",
            sourceType: "docs",
            title: "Cron Runbook",
            rationale: "Top docs match.",
            sections: [
              {
                section: "Cron Runbook",
                excerpt: "Use the artifact-first rule.",
                score: 22,
              },
            ],
          },
        ],
        autoAttachStatus: "not_eligible",
        autoAttachNote: "Using cached advisory, refreshing in background.",
        autoAttachedFiles: [],
      },
      bootstrapFiles: [],
      contextFiles: [],
      bootstrapMaxChars: 20_000,
      bootstrapTotalMaxChars: 150_000,
    });

    expect(result.advisory?.autoAttachStatus).toBe("not_eligible");
    expect(result.advisory?.autoAttachNote).toBe(
      "Auto-attach is skipped for cached startup advisory; wait for a fresh refresh before attaching files.",
    );
    expect(result.contextFiles).toHaveLength(0);
  });

  it("attaches one eligible policy/context file with the stricter policy path", async () => {
    readFileMock.mockResolvedValueOnce("# Routing Escalation\n\nRead the policy contract first.");

    const result = await applyStartupAutoAttachPolicy({
      advisory: {
        mode: "advisory",
        source: "pageindex-startup-context",
        status: "ready",
        taskShape: "skill_routing_policy",
        routeMode: "skill",
        skillHints: ["global-rules", "skill-health-check"],
        workflowHints: [],
        routeReason:
          "Routing and policy tasks should stay on model-routed skills unless they harden into a stable artifact workflow.",
        note: "Advisory only.",
        recommendationCount: 1,
        recommendedFiles: [
          {
            rank: 1,
            path: "/tmp/docs/context/skill-routing-escalation.md",
            sourceType: "docs",
            title: "Skill Routing Escalation",
            rationale: "Top policy docs match.",
            sections: [
              {
                section: "Escalation",
                excerpt: "Read the policy contract first.",
                score: 24,
              },
            ],
          },
        ],
      },
      bootstrapFiles: [],
      contextFiles: [],
      bootstrapMaxChars: 20_000,
      bootstrapTotalMaxChars: 150_000,
    });

    expect(result.advisory?.autoAttachStatus).toBe("applied");
    expect(result.advisory?.autoAttachedFiles).toEqual([
      "/tmp/docs/context/skill-routing-escalation.md",
    ]);
  });
});
