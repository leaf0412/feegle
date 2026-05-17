import path from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceManager } from "../../src/workspace/workspace-manager.js";

describe("WorkspaceManager", () => {
  it("creates deterministic paths by chat, requirement, and repository", () => {
    const root = "/tmp/feegle-workspaces";
    const manager = new WorkspaceManager(root);

    expect(manager.requirementRoot("chat-1", "req-1")).toBe(path.join(root, "chat-1", "req-1"));
    expect(manager.repositoryWorkingCopy("chat-1", "req-1", "repo-1")).toBe(
      path.join(root, "chat-1", "req-1", "repos", "repo-1", "working-copy")
    );
    expect(manager.artifactPath("chat-1", "req-1", "prototype.zip")).toBe(
      path.join(root, "chat-1", "req-1", "artifacts", "prototype.zip")
    );
  });

  it("rejects path traversal in workspace path segments", () => {
    const manager = new WorkspaceManager("/tmp/feegle-workspaces");

    expect(() => manager.requirementRoot("../chat", "req-1")).toThrow(
      "Invalid workspace path segment for chatId: ../chat"
    );
    expect(() => manager.repositoryWorkingCopy("chat-1", "req-1", "repo/1")).toThrow(
      "Invalid workspace path segment for repositoryId: repo/1"
    );
    expect(() => manager.artifactPath("chat-1", "req-1", "../prototype.zip")).toThrow(
      "Invalid workspace path segment for fileName: ../prototype.zip"
    );
  });
});
