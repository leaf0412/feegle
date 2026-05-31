import { describe, expect, it } from "vitest";
import { BootContext } from "@infra/boot/boot-context.js";
import { storesPhase } from "@infra/boot/phases/stores-phase.js";
import { IngressDispatcher } from "@core/ingress/ingress-dispatcher.js";
import type { RuntimeDb } from "@infra/app/runtime-db.js";
import { migrate } from "@infra/app/runtime-db.js";
import type { ConfigStoreProviderWriter } from "@infra/app/config-store.js";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTestBootContext(): BootContext {
  const ctx = new BootContext();
  const db: RuntimeDb = new Database(":memory:");
  migrate(db);

  const configStore: ConfigStoreProviderWriter = {
    get: () => ({
      defaultWorkspace: "ws_default",
      agent: { defaultKind: "test", providers: {} },
      feishu: {},
      gitlab: {},
      webhook: {},
      stock: {},
      notification: {},
      task: { defaultTimezone: "UTC", seedTasks: [], activeHours: [] }
    }),
    setAgentProvider: async () => {},
    setAgentDefault: async () => {}
  } as unknown as ConfigStoreProviderWriter;

  ctx.provide("configStore", configStore);
  ctx.provide("runtimeDb", db);

  return ctx;
}

describe("runtime ingress boot composition", () => {
  it("provides runtimeIngress after stores phase", async () => {
    const ctx = createTestBootContext();
    const testDir = mkdtempSync(join(tmpdir(), "feegle-plan51-"));

    const phase = storesPhase({
      feegleHome: testDir,
      seedTasks: [],
      provisions: []
    });

    await phase.run(ctx);

    const ingress = ctx.require("runtimeIngress");
    expect(ingress).toBeInstanceOf(IngressDispatcher);
    expect(typeof ingress.dispatch).toBe("function");

    try { rmSync(testDir, { recursive: true }); } catch { /* ignore */ }
  });

  it("ingress dispatches to workflow and records diagnostic events", async () => {
    const ctx = createTestBootContext();

    const db = ctx.require("runtimeDb");
    db.exec(`
      insert into workspaces(id, name, created_at, updated_at) values ('ws_default', 'default', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
      insert into users(id, display_name, created_at, updated_at) values ('system:system', 'System', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
      insert into memberships(workspace_id, user_id, role, created_at, updated_at) values ('ws_default', 'system:system', 'admin', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
    `);

    const testDir = mkdtempSync(join(tmpdir(), "feegle-plan51-"));
    const phase = storesPhase({
      feegleHome: testDir,
      seedTasks: [],
      provisions: []
    });

    await phase.run(ctx);

    const ingress = ctx.require("runtimeIngress");

    // Register a test workflow
    ctx.require("workflowRegistry").register({
      definitionId: "test.workflow",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      steps: [
        { stepId: "done", run: async () => ({ kind: "complete", output: { done: true } }) }
      ]
    });

    // Register an intent resolver using a valid intent kind
    ctx.require("intentResolvers").register({
      id: "test-resolver",
      canResolve: () => true,
      resolve: (event) => ({
        intentId: `intent:${event.triggerEventId}`,
        kind: "chat" as const,
        workspaceId: "ws_default",
        projectId: null,
        actor: { kind: "system" as const },
        payload: event.external
      })
    });

    // Register a workflow selector
    ctx.require("workflowSelector").register({
      id: "test-selector",
      matches: () => true,
      definitionId: "test.workflow"
    });

    const result = await ingress.dispatch({
      triggerEventId: "evt_test",
      source: { pluginId: "feishu", adapterId: "feishu-long-connection", triggerType: "message" },
      receivedAt: new Date().toISOString(),
      actorHint: { kind: "system" },
      conversationHint: { chatId: "test_chat" },
      external: { text: "hello", chatId: "test_chat" },
      payloadSummary: { textLen: 5 }
    });

    expect(result.status).toBe("succeeded");

    // Verify runtime events were recorded (diagnostic + workflow events).
    // Query the raw runtime_events table since listRuntimeEvents requires a
    // specific workflow instance ID.
    const events = db
      .prepare("select id, type from runtime_events order by created_at")
      .all() as Array<{ id: string; type: string }>;
    expect(events.length).toBeGreaterThan(0);

    try { rmSync(testDir, { recursive: true }); } catch { /* ignore */ }
  });

  it("fails when workspace is unresolved and no default is configured", async () => {
    const ctx = createTestBootContext();
    const testDir = mkdtempSync(join(tmpdir(), "feegle-plan51-"));

    const phase = storesPhase({
      feegleHome: testDir,
      seedTasks: [],
      provisions: []
    });

    await phase.run(ctx);

    // Build an IngressDispatcher with NO default workspace resolver
    const runtimeStore = ctx.require("runtimeStore");
    const noDefaultIngress = new IngressDispatcher({
      identityResolver: ctx.require("identityResolver"),
      workspaceResolver: ctx.require("workspaceResolver"),
      permissionPolicy: ctx.require("permissionPolicy"),
      intentResolvers: ctx.require("intentResolvers"),
      workflowSelector: ctx.require("workflowSelector"),
      workflowRuntime: ctx.require("workflowRuntime"),
      eventSink: {
        emit: (input) => runtimeStore.appendRuntimeEvent({
          id: input.id,
          workspaceId: input.workspaceId,
          workflowInstanceId: input.workflowInstanceId,
          runAttemptId: input.runAttemptId,
          stepStateId: input.stepStateId,
          effectExecutionId: input.effectExecutionId,
          category: input.category,
          type: input.type,
          payload: input.payload,
          now: input.now
        })
      },
      idFactory: { workflowInstanceId: () => "wfi_fail", runAttemptId: () => "ra_fail" },
      clock: { nowIso: () => new Date().toISOString() }
      // pluginDefaultWorkspace intentionally omitted
    });

    const result = await noDefaultIngress.dispatch({
      triggerEventId: "evt_no_ws",
      source: { pluginId: "test", adapterId: "test-adapter", triggerType: "message" },
      receivedAt: new Date().toISOString(),
      actorHint: { kind: "system" },
      external: { text: "no workspace" },
      payloadSummary: {}
    });

    expect(result.status).toBe("failed");

    try { rmSync(testDir, { recursive: true }); } catch { /* ignore */ }
  });
});
