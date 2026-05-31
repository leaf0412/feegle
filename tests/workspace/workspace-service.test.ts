import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/infra/app/runtime-db.js";
import { WorkspaceService } from "../../src/resources/workspace/workspace-service.js";
import { WorkspaceStore } from "../../src/resources/workspace/workspace-store.js";

describe("WorkspaceService", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let service: WorkspaceService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-workspace-service-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    service = new WorkspaceService(new WorkspaceStore(db));
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a personal workspace with the requesting user as owner", () => {
    const result = service.createPersonalWorkspace({
      workspaceId: "ws_1",
      workspaceName: "Personal",
      userId: "user_1",
      displayName: "YB",
      now: "2026-05-30T00:00:00.000Z"
    });

    expect(result.membership.role).toBe("owner");
  });

  it("binds a conversation only after the workspace exists", () => {
    service.createPersonalWorkspace({
      workspaceId: "ws_1",
      workspaceName: "Personal",
      userId: "user_1",
      displayName: "YB",
      now: "2026-05-30T00:00:00.000Z"
    });

    expect(() =>
      service.bindConversation({
        conversationKey: "feishu:chat:oc_1",
        workspaceId: "missing",
        projectId: null,
        now: "2026-05-30T00:01:00.000Z"
      })
    ).toThrow(/foreign key/i);
  });
});
