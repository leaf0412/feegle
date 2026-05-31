import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/infra/app/runtime-db.js";
import { ControlActionStore } from "../../src/core/control/control-action-store.js";

describe("ControlActionStore", () => {
  let tempDir: string;
  let db: RuntimeDb;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-control-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("records platform-neutral intervention actions", () => {
    const store = new ControlActionStore(db);
    const action = store.create({
      id: "ctrl_1",
      workspaceId: "ws_1",
      actorUserId: "user_1",
      actionType: "approve_step",
      payload: { stepStateId: "step_1" },
      now: "2026-05-30T00:00:00.000Z"
    });

    expect(action.actionType).toBe("approve_step");
    expect(action.status).toBe("pending");
  });

  it("retrieves an action by id", () => {
    const store = new ControlActionStore(db);
    store.create({
      id: "ctrl_1",
      workspaceId: "ws_1",
      actorUserId: "user_1",
      actionType: "approve_step",
      payload: { stepStateId: "step_1" },
      now: "2026-05-30T00:00:00.000Z"
    });

    const action = store.getById("ctrl_1");
    expect(action).toBeDefined();
    expect(action?.actionType).toBe("approve_step");
    expect(action?.errorMessage).toBeNull();
  });

  it("updates action status to completed", () => {
    const store = new ControlActionStore(db);
    store.create({
      id: "ctrl_1",
      workspaceId: "ws_1",
      actorUserId: "user_1",
      actionType: "approve_step",
      payload: { stepStateId: "step_1" },
      now: "2026-05-30T00:00:00.000Z"
    });

    store.updateStatus({
      id: "ctrl_1",
      status: "completed",
      errorMessage: null,
      now: "2026-05-30T00:01:00.000Z"
    });

    const action = store.getById("ctrl_1");
    expect(action?.status).toBe("completed");
  });

  it("updates action status to failed with error message", () => {
    const store = new ControlActionStore(db);
    store.create({
      id: "ctrl_1",
      workspaceId: "ws_1",
      actorUserId: "user_1",
      actionType: "approve_step",
      payload: { stepStateId: "step_1" },
      now: "2026-05-30T00:00:00.000Z"
    });

    store.updateStatus({
      id: "ctrl_1",
      status: "failed",
      errorMessage: "handler not wired",
      now: "2026-05-30T00:01:00.000Z"
    });

    const action = store.getById("ctrl_1");
    expect(action?.status).toBe("failed");
    expect(action?.errorMessage).toBe("handler not wired");
  });

  it("lists pending actions for a workspace", () => {
    const store = new ControlActionStore(db);
    store.create({
      id: "ctrl_1",
      workspaceId: "ws_1",
      actorUserId: null,
      actionType: "approve_step",
      payload: { stepStateId: "step_1" },
      now: "2026-05-30T00:00:00.000Z"
    });
    store.create({
      id: "ctrl_2",
      workspaceId: "ws_1",
      actorUserId: null,
      actionType: "cancel_workflow",
      payload: { workflowInstanceId: "wfi_1" },
      now: "2026-05-30T00:01:00.000Z"
    });
    store.updateStatus({ id: "ctrl_1", status: "completed", errorMessage: null, now: "2026-05-30T00:02:00.000Z" });

    const pending = store.listPending("ws_1");
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("ctrl_2");
  });
});
