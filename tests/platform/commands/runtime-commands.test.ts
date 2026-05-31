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
import { buildSlashCommandRegistry } from "@platform/build-slash-command-registry.js";
import { runtimeCommandModule } from "@platform/commands/runtime-command-module.js";
import type { SlashCommandContext } from "@platform/slash-command-handler.js";

function makeContext(args: string): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_test",
    messageId: "om_test",
    sender: { platform: "feishu", userId: "ou_test" },
    definition: { id: "", command: "", description: "", groupKey: "system", action: "" },
    raw: `/runtime ${args}`,
    args,
  };
}

function countActionsInDb(db: RuntimeDb, actionType: string): number {
  const row = db
    .prepare("select count(*) as count from control_actions where action_type = ?")
    .get(actionType) as { count: number } | undefined;
  return row?.count ?? 0;
}

function countAllActions(db: RuntimeDb): number {
  const row = db
    .prepare("select count(*) as count from control_actions")
    .get() as { count: number } | undefined;
  return row?.count ?? 0;
}

function listActionTypes(db: RuntimeDb): string[] {
  return (
    db
      .prepare("select action_type from control_actions order by created_at asc")
      .all() as Array<{ action_type: string }>
  ).map((r) => r.action_type);
}

describe("runtime mutation commands create ControlAction records", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: ControlActionStore;
  let processor: ControlActionProcessor;

  const mockHandlers: ControlActionHandlers = {
    cancelWorkflow: {
      cancelWorkflow: async () => ({ status: "completed" as const }),
    },
    resumeWorkflow: {
      resumeWorkflow: async () => ({ status: "completed" as const }),
    },
    confirmMemory: {
      confirmMemory: async () => ({ status: "completed" as const }),
    },
    deleteMemory: {
      deleteMemory: async () => ({ status: "completed" as const }),
    },
    triggerRecovery: {
      triggerRecovery: async () => ({ status: "completed" as const }),
    },
  };

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-runtime-cmds-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_test', 'Test', '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z')`
    ).run();
    store = new ControlActionStore(db);

    const sink: ControlEventSink = { emit: () => {} };
    processor = new ControlActionProcessor(store, mockHandlers, sink);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("cancel command creates a cancel_workflow ControlAction record", async () => {
    expect(countAllActions(db)).toBe(0);

    const registry = buildSlashCommandRegistry({
      repositories: { list: () => [] },
      defaults: false,
      modules: [runtimeCommandModule("ws_test")],
      controlActionStore: store,
      controlActionProcessor: processor,
    });

    const handler = registry.resolve("runtime_cancel")!;
    const reply = await handler.execute(makeContext("wfi_cancel"));

    expect(reply.kind).toBe("text");
    if (reply.kind === "text") {
      expect(reply.text).toContain("已取消");
    }
    expect(countActionsInDb(db, "cancel_workflow")).toBe(1);
  });

  it("resume command creates a resume_workflow ControlAction record", async () => {
    expect(countAllActions(db)).toBe(0);

    const registry = buildSlashCommandRegistry({
      repositories: { list: () => [] },
      defaults: false,
      modules: [runtimeCommandModule("ws_test")],
      controlActionStore: store,
      controlActionProcessor: processor,
      operatorWorkspaceId: "ws_test",
    });

    const handler = registry.resolve("runtime_resume")!;
    const reply = await handler.execute(makeContext("wfi_resume"));

    expect(reply.kind).toBe("text");
    if (reply.kind === "text") {
      expect(reply.text).toContain("已恢复");
    }
    expect(countActionsInDb(db, "resume_workflow")).toBe(1);
  });

  it("memory approve command creates a confirm_memory ControlAction record", async () => {
    expect(countAllActions(db)).toBe(0);

    const registry = buildSlashCommandRegistry({
      repositories: { list: () => [] },
      defaults: false,
      modules: [runtimeCommandModule("ws_test")],
      controlActionStore: store,
      controlActionProcessor: processor,
      operatorWorkspaceId: "ws_test",
    });

    const handler = registry.resolve("runtime_memory_approve")!;
    const reply = await handler.execute(makeContext("mem_approve_1"));

    expect(reply.kind).toBe("text");
    if (reply.kind === "text") {
      expect(reply.text).toContain("已批准");
    }
    expect(countActionsInDb(db, "confirm_memory")).toBe(1);
  });

  it("memory reject command creates a delete_memory ControlAction record", async () => {
    expect(countAllActions(db)).toBe(0);

    const registry = buildSlashCommandRegistry({
      repositories: { list: () => [] },
      defaults: false,
      modules: [runtimeCommandModule("ws_test")],
      controlActionStore: store,
      controlActionProcessor: processor,
      operatorWorkspaceId: "ws_test",
    });

    const handler = registry.resolve("runtime_memory_reject")!;
    const reply = await handler.execute(makeContext("mem_reject_1"));

    expect(reply.kind).toBe("text");
    if (reply.kind === "text") {
      expect(reply.text).toContain("已拒绝");
    }
    expect(countActionsInDb(db, "delete_memory")).toBe(1);
  });

  it("recover command creates a trigger_recovery ControlAction record", async () => {
    expect(countAllActions(db)).toBe(0);

    const registry = buildSlashCommandRegistry({
      repositories: { list: () => [] },
      defaults: false,
      modules: [runtimeCommandModule("ws_test")],
      controlActionStore: store,
      controlActionProcessor: processor,
      operatorWorkspaceId: "ws_test",
    });

    const handler = registry.resolve("runtime_recover")!;
    const reply = await handler.execute(makeContext("wfi_recover"));

    expect(reply.kind).toBe("text");
    if (reply.kind === "text") {
      expect(reply.text).toContain("恢复请求已创建");
    }
    expect(countActionsInDb(db, "trigger_recovery")).toBe(1);
  });

  it("read-only list command does NOT create a ControlAction record", async () => {
    const registry = buildSlashCommandRegistry({
      repositories: { list: () => [] },
      defaults: false,
      modules: [runtimeCommandModule("ws_test")],
      runtimeInspectionService: {
        inspect: async () => ({ workflows: [], totalWorkflows: 0, waitingCount: 0, failedCount: 0 }),
      } as any,
      controlActionStore: store,
      controlActionProcessor: processor,
      operatorWorkspaceId: "ws_test",
    });

    expect(countAllActions(db)).toBe(0);

    const handler = registry.resolve("runtime_list")!;
    await handler.execute(makeContext(""));

    expect(countAllActions(db)).toBe(0);
  });

  it("read-only show command does NOT create a ControlAction record", async () => {
    const registry = buildSlashCommandRegistry({
      repositories: { list: () => [] },
      defaults: false,
      modules: [runtimeCommandModule("ws_test")],
      runtimeInspectionService: {
        inspect: async () => ({ workflows: [], totalWorkflows: 0, waitingCount: 0, failedCount: 0 }),
      } as any,
      controlActionStore: store,
      controlActionProcessor: processor,
      operatorWorkspaceId: "ws_test",
    });

    expect(countAllActions(db)).toBe(0);

    const handler = registry.resolve("runtime_show")!;
    await handler.execute(makeContext(""));

    expect(countAllActions(db)).toBe(0);
  });

  it("each mutation command creates a distinct action type", async () => {
    const registry = buildSlashCommandRegistry({
      repositories: { list: () => [] },
      defaults: false,
      modules: [runtimeCommandModule("ws_test")],
      controlActionStore: store,
      controlActionProcessor: processor,
      operatorWorkspaceId: "ws_test",
    });

    const cancel = registry.resolve("runtime_cancel")!;
    await cancel.execute(makeContext("wfi_a"));

    const resume = registry.resolve("runtime_resume")!;
    await resume.execute(makeContext("wfi_b"));

    const memApprove = registry.resolve("runtime_memory_approve")!;
    await memApprove.execute(makeContext("mem_c"));

    const memReject = registry.resolve("runtime_memory_reject")!;
    await memReject.execute(makeContext("mem_d"));

    const recover = registry.resolve("runtime_recover")!;
    await recover.execute(makeContext("wfi_e"));

    const types = listActionTypes(db);
    expect(types).toContain("cancel_workflow");
    expect(types).toContain("resume_workflow");
    expect(types).toContain("confirm_memory");
    expect(types).toContain("delete_memory");
    expect(types).toContain("trigger_recovery");
    expect(types.length).toBe(5);
  });
});
