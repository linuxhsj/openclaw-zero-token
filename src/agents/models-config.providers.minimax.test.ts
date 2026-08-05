import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveImplicitProvidersForTest } from "./models-config.e2e-harness.js";

describe("minimax provider catalog", () => {
  it("does not advertise the removed lightning model for api-key or oauth providers", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    await writeFile(
      join(agentDir, "auth-profiles.json"),
      JSON.stringify(
        {
          version: 1,
          profiles: {
            "minimax:default": {
              type: "api_key",
              provider: "minimax",
              key: "sk-minimax-test", // pragma: allowlist secret
            },
            "minimax-portal:default": {
              type: "oauth",
              provider: "minimax-portal",
              access: "access-token",
              refresh: "refresh-token",
              expires: Date.now() + 60_000,
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const providers = await resolveImplicitProvidersForTest({ agentDir });
    expect(providers?.minimax?.models?.map((model) => model.id)).toEqual([
      "MiniMax-M3",
      "MiniMax-M2.7",
    ]);
    expect(providers?.["minimax-portal"]?.models?.map((model) => model.id)).toEqual([
      "MiniMax-M3",
      "MiniMax-M2.7",
    ]);
    expect(providers?.minimax?.models?.[0]).toMatchObject({
      id: "MiniMax-M3",
      input: ["text", "image"],
      contextWindow: 1_000_000,
      cost: { input: 0.6, output: 2.4, cacheRead: 0.12, cacheWrite: 0 },
    });
    expect(providers?.minimax?.models?.[1]).toMatchObject({
      id: "MiniMax-M2.7",
      input: ["text"],
      contextWindow: 204_800,
      cost: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.375 },
    });
  });
});
