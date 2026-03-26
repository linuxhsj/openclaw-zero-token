import { describe, expect, it, vi } from "vitest";

const execFileUtf8Mock = vi.hoisted(() => vi.fn());

vi.mock("../../daemon/exec-file.js", () => ({
  execFileUtf8: execFileUtf8Mock,
}));

import {
  buildRecommendationText,
  fetchStartupContextRecommendations,
} from "./commands-context-recommend.js";

describe("fetchStartupContextRecommendations", () => {
  it("calls the shared recommend script and parses the stable JSON payload", async () => {
    execFileUtf8Mock.mockResolvedValueOnce({
      code: 0,
      stdout: JSON.stringify({
        corpus: "openclaw-internal-knowledge",
        task: "debug cron routing",
        generatedAt: "2026-03-18T10:00:00Z",
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
    });

    expect(execFileUtf8Mock).toHaveBeenCalledWith("/tmp/recommend-startup-context", [
      "--task",
      "debug cron routing",
      "--limit-files",
      "2",
      "--sections-per-file",
      "1",
    ], {
      timeout: 8000,
    });
    expect(payload.recommendedFiles[0]?.path).toBe("/tmp/cron-runbook.md");
  });

  it("fails clearly when the script returns invalid JSON", async () => {
    execFileUtf8Mock.mockResolvedValueOnce({
      code: 0,
      stdout: "not-json",
      stderr: "",
    });

    await expect(fetchStartupContextRecommendations("debug cron routing")).rejects.toThrow(
      "invalid JSON",
    );
  });
});

describe("buildRecommendationText", () => {
  it("formats a compact operator-facing recommendation summary", () => {
    const text = buildRecommendationText({
      corpus: "openclaw-internal-knowledge",
      task: "debug cron routing",
      generatedAt: "2026-03-18T10:00:00Z",
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
    });

    expect(text).toContain("🧭 Context recommendations");
    expect(text).toContain("/tmp/cron-runbook.md");
    expect(text).toContain("Cron > Router");
    expect(text).toContain("Investigate the router script first.");
  });
});
