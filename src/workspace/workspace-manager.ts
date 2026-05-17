import path from "node:path";

export class WorkspaceManager {
  constructor(private readonly rootDirectory: string) {}

  requirementRoot(chatId: string, requirementId: string): string {
    return path.join(
      this.rootDirectory,
      safePathSegment(chatId, "chatId"),
      safePathSegment(requirementId, "requirementId")
    );
  }

  repositoryWorkingCopy(chatId: string, requirementId: string, repositoryId: string): string {
    return path.join(
      this.requirementRoot(chatId, requirementId),
      "repos",
      safePathSegment(repositoryId, "repositoryId"),
      "working-copy"
    );
  }

  artifactPath(chatId: string, requirementId: string, fileName: string): string {
    return path.join(
      this.requirementRoot(chatId, requirementId),
      "artifacts",
      safePathSegment(fileName, "fileName")
    );
  }
}

function safePathSegment(value: string, fieldName: string): string {
  if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\")) {
    throw new Error(`Invalid workspace path segment for ${fieldName}: ${value}`);
  }

  return value;
}
