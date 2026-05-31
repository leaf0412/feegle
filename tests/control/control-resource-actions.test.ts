import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { ControlActionStore } from "@core/control/control-action-store.js";
import {
  ControlActionProcessor,
  type ControlActionHandlers,
  type ControlEventSink
} from "@core/control/control-action-processor.js";

describe("ControlResourceActions", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: ControlActionStore;
  let emitted: Array<{ type: string }>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-resource-actions-"));
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

  const now = "2026-05-31T00:00:00.000Z";

  describe("bind_workspace", () => {
    it("processes successfully", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "bind_workspace", payload: { workspaceId: "ws_2", conversationId: "conv_1" }, now });

      let called: unknown = null;
      const handlers: ControlActionHandlers = {
        bindWorkspace: { bindWorkspace: async (p) => { called = p; return { status: "completed" }; } }
      };

      const processor = new ControlActionProcessor(store, handlers, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("completed");
      expect(called).toEqual({ workspaceId: "ws_2", conversationId: "conv_1" });
      expect(store.getById("ctrl_1")?.status).toBe("completed");
    });

    it("fails with invalid payload", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "bind_workspace", payload: { workspaceId: "" }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe("CONTROL_ACTION_INVALID_PAYLOAD");
    });

    it("fails when handler not wired", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "bind_workspace", payload: { workspaceId: "ws_2", conversationId: "conv_1" }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(store.getById("ctrl_1")?.errorMessage).toContain("not wired");
    });
  });

  describe("register_provider", () => {
    it("processes successfully", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "register_provider", payload: { providerId: "prov_1", label: "my-agent", command: "node agent.mjs", kind: "acp" }, now });

      let called: unknown = null;
      const handlers: ControlActionHandlers = {
        registerProvider: { registerProvider: async (p) => { called = p; return { status: "completed" }; } }
      };

      const processor = new ControlActionProcessor(store, handlers, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("completed");
      expect(called).toEqual({ providerId: "prov_1", label: "my-agent", command: "node agent.mjs", kind: "acp" });
    });

    it("fails with invalid payload", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "register_provider", payload: { providerId: "" }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe("CONTROL_ACTION_INVALID_PAYLOAD");
    });

    it("fails when handler not wired", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "register_provider", payload: { providerId: "prov_1", label: "my-agent", command: "node agent.mjs" }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(store.getById("ctrl_1")?.errorMessage).toContain("not wired");
    });
  });

  describe("disable_provider", () => {
    it("processes successfully", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "disable_provider", payload: { providerId: "prov_1" }, now });

      let called: unknown = null;
      const handlers: ControlActionHandlers = {
        disableProvider: { disableProvider: async (p) => { called = p; return { status: "completed" }; } }
      };

      const processor = new ControlActionProcessor(store, handlers, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("completed");
      expect(called).toEqual({ providerId: "prov_1" });
    });

    it("fails with invalid payload", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "disable_provider", payload: { wrongField: 1 }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe("CONTROL_ACTION_INVALID_PAYLOAD");
    });

    it("fails when handler not wired", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "disable_provider", payload: { providerId: "prov_1" }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(store.getById("ctrl_1")?.errorMessage).toContain("not wired");
    });
  });

  describe("update_policy", () => {
    it("processes successfully", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "update_policy", payload: { workspaceId: "ws_1", policyId: "pol_1", rule: { maxRetries: 3, requireApproval: true } }, now });

      let called: unknown = null;
      const handlers: ControlActionHandlers = {
        updatePolicy: { updatePolicy: async (p) => { called = p; return { status: "completed" }; } }
      };

      const processor = new ControlActionProcessor(store, handlers, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("completed");
      expect(called).toEqual({ workspaceId: "ws_1", policyId: "pol_1", rule: { maxRetries: 3, requireApproval: true } });
    });

    it("fails with invalid payload", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "update_policy", payload: { workspaceId: "" }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe("CONTROL_ACTION_INVALID_PAYLOAD");
    });

    it("fails when handler not wired", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "update_policy", payload: { workspaceId: "ws_1", policyId: "pol_1", rule: {} }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(store.getById("ctrl_1")?.errorMessage).toContain("not wired");
    });
  });

  describe("pause_schedule", () => {
    it("processes successfully", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "pause_schedule", payload: { scheduleId: "sched_1" }, now });

      let called: unknown = null;
      const handlers: ControlActionHandlers = {
        pauseSchedule: { pauseSchedule: async (p) => { called = p; return { status: "completed" }; } }
      };

      const processor = new ControlActionProcessor(store, handlers, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("completed");
      expect(called).toEqual({ scheduleId: "sched_1" });
    });

    it("fails with invalid payload", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "pause_schedule", payload: { scheduleId: "" }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe("CONTROL_ACTION_INVALID_PAYLOAD");
    });

    it("fails when handler not wired", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "pause_schedule", payload: { scheduleId: "sched_1" }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(store.getById("ctrl_1")?.errorMessage).toContain("not wired");
    });
  });

  describe("resume_schedule", () => {
    it("processes successfully", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "resume_schedule", payload: { scheduleId: "sched_1" }, now });

      let called: unknown = null;
      const handlers: ControlActionHandlers = {
        resumeSchedule: { resumeSchedule: async (p) => { called = p; return { status: "completed" }; } }
      };

      const processor = new ControlActionProcessor(store, handlers, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("completed");
      expect(called).toEqual({ scheduleId: "sched_1" });
    });

    it("fails with invalid payload", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "resume_schedule", payload: { scheduleId: "" }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe("CONTROL_ACTION_INVALID_PAYLOAD");
    });

    it("fails when handler not wired", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "resume_schedule", payload: { scheduleId: "sched_1" }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(store.getById("ctrl_1")?.errorMessage).toContain("not wired");
    });
  });

  describe("revoke_memory", () => {
    it("processes successfully", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "revoke_memory", payload: { memoryId: "mem_1" }, now });

      let called: unknown = null;
      const handlers: ControlActionHandlers = {
        revokeMemory: { revokeMemory: async (p) => { called = p; return { status: "completed" }; } }
      };

      const processor = new ControlActionProcessor(store, handlers, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("completed");
      expect(called).toEqual({ memoryId: "mem_1" });
    });

    it("fails with invalid payload", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "revoke_memory", payload: { memoryId: "" }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe("CONTROL_ACTION_INVALID_PAYLOAD");
    });

    it("fails when handler not wired", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "revoke_memory", payload: { memoryId: "mem_1" }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(store.getById("ctrl_1")?.errorMessage).toContain("not wired");
    });
  });

  describe("approve_recovery", () => {
    it("processes successfully", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "approve_recovery", payload: { recoveryId: "rec_1" }, now });

      let called: unknown = null;
      const handlers: ControlActionHandlers = {
        approveRecovery: { approveRecovery: async (p) => { called = p; return { status: "completed" }; } }
      };

      const processor = new ControlActionProcessor(store, handlers, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("completed");
      expect(called).toEqual({ recoveryId: "rec_1" });
    });

    it("fails with invalid payload", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "approve_recovery", payload: { recoveryId: "" }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe("CONTROL_ACTION_INVALID_PAYLOAD");
    });

    it("fails when handler not wired", async () => {
      store.create({ id: "ctrl_1", workspaceId: "ws_1", actorUserId: null, actionType: "approve_recovery", payload: { recoveryId: "rec_1" }, now });
      const processor = new ControlActionProcessor(store, {}, createSink());
      const result = await processor.process("ctrl_1", now);
      expect(result.status).toBe("failed");
      expect(store.getById("ctrl_1")?.errorMessage).toContain("not wired");
    });
  });

  it("processes all new resource action types end to end", async () => {
    const tracked: string[] = [];
    const handlers: ControlActionHandlers = {
      bindWorkspace: { bindWorkspace: async () => { tracked.push("bind_workspace"); return { status: "completed" }; } },
      registerProvider: { registerProvider: async () => { tracked.push("register_provider"); return { status: "completed" }; } },
      disableProvider: { disableProvider: async () => { tracked.push("disable_provider"); return { status: "completed" }; } },
      updatePolicy: { updatePolicy: async () => { tracked.push("update_policy"); return { status: "completed" }; } },
      pauseSchedule: { pauseSchedule: async () => { tracked.push("pause_schedule"); return { status: "completed" }; } },
      resumeSchedule: { resumeSchedule: async () => { tracked.push("resume_schedule"); return { status: "completed" }; } },
      revokeMemory: { revokeMemory: async () => { tracked.push("revoke_memory"); return { status: "completed" }; } },
      approveRecovery: { approveRecovery: async () => { tracked.push("approve_recovery"); return { status: "completed" }; } }
    };

    const processor = new ControlActionProcessor(store, handlers, createSink());

    const actions = [
      { id: "a1", actionType: "bind_workspace", payload: { workspaceId: "ws_2", conversationId: "conv_1" } },
      { id: "a2", actionType: "register_provider", payload: { providerId: "prov_1", label: "my-agent", command: "node agent.mjs" } },
      { id: "a3", actionType: "disable_provider", payload: { providerId: "prov_2" } },
      { id: "a4", actionType: "update_policy", payload: { workspaceId: "ws_1", policyId: "pol_1", rule: { maxRetries: 3 } } },
      { id: "a5", actionType: "pause_schedule", payload: { scheduleId: "sched_1" } },
      { id: "a6", actionType: "resume_schedule", payload: { scheduleId: "sched_2" } },
      { id: "a7", actionType: "revoke_memory", payload: { memoryId: "mem_1" } },
      { id: "a8", actionType: "approve_recovery", payload: { recoveryId: "rec_1" } }
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
      "bind_workspace",
      "register_provider",
      "disable_provider",
      "update_policy",
      "pause_schedule",
      "resume_schedule",
      "revoke_memory",
      "approve_recovery"
    ]);
  });
});
