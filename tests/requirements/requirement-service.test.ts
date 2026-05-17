import path from "node:path";
import { describe, expect, it } from "vitest";
import { InMemoryRepositoryRegistry } from "../../src/repositories/repository-registry.js";
import { RequirementService } from "../../src/requirements/requirement-service.js";
import { WorkspaceManager } from "../../src/workspace/workspace-manager.js";

describe("RequirementService", () => {
  it("starts one active requirement per chat and selects multiple repositories", () => {
    const registry = new InMemoryRepositoryRegistry();
    const repoA = registry.add({
      name: "web",
      remoteUrl: "git@example.com:web.git",
      defaultBaseBranch: "main"
    });
    const repoB = registry.add({
      name: "api",
      remoteUrl: "git@example.com:api.git",
      defaultBaseBranch: "develop"
    });
    const root = "/tmp/feegle";
    const service = new RequirementService(registry, new WorkspaceManager(root));

    const requirement = service.startRequirement("chat-1", "Retry failed training task");
    const selected = service.selectRepositories(requirement.id, [repoA.id, repoB.id]);

    expect(selected.context.status).toBe("repo_selected");
    expect(selected.repositories).toHaveLength(2);
    expect(selected.repositories[0]).toMatchObject({
      requirementId: requirement.id,
      repositoryId: repoA.id,
      localPath: path.join(root, "chat-1", "req_1", "repos", "repo_1", "working-copy"),
      baseBranch: "main",
      branchStatus: "not_created",
      pushStatus: "not_ready"
    });
    expect(selected.repositories[1]).toMatchObject({
      requirementId: requirement.id,
      repositoryId: repoB.id,
      localPath: path.join(root, "chat-1", "req_1", "repos", "repo_2", "working-copy"),
      baseBranch: "develop",
      branchStatus: "not_created",
      pushStatus: "not_ready"
    });
  });

  it("rejects a second active requirement in the same chat", () => {
    const service = new RequirementService(
      new InMemoryRepositoryRegistry(),
      new WorkspaceManager("/tmp/feegle")
    );

    service.startRequirement("chat-1", "First");

    expect(() => service.startRequirement("chat-1", "Second")).toThrow(
      "Chat already has an active requirement: chat-1"
    );
  });

  it("allows different chats to each have one active requirement", () => {
    const service = new RequirementService(
      new InMemoryRepositoryRegistry(),
      new WorkspaceManager("/tmp/feegle")
    );

    const first = service.startRequirement("chat-1", "First");
    const second = service.startRequirement("chat-2", "Second");

    expect(first.chatId).toBe("chat-1");
    expect(second.chatId).toBe("chat-2");
  });

  it("does not let callers mutate active requirement state", () => {
    const service = new RequirementService(
      new InMemoryRepositoryRegistry(),
      new WorkspaceManager("/tmp/feegle")
    );

    const requirement = service.startRequirement("chat-1", "First");
    requirement.status = "closed";

    expect(() => service.startRequirement("chat-1", "Second")).toThrow(
      "Chat already has an active requirement: chat-1"
    );
  });

  it("rejects selecting repositories after repositories are already selected", () => {
    const registry = new InMemoryRepositoryRegistry();
    const repo = registry.add({
      name: "web",
      remoteUrl: "git@example.com:web.git",
      defaultBaseBranch: "main"
    });
    const service = new RequirementService(registry, new WorkspaceManager("/tmp/feegle"));
    const requirement = service.startRequirement("chat-1", "Retry failed training task");

    service.selectRepositories(requirement.id, [repo.id]);

    expect(() => service.selectRepositories(requirement.id, [repo.id])).toThrow(
      "Invalid requirement transition: repo_selected -> repo_selected"
    );
  });

  it("rejects duplicate repository selections for the same requirement", () => {
    const registry = new InMemoryRepositoryRegistry();
    const repo = registry.add({
      name: "web",
      remoteUrl: "git@example.com:web.git",
      defaultBaseBranch: "main"
    });
    const service = new RequirementService(registry, new WorkspaceManager("/tmp/feegle"));
    const requirement = service.startRequirement("chat-1", "Retry failed training task");

    expect(() => service.selectRepositories(requirement.id, [repo.id, repo.id])).toThrow(
      "Repository selected more than once: repo_1"
    );
  });
});
