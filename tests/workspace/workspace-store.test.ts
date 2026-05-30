import { describe, expect, it } from "vitest";
import {
  workspaceRoles,
  type ConversationBindingRecord,
  type WorkspaceRecord
} from "../../src/workspace/workspace-models.js";

describe("workspace models", () => {
  it("defines workspace roles so permission code has a stable enum source", () => {
    expect(workspaceRoles).toEqual(["owner", "admin", "maintainer", "member", "viewer"]);
  });

  it("keeps conversation binding separate from workspace ownership", () => {
    const workspace: WorkspaceRecord = {
      id: "ws_1",
      name: "Personal",
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z"
    };
    const binding: ConversationBindingRecord = {
      conversationKey: "feishu:chat:oc_1",
      workspaceId: workspace.id,
      projectId: null,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt
    };

    expect(binding.workspaceId).toBe("ws_1");
    expect(binding.projectId).toBeNull();
  });
});
