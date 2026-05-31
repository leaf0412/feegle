import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { RunAttemptQueue } from "@core/runtime/run-attempt-queue.js";
import { RuntimeStore } from "@core/runtime/runtime-store.js";

describe("RunAttemptQueue", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: RuntimeStore;
  let now: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-queue-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    store = new RuntimeStore(db);
    now = "2026-05-31T00:00:00.000Z";

    // Insert workspace for FK constraint
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Test', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("two workers cannot claim the same attempt", () => {
    const queueA = new RunAttemptQueue(store, "worker-a");
    const queueB = new RunAttemptQueue(store, "worker-b");

    // Create a workflow instance first (FK constraint)
    store.createWorkflowInstance({
      id: "wfi_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def_1",
      definitionVersion: 1,
      status: "running",
      now
    });

    // Enqueue an attempt
    queueA.enqueue({
      attemptId: "attempt_1",
      workflowInstanceId: "wfi_1",
      now
    });

    // Worker A claims it
    const claimedA = queueA.claimNext(now);
    expect(claimedA).not.toBeNull();
    expect(claimedA!.attemptId).toBe("attempt_1");
    expect(claimedA!.leaseOwner).toBe("worker-a");

    // Worker B tries to claim - should get null
    const claimedB = queueB.claimNext(now);
    expect(claimedB).toBeNull();
  });

  it("expired lease is detected and attempt can be reclaimed", () => {
    const queueA = new RunAttemptQueue(store, "worker-a", 60_000); // 1 min lease
    const queueB = new RunAttemptQueue(store, "worker-b", 60_000);

    store.createWorkflowInstance({
      id: "wfi_2",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def_2",
      definitionVersion: 1,
      status: "running",
      now
    });

    queueA.enqueue({
      attemptId: "attempt_2",
      workflowInstanceId: "wfi_2",
      now
    });

    // Worker A claims it at T=0
    const claimedA = queueA.claimNext(now);
    expect(claimedA).not.toBeNull();

    // Fast forward past lease expiry
    const laterNow = "2026-05-31T00:05:00.000Z"; // 5 min later

    // Worker B detects expired lease and can reclaim
    const recovered = queueB.recoverExpiredLeases(laterNow);
    expect(recovered.length).toBe(1);
    expect(recovered[0].attemptId).toBe("attempt_2");

    // Worker B can now claim the recovered attempt
    const claimedB = queueB.claimNext(laterNow);
    expect(claimedB).not.toBeNull();
    expect(claimedB!.attemptId).toBe("attempt_2");
    expect(claimedB!.leaseOwner).toBe("worker-b");
  });

  it("renewLease extends expiry", () => {
    const queue = new RunAttemptQueue(store, "worker-a", 60_000);

    store.createWorkflowInstance({
      id: "wfi_3",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def_3",
      definitionVersion: 1,
      status: "running",
      now
    });

    queue.enqueue({
      attemptId: "attempt_3",
      workflowInstanceId: "wfi_3",
      now
    });

    // Claim at T=0, lease expires at T+60s
    const claimed = queue.claimNext(now);
    expect(claimed).not.toBeNull();
    expect(claimed!.leaseExpiresAt).toBe("2026-05-31T00:01:00.000Z");

    // Renew at T=30s
    const renewNow = "2026-05-31T00:00:30.000Z";
    const renewed = queue.renewLease("attempt_3", renewNow);
    expect(renewed).toBe(true);

    // Check that the lease was extended
    const attempt = store.getQueuedAttempt("attempt_3");
    expect(attempt).not.toBeUndefined();
    expect(attempt!.leaseExpiresAt).toBe("2026-05-31T00:01:30.000Z");

    // At T+90s (past original expiry, within renewed expiry) - attempt still owned by worker-a
    const checkNow = "2026-05-31T00:01:30.000Z";
    const expired = store.getExpiredLeases(checkNow);
    expect(expired.length).toBe(1); // The lease just expired at exactly this time
  });

  it("renewLease returns false for non-owned attempt", () => {
    const queueA = new RunAttemptQueue(store, "worker-a");
    const queueB = new RunAttemptQueue(store, "worker-b");

    store.createWorkflowInstance({
      id: "wfi_4",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def_4",
      definitionVersion: 1,
      status: "running",
      now
    });

    queueA.enqueue({
      attemptId: "attempt_4",
      workflowInstanceId: "wfi_4",
      now
    });

    queueA.claimNext(now);

    // Worker B tries to renew worker A's lease - should fail
    const renewed = queueB.renewLease("attempt_4", now);
    expect(renewed).toBe(false);
  });

  it("complete releases lease", () => {
    const queue = new RunAttemptQueue(store, "worker-a");

    store.createWorkflowInstance({
      id: "wfi_5",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def_5",
      definitionVersion: 1,
      status: "running",
      now
    });

    queue.enqueue({
      attemptId: "attempt_5",
      workflowInstanceId: "wfi_5",
      now
    });

    queue.claimNext(now);

    // Complete the attempt
    queue.complete("attempt_5", now);

    // Check that the attempt is succeeded and lease is cleared
    const attempt = store.getQueuedAttempt("attempt_5");
    expect(attempt).not.toBeUndefined();
    expect(attempt!.status).toBe("succeeded");
    expect(attempt!.leaseOwner).toBeNull();
    expect(attempt!.leaseExpiresAt).toBeNull();
  });

  it("fail schedules retry with next_run_at", () => {
    const queue = new RunAttemptQueue(store, "worker-a");

    store.createWorkflowInstance({
      id: "wfi_6",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def_6",
      definitionVersion: 1,
      status: "running",
      now
    });

    queue.enqueue({
      attemptId: "attempt_6",
      workflowInstanceId: "wfi_6",
      now
    });

    queue.claimNext(now);

    // Fail with retry after 60 seconds
    queue.fail("attempt_6", 60_000, now);

    // Check that the attempt is queued for retry
    const attempt = store.getQueuedAttempt("attempt_6");
    expect(attempt).not.toBeUndefined();
    expect(attempt!.status).toBe("queued");
    expect(attempt!.leaseOwner).toBeNull();
    expect(attempt!.leaseExpiresAt).toBeNull();
    expect(attempt!.nextRunAt).toBe("2026-05-31T00:01:00.000Z");

    // Can be claimed again after nextRunAt
    const laterNow = "2026-05-31T00:01:01.000Z";
    const reclaimed = queue.claimNext(laterNow);
    expect(reclaimed).not.toBeNull();
    expect(reclaimed!.attemptId).toBe("attempt_6");
  });

  it("fail without retry marks as permanently failed", () => {
    const queue = new RunAttemptQueue(store, "worker-a");

    store.createWorkflowInstance({
      id: "wfi_7",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def_7",
      definitionVersion: 1,
      status: "running",
      now
    });

    queue.enqueue({
      attemptId: "attempt_7",
      workflowInstanceId: "wfi_7",
      now
    });

    queue.claimNext(now);

    // Fail without retry
    queue.fail("attempt_7", undefined, now);

    const attempt = store.getQueuedAttempt("attempt_7");
    expect(attempt).not.toBeUndefined();
    expect(attempt!.status).toBe("failed");
    expect(attempt!.leaseOwner).toBeNull();
    expect(attempt!.nextRunAt).toBeNull();
  });

  it("release returns attempt to queue", () => {
    const queueA = new RunAttemptQueue(store, "worker-a");
    const queueB = new RunAttemptQueue(store, "worker-b");

    store.createWorkflowInstance({
      id: "wfi_8",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def_8",
      definitionVersion: 1,
      status: "running",
      now
    });

    queueA.enqueue({
      attemptId: "attempt_8",
      workflowInstanceId: "wfi_8",
      now
    });

    queueA.claimNext(now);

    // Worker A releases the attempt
    queueA.release("attempt_8", now);

    // Worker B can now claim it
    const claimed = queueB.claimNext(now);
    expect(claimed).not.toBeNull();
    expect(claimed!.attemptId).toBe("attempt_8");
    expect(claimed!.leaseOwner).toBe("worker-b");
  });

  it("recoverExpiredLeases finds all expired running attempts", () => {
    const queueA = new RunAttemptQueue(store, "worker-a", 60_000);
    const queueB = new RunAttemptQueue(store, "worker-b", 60_000);

    store.createWorkflowInstance({
      id: "wfi_9",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def_9",
      definitionVersion: 1,
      status: "running",
      now
    });
    store.createWorkflowInstance({
      id: "wfi_10",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def_10",
      definitionVersion: 1,
      status: "running",
      now
    });

    queueA.enqueue({ attemptId: "attempt_9", workflowInstanceId: "wfi_9", now });
    queueA.enqueue({ attemptId: "attempt_10", workflowInstanceId: "wfi_10", now });

    queueA.claimNext(now); // claims attempt_9
    queueB.claimNext(now); // claims attempt_10

    // Fast forward past lease expiry
    const laterNow = "2026-05-31T00:05:00.000Z";

    // Recovery detects both expired leases
    const recoveryQueue = new RunAttemptQueue(store, "recovery-worker", 300_000);
    const recovered = recoveryQueue.recoverExpiredLeases(laterNow);
    expect(recovered.length).toBe(2);

    // Both are back in the queue and claimable
    const claimedA = recoveryQueue.claimNext(laterNow);
    expect(claimedA).not.toBeNull();
    const claimedB = recoveryQueue.claimNext(laterNow);
    expect(claimedB).not.toBeNull();

    const ids = [claimedA!.attemptId, claimedB!.attemptId].sort();
    expect(ids).toEqual(["attempt_10", "attempt_9"]);
  });
});
