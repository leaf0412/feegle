import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { PermissionService } from "../../src/core/security/permission-service.js";
import { WorkspaceStore } from "../../src/resources/workspace/workspace-store.js";

describe("PermissionService", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: WorkspaceStore;
  let service: PermissionService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-permission-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    store = new WorkspaceStore(db);
    store.createWorkspaceWithOwner({
      workspaceId: "ws_1", workspaceName: "Test", userId: "user_1", displayName: "Admin", now: "2026-05-31T00:00:00.000Z"
    });
    service = new PermissionService(store);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("allows owner full access", () => {
    const check = service.checkMembership("ws_1", "user_1");
    expect(check.allowed).toBe(true);
    expect(check.role).toBe("owner");
    expect(service.canWrite(check.role)).toBe(true);
    expect(service.canApprove(check.role)).toBe(true);
    expect(service.canConfigure(check.role)).toBe(true);
  });

  it("denies non-members", () => {
    const check = service.checkMembership("ws_1", "unknown");
    expect(check.allowed).toBe(false);
    expect(check.role).toBeNull();
  });

  it("viewer cannot write or approve", () => {
    expect(service.canWrite("viewer")).toBe(false);
    expect(service.canApprove("viewer")).toBe(false);
  });
});
