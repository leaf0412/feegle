import type { RuntimeStore } from "./runtime-store.js";

export interface QueueEntry {
  attemptId: string;
  workflowInstanceId: string;
  definitionId?: string;
  attemptCount: number;
  nextRunAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
}

export class RunAttemptQueue {
  constructor(
    private readonly store: RuntimeStore,
    private readonly workerId: string,
    private readonly leaseDurationMs: number = 300_000 // 5 minutes default
  ) {}

  /** Enqueue a new or retryable attempt */
  enqueue(input: {
    attemptId: string;
    workflowInstanceId: string;
    nextRunAt?: string;
    triggerEventId?: string | null;
    attemptCount?: number;
    now: string;
  }): void {
    this.store.enqueueAttempt({
      id: input.attemptId,
      workflowInstanceId: input.workflowInstanceId,
      triggerEventId: input.triggerEventId ?? null,
      nextRunAt: input.nextRunAt ?? null,
      attemptCount: input.attemptCount ?? 0,
      now: input.now
    });
  }

  /** Claim the next due attempt (atomically via transaction with WHERE conditions) */
  claimNext(now: string): QueueEntry | null {
    const leaseExpiresAt = new Date(new Date(now).getTime() + this.leaseDurationMs).toISOString();
    const row = this.store.claimNextAttempt({
      workerId: this.workerId,
      leaseExpiresAt,
      now
    });
    if (!row) return null;
    return {
      attemptId: row.id,
      workflowInstanceId: row.workflowInstanceId,
      attemptCount: row.attemptCount,
      nextRunAt: row.nextRunAt,
      leaseOwner: row.leaseOwner,
      leaseExpiresAt: row.leaseExpiresAt
    };
  }

  /** Renew lease on a currently-held attempt */
  renewLease(attemptId: string, now: string): boolean {
    const leaseExpiresAt = new Date(new Date(now).getTime() + this.leaseDurationMs).toISOString();
    return this.store.renewLease({
      attemptId,
      leaseOwner: this.workerId,
      leaseExpiresAt
    });
  }

  /** Mark attempt completed and release lease */
  complete(attemptId: string, now: string): void {
    this.store.completeAttempt({
      attemptId,
      leaseOwner: this.workerId,
      now
    });
  }

  /** Mark attempt failed, release lease, and optionally schedule retry */
  fail(attemptId: string, retryAfterMs?: number, now?: string): void {
    const currentNow = now ?? new Date().toISOString();
    let nextRunAt: string | null = null;
    if (retryAfterMs !== undefined && retryAfterMs > 0) {
      nextRunAt = new Date(new Date(currentNow).getTime() + retryAfterMs).toISOString();
    }
    this.store.failAttempt({
      attemptId,
      leaseOwner: this.workerId,
      nextRunAt,
      error: null,
      now: currentNow
    });
  }

  /** Release lease without completing (for shutdown) */
  release(attemptId: string, now: string): void {
    this.store.releaseAttempt({
      attemptId,
      leaseOwner: this.workerId,
      now
    });
  }

  /** Detect and handle expired leases (called on boot) */
  recoverExpiredLeases(now: string): QueueEntry[] {
    const rows = this.store.getExpiredLeases(now);
    const entries: QueueEntry[] = [];
    for (const row of rows) {
      // Reset lease fields so the attempt can be claimed again
      this.store.releaseAttempt({
        attemptId: row.id,
        leaseOwner: row.leaseOwner,
        now
      });
      entries.push({
        attemptId: row.id,
        workflowInstanceId: row.workflowInstanceId,
        attemptCount: 0,
        nextRunAt: null,
        leaseOwner: null,
        leaseExpiresAt: null
      });
    }
    return entries;
  }
}
