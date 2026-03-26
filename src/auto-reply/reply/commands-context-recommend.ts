import {
  fetchStartupContextRecommendations,
  type StartupContextRecommendationPayload,
} from "../../agents/startup-advisory.js";
import type { ReplyPayload } from "../types.js";

export { fetchStartupContextRecommendations };

function formatScore(score: number): string {
  return Number.isInteger(score) ? score.toFixed(0) : score.toFixed(1);
}

export function buildRecommendationText(
  payload: StartupContextRecommendationPayload,
  options?: { note?: string },
): string {
  const lines = [
    "🧭 Context recommendations",
    `Task: ${payload.task}`,
    options?.note ?? "Use after the mandatory reads from AGENTS.md / CLAUDE.md.",
  ];

  if (!payload.recommendedFiles.length) {
    lines.push("", "No strong internal-knowledge matches found.");
    return lines.join("\n");
  }

  for (const file of payload.recommendedFiles) {
    lines.push("", `${file.rank}. ${file.path}`);
    lines.push(`   ${file.rationale}`);
    for (const section of file.sections) {
      lines.push(`   - ${section.section} (score ${formatScore(section.score)})`);
      if (section.excerpt) {
        lines.push(`     ${section.excerpt}`);
      }
    }
  }

  return lines.join("\n");
}

export async function buildContextRecommendReply(
  task: string,
  options?: {
    json?: boolean;
    note?: string;
  },
): Promise<ReplyPayload> {
  try {
    const payload = await fetchStartupContextRecommendations(task);
    if (options?.json) {
      return { text: JSON.stringify(payload, null, 2) };
    }
    return { text: buildRecommendationText(payload, { note: options?.note }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      text: [
        "Context recommendation failed.",
        message,
        "",
        "Tip: run /context detail for the current session or doctor the shared PageIndex layer.",
      ].join("\n"),
    };
  }
}
