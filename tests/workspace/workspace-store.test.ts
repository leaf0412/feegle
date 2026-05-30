import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import {
  workspaceRoles,
  type ConversationBindingRecord,
  type WorkspaceRecord
} from "../../src/workspace/workspace-models.js";
import { WorkspaceStore } from "../../src/workspace/workspace-store.js";

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

describe("WorkspaceStore", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: WorkspaceStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-workspace-store-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    store = new WorkspaceStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a workspace and owner membership in one durable boundary operation", () => {
    const result = store.createWorkspaceWithOwner({
      workspaceId: "ws_1",
      workspaceName: "Personal",
      userId: "user_1",
      displayName: "YB",
      now: "2026-05-30T00:00:00.000Z"
    });

    expect(result.workspace.id).toBe("ws_1");
    expect(result.membership.role).toBe("owner");
    expect(store.getMembership("ws_1", "user_1")?.role).toBe("owner");
  });

  it("binds a conversation to a workspace and optional project", () => {
    store.createWorkspaceWithOwner({
      workspaceId: "ws_1",
      workspaceName: "Personal",
      userId: "user_1",
      displayName: "YB",
      now: "2026-05-30T00:00:00.000Z"
    });
    store.createProject({
      projectId: "proj_1",
      workspaceId: "ws_1",
      name: "Feegle",
      now: "2026-05-30T00:01:00.000Z"
    });

    store.bindConversation({
      conversationKey: "feishu:chat:oc_1",
      workspaceId: "ws_1",
      projectId: "proj_1",
      now: "2026-05-30T00:02:00.000Z"
    });

    expect(store.getConversationBinding("feishu:chat:oc_1")).toMatchObject({
      workspaceId: "ws_1",
      projectId: "proj_1"
    });
  });
});
