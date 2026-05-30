import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { ControlActionStore } from "../../src/control/control-action-store.js";
import {
  ControlActionProcessor,
  type ControlActionHandlers,
  type ControlEventSink
} from "../../src/control/control-action-processor.js";

describe("ControlActionProcessor", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: ControlActionStore;
  let emitted: Array<{ type: string }>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-action-processor-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    store = new ControlActionStore(db);
    emitted = [];
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createSink(): ControlEventSink {
    return {
      emit: (input) => {
        emitted.push({ type: input.type });
      }
    };
  }

  it("processes an approve_step action to completion", async () => {
    store.create({
      id: "ctrl_1",
      workspaceId: "ws_1",
      actorUserId: "user_1",
      actionType: "approve_step",
      payload: { stepStateId: "step_1", comment: "looks good" },
      now: "2026-05-31T00:00:00.000Z"
    });

    let approvedPayload: unknown;
    const handlers: ControlActionHandlers = {
      approveStep: {
        approveStep: async (p) => {
          approvedPayload = p;
          return { status: "completed" };
        }
      }
    };

    const processor = new ControlActionProcessor(store, handlers, createSink());
    const result = await processor.process("ctrl_1", "2026-05-31T00:01:00.000Z");

    expect(result.status).toBe("completed");
    expect(approvedPayload).toEqual({ stepStateId: "step_1", comment: "looks good" });

    const action = store.getById("ctrl_1");
    expect(action?.status).toBe("completed");

    expect(emitted.map((e) => e.type)).toContain("control_action.completed");
  });

  it("fails an action with invalid payload", async () => {
    store.create({
      id: "ctrl_1",
      workspaceId: "ws_1",
      actorUserId: null,
      actionType: "approve_step",
      payload: { wrongField: "bad" },
      now: "2026-05-31T00:00:00.000Z"
    });

    const processor = new ControlActionProcessor(store, {}, createSink());
    const result = await processor.process("ctrl_1", "2026-05-31T00:01:00.000Z");

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("CONTROL_ACTION_INVALID_PAYLOAD");

    const action = store.getById("ctrl_1");
    expect(action?.status).toBe("failed");
    expect(action?.errorMessage).toBeTruthy();
  });

  it("fails when handler is not wired", async () => {
    store.create({
      id: "ctrl_1",
      workspaceId: "ws_1",
      actorUserId: null,
      actionType: "approve_step",
      payload: { stepStateId: "step_1" },
      now: "2026-05-31T00:00:00.000Z"
    });

    const processor = new ControlActionProcessor(store, {}, createSink());
    const result = await processor.process("ctrl_1", "2026-05-31T00:01:00.000Z");

    expect(result.status).toBe("failed");

    const action = store.getById("ctrl_1");
    expect(action?.status).toBe("failed");
    expect(action?.errorMessage).toContain("not wired");
  });

  it("does not re-process an already completed action", async () => {
    store.create({
      id: "ctrl_1",
      workspaceId: "ws_1",
      actorUserId: null,
      actionType: "approve_step",
      payload: { stepStateId: "step_1" },
      now: "2026-05-31T00:00:00.000Z"
    });
    store.updateStatus({ id: "ctrl_1", status: "completed", errorMessage: null, now: "2026-05-31T00:01:00.000Z" });

    let callCount = 0;
    const handlers: ControlActionHandlers = {
      approveStep: {
        approveStep: async () => {
          callCount++;
          return { status: "completed" };
        }
      }
    };

    const processor = new ControlActionProcessor(store, handlers, createSink());
    const result = await processor.process("ctrl_1", "2026-05-31T00:02:00.000Z");

    expect(result.status).toBe("completed");
    expect(callCount).toBe(0);
  });

  it("returns not-found error for missing action", async () => {
    const processor = new ControlActionProcessor(store, {}, createSink());
    const result = await processor.process("nonexistent", "2026-05-31T00:00:00.000Z");

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("CONTROL_ACTION_NOT_FOUND");
  });

  it("processes all supported action types", async () => {
    const tracked: string[] = [];
    const handlers: ControlActionHandlers = {
      approveStep: { approveStep: async () => { tracked.push("approve_step"); return { status: "completed" }; } },
      rejectStep: { rejectStep: async () => { tracked.push("reject_step"); return { status: "completed" }; } },
      resumeWorkflow: { resumeWorkflow: async () => { tracked.push("resume_workflow"); return { status: "completed" }; } },
      cancelWorkflow: { cancelWorkflow: async () => { tracked.push("cancel_workflow"); return { status: "completed" }; } },
      triggerRecovery: { triggerRecovery: async () => { tracked.push("trigger_recovery"); return { status: "completed" }; } },
      confirmMemory: { confirmMemory: async () => { tracked.push("confirm_memory"); return { status: "completed" }; } },
      deleteMemory: { deleteMemory: async () => { tracked.push("delete_memory"); return { status: "completed" }; } }
    };

    const processor = new ControlActionProcessor(store, handlers, createSink());
    const now = "2026-05-31T00:00:00.000Z";

    const actions = [
      { id: "a1", actionType: "approve_step", payload: { stepStateId: "s1" } },
      { id: "a2", actionType: "reject_step", payload: { stepStateId: "s2", reason: "no" } },
      { id: "a3", actionType: "resume_workflow", payload: { workflowInstanceId: "wfi_1" } },
      { id: "a4", actionType: "cancel_workflow", payload: { workflowInstanceId: "wfi_2" } },
      { id: "a5", actionType: "trigger_recovery", payload: { workflowInstanceId: "wfi_3", runAttemptId: "run_1" } },
      { id: "a6", actionType: "confirm_memory", payload: { memoryId: "mem_1" } },
      { id: "a7", actionType: "delete_memory", payload: { memoryId: "mem_2" } }
    ];

    for (const a of actions) {
      store.create({
        id: a.id,
        workspaceId: "ws_1",
        actorUserId: null,
        actionType: a.actionType,
        payload: a.payload,
        now
      });
    }

    for (const a of actions) {
      const result = await processor.process(a.id, now);
      expect(result.status).toBe("completed");
    }

    expect(tracked).toEqual([
      "approve_step",
      "reject_step",
      "resume_workflow",
      "cancel_workflow",
      "trigger_recovery",
      "confirm_memory",
      "delete_memory"
    ]);
  });
});
