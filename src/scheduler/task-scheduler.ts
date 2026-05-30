import { Cron } from "croner";
import type { AgentProviderRegistry } from "../agent/agent-provider-registry.js";
import type { FeegleConfig } from "../app/config-store.js";
import type { HookManager } from "../app/hooks.js";
import type { NotificationPort } from "../app/notification-port.js";
import type { RuntimeError } from "../runtime/runtime-models.js";
import { buildFailureCard } from "./build-failure-card.js";
import { buildRecoveryCard } from "./build-recovery-card.js";
import { decideShouldNotifyFailure } from "./failure-policy.js";
import { UndeliveredFailureCounter } from "./undelivered-counter.js";
import { withinActiveHours } from "./active-hours.js";
import type { HandlerKindRegistry } from "./handler-kind-registry.js";
import { SingleFlight } from "./single-flight.js";
import type { SchedulerRuntimeObserver } from "./scheduler-runtime-observer.js";
import type { RunsLog, RunsLogEntry } from "./runs-log.js";
import type { Task, TaskLastRun, TaskRunStatus } from "./task.js";
import type { Clock, DailyDedupStore, HostInfoProvider, Logger } from "./task-context.js";
import type { TaskMutationObserver, TaskRegistry } from "./task-registry.js";

interface ConfigStorePort {
  get(): Readonly<FeegleConfig>;
}

export interface TaskSchedulerDeps {
  registry: TaskRegistry;
  configStore: ConfigStorePort;
  kinds: HandlerKindRegistry;
  dedup: DailyDedupStore;
  runsLog: Pick<RunsLog, "append">;
  notify: NotificationPort;
  agents: AgentProviderRegistry;
  host: HostInfoProvider;
  clock: Clock;
  logger: Logger;
  undeliveredFailures?: UndeliveredFailureCounter;
  hooks?: HookManager;
  runtimeObserver?: Pick<SchedulerRuntimeObserver, "beforeTaskRun">;
  runtimeWorkspaceId?: string;
  recovery?: {
    createDiagnosticBundle(input: {
      artifactId: string;
      workspaceId: string;
      runAttemptId?: string;
      error: RuntimeError;
      now: string;
    }): Promise<unknown>;
  };
  memory?: {
    createCandidate(input: {
      id: string;
      workspaceId: string;
      scope: "workspace";
      kind: "failure_pattern";
      content: string;
      source: Record<string, unknown>;
      confidence: number;
      now: string;
    }): unknown;
  };
  controlActions?: {
    create(input: {
      id: string;
      workspaceId: string;
      actorUserId: string | null;
      actionType: string;
      payload: Record<string, unknown>;
      now: string;
    }): unknown;
  };
}

export class TaskScheduler implements TaskMutationObserver {
  private readonly activeTasks = new Map<string, { stop(): void }>();
  private readonly singleFlight = new SingleFlight();
  private readonly undeliveredFailures: UndeliveredFailureCounter;
  private readonly hooks?: HookManager;
  private unsubscribe?: () => void;

  constructor(private readonly deps: TaskSchedulerDeps) {
    this.undeliveredFailures = deps.undeliveredFailures ?? new UndeliveredFailureCounter();
    this.hooks = deps.hooks;
  }

  async start(): Promise<void> {
    this.unsubscribe = this.deps.registry.subscribe(this);
    for (const task of this.deps.registry.list()) {
      if (task.enabled) {
        this.schedule(task);
      }
    }
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    for (const task of this.activeTasks.values()) {
      task.stop();
    }
    this.activeTasks.clear();
  }

  async runOnce(taskId: string, options: { force?: boolean } = {}): Promise<TaskLastRun> {
    return this.execute(taskId, { force: options.force === true, checkActiveHours: false, rethrow: true });
  }

  onAdded(task: Task): void {
    if (task.enabled) {
      this.schedule(task);
    }
  }

  onUpdated(task: Task): void {
    this.unschedule(task.id);
    if (task.enabled) {
      this.schedule(task);
    }
  }

  onRemoved(taskId: string): void {
    this.unschedule(taskId);
  }

  private schedule(task: Task): void {
    this.unschedule(task.id);
    const scheduled = new Cron(
      task.cron,
      { timezone: task.timezone },
      () => {
        void this.execute(task.id, { force: false, checkActiveHours: true, rethrow: false });
      }
    );
    this.activeTasks.set(task.id, scheduled);
  }

  private unschedule(taskId: string): void {
    const scheduled = this.activeTasks.get(taskId);
    if (scheduled) {
      scheduled.stop();
      this.activeTasks.delete(taskId);
    }
  }

  private async execute(
    taskId: string,
    options: { force: boolean; checkActiveHours: boolean; rethrow: boolean }
  ): Promise<TaskLastRun> {
    const task = this.deps.registry.get(taskId);
    if (!task || !task.enabled) {
      return { at: this.deps.clock.now().toISOString(), status: "skipped", durationMs: 0, note: "disabled" };
    }
    const now = this.deps.clock.now();
    if (options.checkActiveHours && !withinActiveHours(task, now)) {
      this.deps.logger.debug("outside activeHours, skip", { taskId, now: now.toISOString() });
      return { at: now.toISOString(), status: "skipped", durationMs: 0, note: "outside-active-hours" };
    }
    if (!options.force && !this.singleFlight.tryAcquire(taskId)) {
      return this.record(task, "skipped", 0, "still-running", now, { consecutiveFailures: task.consecutiveFailures });
    }

    const startedAt = Date.now();
    try {
      const kind = this.deps.kinds.get(task.kind);
      if (!kind) {
        throw new Error(`Unknown kind: ${task.kind}`);
      }
      await this.deps.runtimeObserver?.beforeTaskRun({
        taskId: task.id,
        taskName: task.name,
        kind: task.kind
      });
      const params = kind.parseParams(task.params);
      const result = await kind.run(
        {
          task,
          now,
          logger: this.deps.logger,
          notify: this.deps.notify,
          agents: this.deps.agents,
          dedup: this.deps.dedup,
          host: this.deps.host
        },
        params
      );
      const durationMs = Date.now() - startedAt;
      const lastRun = await this.applySuccess(task, outcomeToStatus(result.outcome), durationMs, result.note, now);
      this.hooks?.emit({
        event: "task.completed",
        content: result.note,
        extra: { taskId: task.id, taskName: task.name, kind: task.kind, durationMs }
      });
      return lastRun;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const note = errorMessage(error);
      const lastRun = await this.applyFailure(task, error, durationMs, now);
      this.hooks?.emit({
        event: "task.failed",
        error: note,
        extra: { taskId: task.id, taskName: task.name, kind: task.kind, durationMs }
      });
      if (options.rethrow) {
        throw error;
      }
      return lastRun;
    } finally {
      if (!options.force) {
        this.singleFlight.release(taskId);
      }
    }
  }

  private async applySuccess(
    task: Task,
    status: TaskRunStatus,
    durationMs: number,
    note: string | undefined,
    now: Date
  ): Promise<TaskLastRun> {
    if (task.consecutiveFailures > 0) {
      const target = this.deps.configStore.get().failureTarget;
      if (target) {
        await this.deps.notify.sendCard(target, buildRecoveryCard(task, now));
      }
    }
    return this.record(task, status, durationMs, note, now, {
      consecutiveFailures: 0,
      lastErrorNotifiedAt: null
    });
  }

  private async applyFailure(task: Task, error: unknown, durationMs: number, now: Date): Promise<TaskLastRun> {
    const consecutiveFailures = task.consecutiveFailures + 1;
    const note = errorMessage(error);
    const lastRun = await this.record(task, "failed", durationMs, note, now, { consecutiveFailures });
    await this.recordRuntimeFailureArtifacts(task, note, consecutiveFailures, now);
    if (decideShouldNotifyFailure(task.errorPolicy, consecutiveFailures, task.lastErrorNotifiedAt, now)) {
      const target = this.deps.configStore.get().failureTarget;
      if (!target) {
        this.undeliveredFailures.increment(task.id);
        this.deps.logger.warn("failure with no failureTarget configured", {
          taskId: task.id,
          errorClass: errorClass(error)
        });
      } else {
        try {
          await this.deps.notify.sendCard(target, buildFailureCard(task, error, consecutiveFailures));
          await this.deps.registry.update(task.id, { lastErrorNotifiedAt: now.toISOString() });
        } catch (pushError) {
          this.undeliveredFailures.increment(task.id);
          this.deps.logger.error("failed to deliver failure notification", { error: errorMessage(pushError) });
        }
      }
    }
    return lastRun;
  }

  private async recordRuntimeFailureArtifacts(
    task: Task,
    note: string,
    consecutiveFailures: number,
    now: Date
  ): Promise<void> {
    const runtimeWorkspaceId = this.deps.runtimeWorkspaceId;
    if (!runtimeWorkspaceId) {
      return;
    }
    const nowIso = now.toISOString();
    const runtimeError: RuntimeError = {
      code: "SCHEDULED_TASK_FAILED",
      category: "capability",
      message: note,
      retryable: true,
      recoverable: true,
      evidence: { taskId: task.id, kind: task.kind }
    };
    if (this.deps.recovery) {
      await this.deps.recovery.createDiagnosticBundle({
        artifactId: `diag:${task.id}:${nowIso}`,
        workspaceId: runtimeWorkspaceId,
        error: runtimeError,
        now: nowIso
      });
    }
    if (consecutiveFailures < 2) {
      return;
    }
    this.deps.memory?.createCandidate({
      id: `mem:${task.id}:${nowIso}`,
      workspaceId: runtimeWorkspaceId,
      scope: "workspace",
      kind: "failure_pattern",
      content: `Task ${task.name} (${task.kind}) failed ${consecutiveFailures} consecutive times: ${note}`,
      source: { taskId: task.id, kind: task.kind },
      confidence: 0.7,
      now: nowIso
    });
    this.deps.controlActions?.create({
      id: `ctrl:${task.id}:${nowIso}`,
      workspaceId: runtimeWorkspaceId,
      actorUserId: null,
      actionType: "trigger_recovery",
      payload: { taskId: task.id, kind: task.kind, consecutiveFailures },
      now: nowIso
    });
  }

  private async record(
    task: Task,
    status: TaskRunStatus,
    durationMs: number,
    note: string | undefined,
    now: Date,
    patch: Partial<Task>
  ): Promise<TaskLastRun> {
    const lastRun: TaskLastRun = {
      at: now.toISOString(),
      status,
      durationMs,
      ...(note ? { note } : {})
    };
    await this.deps.registry.update(task.id, { ...patch, lastRun });
    const entry: RunsLogEntry = {
      taskId: task.id,
      kind: task.kind,
      at: lastRun.at,
      outcome: status,
      durationMs,
      ...(note ? { note } : {})
    };
    await this.deps.runsLog.append(entry);
    return lastRun;
  }
}

function outcomeToStatus(outcome: "sent" | "silent" | "noop"): TaskRunStatus {
  if (outcome === "sent") {
    return "ok";
  }
  return outcome;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorClass(error: unknown): string {
  if (typeof error === "object" && error && "errorClass" in error && typeof error.errorClass === "string") {
    return error.errorClass;
  }
  return error instanceof Error ? error.constructor.name : typeof error;
}
