import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { ControlActionStore } from "../../src/control/control-action-store.js";

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
});
