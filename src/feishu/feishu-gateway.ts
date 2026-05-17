export type FeishuCommand =
  | { type: "repo_select"; repositoryIds: string[] }
  | { type: "push_repository"; requirementId: string; repositoryId: string }
  | { type: "unknown"; raw: string };

export function parseFeishuCommand(raw: string): FeishuCommand {
  const trimmed = raw.trim();
  const parts = trimmed.split(/\s+/);

  if (parts[0] === "/repo" && parts[1] === "select" && parts.length > 2) {
    return { type: "repo_select", repositoryIds: parts.slice(2) };
  }

  const cardParts = trimmed.split(":");
  if (cardParts[0] === "card" && cardParts[1] === "push" && cardParts.length === 4) {
    const [, , requirementId, repositoryId] = cardParts;
    if (requirementId && repositoryId) {
      return { type: "push_repository", requirementId, repositoryId };
    }
  }

  return { type: "unknown", raw };
}
