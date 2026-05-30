import type { RuntimeStore } from "./runtime-store.js";
import type { EffectInput, RuntimeError, WorkflowStep, WorkflowStepContext } from "./runtime-models.js";
import type { WorkflowRegistry } from "./workflow-registry.js";
import type { RuntimeEffectExecutor } from "./runtime-effect-executor.js";

interface WorkflowRuntimeStartInput {
  workflowInstanceId: string;
  runAttemptId: string;
  workspaceId: string;
  projectId: string | null;
  definitionId: string;
  input: unknown;
  now: string;
}

let effectCounter = 0;

export class WorkflowRuntime {
  constructor(
    private readonly store: RuntimeStore,
    private readonly registry: WorkflowRegistry,
    private readonly effectExecutor: RuntimeEffectExecutor
  ) {}

  async start(input: WorkflowRuntimeStartInput): Promise<{ status: "succeeded" | "failed" | "waiting" }> {
    const definition = this.registry.require(input.definitionId);
    const eventId = (suffix: string) => `${input.runAttemptId}:${suffix}`;
    this.store.registerWorkflowDefinition({
      id: definition.definitionId,
      version: definition.version,
      concurrencyPolicy: definition.concurrencyPolicy,
      now: input.now
    });
    this.store.createWorkflowInstance({
      id: input.workflowInstanceId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      definitionId: definition.definitionId,
      definitionVersion: definition.version,
      status: "running",
      now: input.now
    });
    this.appendEvent(input, eventId("workflow-created"), "workflow_instance.created", {
      definitionId: definition.definitionId
    });
    this.store.createRunAttempt({
      id: input.runAttemptId,
      workflowInstanceId: input.workflowInstanceId,
      status: "running",
      triggerEventId: null,
      now: input.now
    });
    this.appendEvent(input, eventId("attempt-started"), "attempt.started", {});

    for (const step of definition.steps) {
      const stateId = this.startStep(input, step, eventId);
      const ctx = this.buildContext(input, stateId);
      const result = await step.run(ctx);

      if (result.kind === "wait") {
        this.waitStep(input, step, stateId, result.output, result.waitFor, eventId);
        this.finish(input, "waiting", step.stepId, null, eventId);
        return { status: "waiting" };
      }
      if (result.kind === "fail") {
        this.failStep(input, step, stateId, result.error, eventId);
        this.finish(input, "failed", step.stepId, result.error, eventId);
        return { status: "failed" };
      }
      if (result.kind === "complete") {
        this.succeedStep(input, step, stateId, result.output, eventId);
        this.finish(input, "succeeded", null, null, eventId);
        return { status: "succeeded" };
      }

      this.succeedStep(input, step, stateId, result.output, eventId);
    }

    this.finish(input, "succeeded", null, null, eventId);
    return { status: "succeeded" };
  }

  private buildContext(input: WorkflowRuntimeStartInput, stepStateId: string): WorkflowStepContext {
    return {
      workflowInstanceId: input.workflowInstanceId,
      runAttemptId: input.runAttemptId,
      input: input.input,
      executeEffect: (effect: EffectInput) => {
        effectCounter++;
        const effectId = `${input.runAttemptId}:effect:${effectCounter}`;
        return this.effectExecutor.execute({
          effectId,
          pluginId: effect.pluginId,
          effectType: effect.effectType,
          input: effect.input,
          idempotencyKey: effect.idempotencyKey,
          workspaceId: input.workspaceId,
          workflowInstanceId: input.workflowInstanceId,
          runAttemptId: input.runAttemptId,
          stepStateId,
          now: input.now
        });
      }
    };
  }

  private startStep(input: WorkflowRuntimeStartInput, step: WorkflowStep, eventId: (suffix: string) => string): string {
    const stateId = `${input.runAttemptId}:step:${step.stepId}`;
    this.store.createStepState({
      id: stateId,
      workflowInstanceId: input.workflowInstanceId,
      runAttemptId: input.runAttemptId,
      stepId: step.stepId,
      status: "running",
      input: input.input,
      now: input.now
    });
    this.appendEvent(input, eventId(`step-started-${step.stepId}`), "step.started", { stepId: step.stepId }, stateId);
    return stateId;
  }

  private succeedStep(
    input: WorkflowRuntimeStartInput,
    step: WorkflowStep,
    stateId: string,
    output: unknown,
    eventId: (suffix: string) => string
  ): void {
    this.store.updateStepState({
      id: stateId,
      status: "succeeded",
      output,
      waitCondition: null,
      error: null,
      now: input.now
    });
    this.appendEvent(input, eventId(`step-succeeded-${step.stepId}`), "step.succeeded", {
      stepId: step.stepId
    }, stateId);
  }

  private waitStep(
    input: WorkflowRuntimeStartInput,
    step: WorkflowStep,
    stateId: string,
    output: unknown,
    waitCondition: Parameters<RuntimeStore["updateStepState"]>[0]["waitCondition"],
    eventId: (suffix: string) => string
  ): void {
    this.store.updateStepState({
      id: stateId,
      status: "waiting",
      output,
      waitCondition,
      error: null,
      now: input.now
    });
    this.appendEvent(input, eventId(`step-waiting-${step.stepId}`), "step.waiting", {
      stepId: step.stepId
    }, stateId);
  }

  private failStep(
    input: WorkflowRuntimeStartInput,
    step: WorkflowStep,
    stateId: string,
    error: RuntimeError,
    eventId: (suffix: string) => string
  ): void {
    this.store.updateStepState({
      id: stateId,
      status: "failed",
      output: undefined,
      waitCondition: null,
      error,
      now: input.now
    });
    this.appendEvent(input, eventId(`step-failed-${step.stepId}`), "step.failed", {
      stepId: step.stepId,
      errorCode: error.code
    }, stateId);
  }

  private finish(
    input: WorkflowRuntimeStartInput,
    status: "succeeded" | "failed" | "waiting",
    currentStepId: string | null,
    error: RuntimeError | null,
    eventId: (suffix: string) => string
  ): void {
    this.store.finishRunAttempt({ id: input.runAttemptId, status, error, now: input.now });
    this.store.updateWorkflowInstanceStatus({ id: input.workflowInstanceId, status, currentStepId, now: input.now });
    const attemptEvent = status === "succeeded" ? "attempt.completed" : `attempt.${status}`;
    const attemptEventId = status === "succeeded" ? "attempt-completed" : `attempt-${status}`;
    this.appendEvent(input, eventId(attemptEventId), attemptEvent, {});
    this.appendEvent(input, eventId("workflow-state-changed"), "workflow_instance.state_changed", { status });
  }

  private appendEvent(
    input: WorkflowRuntimeStartInput,
    id: string,
    type: string,
    payload: unknown,
    stepStateId: string | null = null
  ): void {
    this.store.appendRuntimeEvent({
      id,
      workspaceId: input.workspaceId,
      workflowInstanceId: input.workflowInstanceId,
      runAttemptId: input.runAttemptId,
      stepStateId,
      effectExecutionId: null,
      category: "required",
      type,
      payload,
      now: input.now
    });
  }
}
