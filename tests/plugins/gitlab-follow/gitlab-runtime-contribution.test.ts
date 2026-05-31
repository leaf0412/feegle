import { describe, expect, it, vi } from "vitest";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import { gitlabRuntimeContribution } from "@plugins/gitlab-follow/gitlab-runtime-contribution.js";
import { GitLabClient } from "@integrations/gitlab/gitlab-client.js";
import type { GitLabIssueUrl } from "@integrations/gitlab/gitlab-types.js";

function createMockClient(): GitLabClient {
  const client = new GitLabClient("mock-token", vi.fn() as unknown as typeof fetch);
  vi.spyOn(client, "postNote").mockResolvedValue(undefined);
  vi.spyOn(client, "updateIssueStatus").mockResolvedValue(undefined);
  return client;
}

const testGitlabUrl: GitLabIssueUrl = {
  host: "gitlab.example.com",
  namespace: "my-group",
  project: "my-project",
  issueIid: 123
};

describe("gitlab runtime contribution", () => {
  it("registers intent resolver, workflow, and effect handlers", () => {
    const mockClient = createMockClient();
    const workflows = new WorkflowRegistry();
    const intentResolvers = new IntentResolverRegistry();
    const selector = new WorkflowSelector();
    const effectHandlers = new EffectHandlerRegistry();

    const module = gitlabRuntimeContribution(() => mockClient);
    module.register({ workflows, intentResolvers, workflowSelector: selector, effectHandlers });

    // Workflow registered
    const def = workflows.require("gitlab.review.workflow");
    expect(def.definitionId).toBe("gitlab.review.workflow");

    // Effect handlers registered
    expect(effectHandlers.has("gitlab", "post_comment")).toBe(true);
    expect(effectHandlers.has("gitlab", "update_status")).toBe(true);
  });

  it("resolves workspace and project from enriched trigger context", async () => {
    const mockClient = createMockClient();
    const intentResolvers = new IntentResolverRegistry();
    gitlabRuntimeContribution(() => mockClient).register({
      workflows: new WorkflowRegistry(),
      intentResolvers,
      workflowSelector: new WorkflowSelector(),
      effectHandlers: new EffectHandlerRegistry()
    });

    const intent = await intentResolvers.resolve({
      triggerEventId: "trg_gitlab",
      source: { pluginId: "gitlab", adapterId: "webhook", triggerType: "issue" },
      receivedAt: "2026-05-31T00:00:00.000Z",
      external: { projectId: 42, resolvedWorkspaceId: "ws_test", resolvedProjectId: "project_test" },
      actorHint: { kind: "system" },
      payloadSummary: {}
    });

    expect(intent.workspaceId).toBe("ws_test");
    expect(intent.projectId).toBe("project_test");
  });

  it("post_comment effect calls client.postNote with correct args", async () => {
    const mockClient = createMockClient();
    const effectHandlers = new EffectHandlerRegistry();

    gitlabRuntimeContribution(() => mockClient).register({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers
    });

    const result = await effectHandlers.execute({
      effectId: "eff_post_1",
      pluginId: "gitlab",
      effectType: "post_comment",
      input: { ...testGitlabUrl, body: "Reviewed MR looks good!" }
    });

    expect(mockClient.postNote).toHaveBeenCalledWith(testGitlabUrl, "Reviewed MR looks good!");
    expect(result).toMatchObject({ posted: true, body: "Reviewed MR looks good!" });
  });

  it("update_status effect calls client.updateIssueStatus with correct args", async () => {
    const mockClient = createMockClient();
    const effectHandlers = new EffectHandlerRegistry();

    gitlabRuntimeContribution(() => mockClient).register({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers
    });

    const result = await effectHandlers.execute({
      effectId: "eff_status_1",
      pluginId: "gitlab",
      effectType: "update_status",
      input: { ...testGitlabUrl, status: "close" }
    });

    expect(mockClient.updateIssueStatus).toHaveBeenCalledWith(testGitlabUrl, "close");
    expect(result).toMatchObject({ updated: true, status: "close" });
  });

  it("post_comment effect throws for missing body", async () => {
    const mockClient = createMockClient();
    const effectHandlers = new EffectHandlerRegistry();

    gitlabRuntimeContribution(() => mockClient).register({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers
    });

    await expect(
      effectHandlers.execute({
        effectId: "eff_post_bad",
        pluginId: "gitlab",
        effectType: "post_comment",
        input: { host: "gitlab.example.com", namespace: "g", project: "p", issueIid: 1 }
      })
    ).rejects.toThrow("Missing required field: body");
  });

  it("post_comment effect throws for missing host/namespace/project", async () => {
    const mockClient = createMockClient();
    const effectHandlers = new EffectHandlerRegistry();

    gitlabRuntimeContribution(() => mockClient).register({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers
    });

    await expect(
      effectHandlers.execute({
        effectId: "eff_post_no_url",
        pluginId: "gitlab",
        effectType: "post_comment",
        input: { body: "hello" }
      })
    ).rejects.toThrow("Missing required gitlab fields");
  });

  it("update_status effect throws for missing status", async () => {
    const mockClient = createMockClient();
    const effectHandlers = new EffectHandlerRegistry();

    gitlabRuntimeContribution(() => mockClient).register({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers
    });

    await expect(
      effectHandlers.execute({
        effectId: "eff_status_bad",
        pluginId: "gitlab",
        effectType: "update_status",
        input: { host: "gitlab.example.com", namespace: "g", project: "p", issueIid: 1 }
      })
    ).rejects.toThrow("Missing required field: status");
  });
});
