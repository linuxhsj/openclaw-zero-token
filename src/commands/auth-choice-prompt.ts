import type { AuthProfileStore } from "../agents/auth-profiles.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { buildAuthChoiceGroups } from "./auth-choice-options.js";
import type { AuthChoice } from "./onboard-types.js";

const BACK_VALUE = "__back";

/**
 * Prompt for multiple auth choices (multi-select)
 */
export async function promptAuthChoicesMulti(params: {
  prompter: WizardPrompter;
  store: AuthProfileStore;
  includeSkip: boolean;
}): Promise<AuthChoice[]> {
  const { groups, skipOption } = buildAuthChoiceGroups(params);
  const availableGroups = groups.filter((group) => group.options.length > 0);

  if (availableGroups.length === 0) {
    return [];
  }

  // Flatten all options for multi-select
  const allOptions = availableGroups.flatMap((group) =>
    group.options.map((opt) => ({
      value: opt.value,
      label: `${group.label}: ${opt.label}`,
      hint: opt.hint,
    }))
  );

  const selection = await params.prompter.multiselect({
    message: "Select models/providers to authorize (multi-select)",
    options: allOptions,
    required: false,
  });

  return selection as AuthChoice[];
}

export async function promptAuthChoiceGrouped(params: {
  prompter: WizardPrompter;
  store: AuthProfileStore;
  includeSkip: boolean;
}): Promise<AuthChoice> {
  const { groups, skipOption } = buildAuthChoiceGroups(params);
  const availableGroups = groups.filter((group) => group.options.length > 0);

  while (true) {
    const providerOptions = [
      ...availableGroups.map((group) => ({
        value: group.value,
        label: group.label,
        hint: group.hint,
      })),
      ...(skipOption ? [skipOption] : []),
    ];

    const providerSelection = (await params.prompter.select({
      message: "Model/auth provider",
      options: providerOptions,
    })) as string;

    if (providerSelection === "skip") {
      return "skip";
    }

    const group = availableGroups.find((candidate) => candidate.value === providerSelection);

    if (!group || group.options.length === 0) {
      await params.prompter.note(
        "No auth methods available for that provider.",
        "Model/auth choice",
      );
      continue;
    }

    if (group.options.length === 1) {
      return group.options[0].value;
    }

    const methodSelection = await params.prompter.select({
      message: `${group.label} auth method`,
      options: [...group.options, { value: BACK_VALUE, label: "Back" }],
    });

    if (methodSelection === BACK_VALUE) {
      continue;
    }

    return methodSelection as AuthChoice;
  }
}
