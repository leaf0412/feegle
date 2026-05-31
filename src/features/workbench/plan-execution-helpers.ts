const MAX_SLUG_LEN = 40;

export function deriveSlug(title: string, planId: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized || !/[a-z]/.test(normalized)) {
    const tail = planId.slice(-6) || planId;
    return `plan_${tail}`;
  }

  return normalized.length > MAX_SLUG_LEN ? normalized.slice(0, MAX_SLUG_LEN).replace(/_+$/g, "") : normalized;
}

export function buildIterationPrompt(planContent: string, note: string | null): string {
  if (note === null) {
    return [
      "Implement this plan in the current working directory.",
      "Auto-commit per CLAUDE.md (one commit per small feature unit).",
      "Do not push to remote.",
      "",
      "Plan:",
      planContent
    ].join("\n");
  }

  return [
    "Continue work on this plan. The code in the working directory already contains earlier iterations.",
    "Apply the following adjustment based on what already exists.",
    "Auto-commit; do not push.",
    "",
    "Original plan:",
    planContent,
    "",
    "Adjustment request:",
    note
  ].join("\n");
}
