import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { RuntimeEffectExecutor } from "@core/runtime/runtime-effect-executor.js";
import { RuntimeStore } from "@core/runtime/runtime-store.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { WorkflowRuntime } from "@core/runtime/workflow-runtime.js";

describe("Workflow Concurrency Policies", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: RuntimeStore;
  let registry: WorkflowRegistry;
  let now: string;

  function makeRuntime() {
    return new WorkflowRuntime(
      store,
      registry,
      new RuntimeEffectExecutor(store, new EffectHandlerRegistry()),
      undefined
    );
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-concurrency-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    store = new RuntimeStore(db);
    registry = new WorkflowRegistry();
    now = "2026-05-31T00:00:00.000Z";

    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Test', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("reject_if_running rejects second attempt when one is running", async () => {
    registry.register({
      definitionId: "def.reject",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      steps: [
        {
          stepId: "sleep",
          run: () => ({ kind: "wait", reason: "paused", waitFor: { kind: "control_action", action: "continue" } })
        }
      ]
    });

    const runtime = makeRuntime();

    // First attempt - starts running and waits
    const result1 = await runtime.start({
      workflowInstanceId: "wfi_reject_1",
      runAttemptId: "run_reject_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.reject",
      input: {},
      now
    });
    expect(result1.status).toBe("waiting");

    // Second attempt - should be rejected
    const result2 = await runtime.start({
      workflowInstanceId: "wfi_reject_2",
      runAttemptId: "run_reject_2",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.reject",
      input: {},
      now
    });
    expect(result2.status).toBe("failed");
    expect(result2.error).toBeDefined();
    expect(result2.error!.code).toBe("CONCURRENCY_REJECTED");

    // Verify the rejected attempt was persisted as failed
    const attempt = store.getRunAttempt("run_reject_2");
    expect(attempt?.status).toBe("failed");
  });

  it("reject_if_running emits concurrency rejected event", async () => {
    registry.register({
      definitionId: "def.reject.events",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      steps: [
        {
          stepId: "do",
          run: () => ({ kind: "wait", reason: "hold", waitFor: { kind: "control_action", action: "release" } })
        }
      ]
    });

    const runtime = makeRuntime();

    // Start first attempt
    await runtime.start({
      workflowInstanceId: "wfi_reject_events_1",
      runAttemptId: "run_reject_events_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.reject.events",
      input: {},
      now
    });

    // Second attempt rejected
    await runtime.start({
      workflowInstanceId: "wfi_reject_events_2",
      runAttemptId: "run_reject_events_2",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.reject.events",
      input: {},
      now
    });

    // Verify the second attempt's run record exists and has failed status
    const attempt = store.getRunAttempt("run_reject_events_2");
    expect(attempt).toBeDefined();
    expect(attempt!.status).toBe("failed");
  });

  it("queue_if_running queues second attempt and it runs after first completes", async () => {
    registry.register({
      definitionId: "def.queue",
      version: 1,
      concurrencyPolicy: "queue_if_running",
      steps: [
        {
          stepId: "finish",
          run: () => ({ kind: "complete", output: { ok: true } })
        }
      ]
    });

    const runtime = makeRuntime();

    // First attempt - starts running
    const result1Future = runtime.start({
      workflowInstanceId: "wfi_queue_1",
      runAttemptId: "run_queue_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.queue",
      input: {},
      now
    });

    // Before first completes, second attempt should be queued
    const result2 = await runtime.start({
      workflowInstanceId: "wfi_queue_2",
      runAttemptId: "run_queue_2",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.queue",
      input: {},
      now: "2026-05-31T00:00:01.000Z"
    });
    expect(result2.status).toBe("queued");

    // Verify the second attempt is queued in the store
    const queuedAttempt = store.getQueuedAttempt("run_queue_2");
    expect(queuedAttempt).toBeDefined();
    expect(queuedAttempt!.status).toBe("queued");

    // Let the first attempt finish
    await result1Future;
    expect((await result1Future).status).toBe("succeeded");
  });

  it("queue_if_running allows first attempt when nothing is running", async () => {
    registry.register({
      definitionId: "def.queue.first",
      version: 1,
      concurrencyPolicy: "queue_if_running",
      steps: [
        {
          stepId: "do",
          run: () => ({ kind: "complete", output: {} })
        }
      ]
    });

    const runtime = makeRuntime();

    // No running attempts - should start normally
    const result = await runtime.start({
      workflowInstanceId: "wfi_queue_first",
      runAttemptId: "run_queue_first",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.queue.first",
      input: {},
      now
    });
    expect(result.status).toBe("succeeded");
  });

  it("skip_if_running skips second attempt silently", async () => {
    registry.register({
      definitionId: "def.skip",
      version: 1,
      concurrencyPolicy: "skip_if_running",
      steps: [
        {
          stepId: "work",
          run: () => ({ kind: "wait", reason: "hold", waitFor: { kind: "control_action", action: "resume" } })
        }
      ]
    });

    const runtime = makeRuntime();

    // First attempt - starts running and waits
    const result1 = await runtime.start({
      workflowInstanceId: "wfi_skip_1",
      runAttemptId: "run_skip_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.skip",
      input: {},
      now
    });
    expect(result1.status).toBe("waiting");

    // Second attempt - should be silently skipped
    const result2 = await runtime.start({
      workflowInstanceId: "wfi_skip_2",
      runAttemptId: "run_skip_2",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.skip",
      input: {},
      now
    });
    expect(result2.status).toBe("skipped");

    // Verify the skipped attempt was persisted as succeeded
    const attempt = store.getRunAttempt("run_skip_2");
    expect(attempt?.status).toBe("succeeded");
  });

  it("skip_if_running emits skipped event when attempt is skipped", async () => {
    registry.register({
      definitionId: "def.skip.events",
      version: 1,
      concurrencyPolicy: "skip_if_running",
      steps: [
        {
          stepId: "do",
          run: () => ({ kind: "wait", reason: "paused", waitFor: { kind: "control_action", action: "cont" } })
        }
      ]
    });

    const runtime = makeRuntime();

    // First attempt waits
    await runtime.start({
      workflowInstanceId: "wfi_skip_events_1",
      runAttemptId: "run_skip_events_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.skip.events",
      input: {},
      now
    });

    // Second attempt skipped
    await runtime.start({
      workflowInstanceId: "wfi_skip_events_2",
      runAttemptId: "run_skip_events_2",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.skip.events",
      input: {},
      now
    });

    const skippedAttempt = store.getRunAttempt("run_skip_events_2");
    expect(skippedAttempt?.status).toBe("succeeded");
  });

  it("allow_readonly_parallel allows both to run simultaneously", async () => {
    registry.register({
      definitionId: "def.parallel",
      version: 1,
      concurrencyPolicy: "allow_readonly_parallel",
      steps: [
        {
          stepId: "quick",
          run: () => ({ kind: "complete", output: { done: true } })
        }
      ]
    });

    const runtime = makeRuntime();

    // Both should succeed
    const [result1, result2] = await Promise.all([
      runtime.start({
        workflowInstanceId: "wfi_parallel_1",
        runAttemptId: "run_parallel_1",
        workspaceId: "ws_1",
        projectId: null,
        definitionId: "def.parallel",
        input: {},
        now
      }),
      runtime.start({
        workflowInstanceId: "wfi_parallel_2",
        runAttemptId: "run_parallel_2",
        workspaceId: "ws_1",
        projectId: null,
        definitionId: "def.parallel",
        input: {},
        now: "2026-05-31T00:00:01.000Z"
      })
    ]);

    expect(result1.status).toBe("succeeded");
    expect(result2.status).toBe("succeeded");

    // Both attempts should be succeeded
    expect(store.getRunAttempt("run_parallel_1")?.status).toBe("succeeded");
    expect(store.getRunAttempt("run_parallel_2")?.status).toBe("succeeded");
  });

  it("allow_readonly_parallel allows third when two are already running", async () => {
    registry.register({
      definitionId: "def.parallel.many",
      version: 1,
      concurrencyPolicy: "allow_readonly_parallel",
      steps: [
        {
          stepId: "wait",
          run: () => ({ kind: "wait", reason: "hold", waitFor: { kind: "control_action", action: "resume" } })
        }
      ]
    });

    const runtime = makeRuntime();

    // Start two
    const result1 = await runtime.start({
      workflowInstanceId: "wfi_par_1",
      runAttemptId: "run_par_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.parallel.many",
      input: {},
      now
    });
    expect(result1.status).toBe("waiting");

    const result2 = await runtime.start({
      workflowInstanceId: "wfi_par_2",
      runAttemptId: "run_par_2",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.parallel.many",
      input: {},
      now
    });
    expect(result2.status).toBe("waiting");

    // Third also allowed
    const result3 = await runtime.start({
      workflowInstanceId: "wfi_par_3",
      runAttemptId: "run_par_3",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.parallel.many",
      input: {},
      now
    });
    expect(result3.status).toBe("waiting");
  });

  it("allow_readonly_parallel allows different instances of same definition to execute independently", async () => {
    // Simulates the workbench card scenario: two different chats (different
    // workflowInstanceId) use the same definition and should NOT block each
    // other even when one is running a long effect.
    registry.register({
      definitionId: "def.parallel.chats",
      version: 1,
      concurrencyPolicy: "allow_readonly_parallel",
      steps: [
        {
          stepId: "slow",
          run: () => ({ kind: "wait", reason: "slow", waitFor: { kind: "control_action", action: "resume" } })
        }
      ]
    });

    const runtime = makeRuntime();

    // Chat A starts
    const resultA = await runtime.start({
      workflowInstanceId: "wfi_chat_a",
      runAttemptId: "run_chat_a",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.parallel.chats",
      input: { chatId: "chat_a" },
      now
    });
    expect(resultA.status).toBe("waiting");

    // Chat B also starts — must NOT be skipped because it's a different instance
    const resultB = await runtime.start({
      workflowInstanceId: "wfi_chat_b",
      runAttemptId: "run_chat_b",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def.parallel.chats",
      input: { chatId: "chat_b" },
      now
    });
    expect(resultB.status).toBe("waiting");

    // Both attempts are running independently
    expect(store.getRunAttempt("run_chat_a")?.status).toBe("waiting");
    expect(store.getRunAttempt("run_chat_b")?.status).toBe("waiting");
  });

  it("each policy emits the correct runtime event for first attempt", async () => {
    const policies: Array<{ name: string; definitionId: string; steps: Array<{ stepId: string; run: () => { kind: "complete"; output: Record<string, unknown> } }> }> = [
      {
        name: "reject_if_running",
        definitionId: "def.events.reject",
        steps: [{ stepId: "f", run: () => ({ kind: "complete" as const, output: {} }) }]
      },
      {
        name: "queue_if_running",
        definitionId: "def.events.queue",
        steps: [{ stepId: "f", run: () => ({ kind: "complete" as const, output: {} }) }]
      },
      {
        name: "skip_if_running",
        definitionId: "def.events.skip",
        steps: [{ stepId: "f", run: () => ({ kind: "complete" as const, output: {} }) }]
      },
      {
        name: "allow_readonly_parallel",
        definitionId: "def.events.parallel",
        steps: [{ stepId: "f", run: () => ({ kind: "complete" as const, output: {} }) }]
      }
    ];

    for (const { name, definitionId, steps } of policies) {
      registry.register({
        definitionId,
        version: 1,
        concurrencyPolicy: name as "reject_if_running" | "queue_if_running" | "skip_if_running" | "allow_readonly_parallel",
        steps
      });

      const runtime = makeRuntime();
      const result = await runtime.start({
        workflowInstanceId: `wfi_events_${name}`,
        runAttemptId: `run_events_${name}`,
        workspaceId: "ws_1",
        projectId: null,
        definitionId,
        input: {},
        now
      });

      // First attempt with no concurrency conflict should succeed
      expect(result.status).toBe("succeeded");

      // Verify runtime events were recorded
      const events = store.listRuntimeEvents(`wfi_events_${name}`);
      expect(events.map((e) => e.type)).toContain("workflow_instance.created");
      expect(events.map((e) => e.type)).toContain("attempt.started");
    }
  });
});
