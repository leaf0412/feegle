import type { RuntimeStore } from "./runtime-store.js";
import type { EffectInput, MemorySearchParams, RuntimeError, WorkflowSignal, WorkflowStep, WorkflowStepContext } from "./runtime-models.js";
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
  private readonly memoryService?: { searchActive(params: { scope?: string; kind?: string; query?: string }): Array<{ id: string; kind: string; scope: string; content: string }> };

  constructor(
    private readonly store: RuntimeStore,
    private readonly registry: WorkflowRegistry,
    private readonly effectExecutor: RuntimeEffectExecutor,
    memoryService?: { searchActive(params: { scope?: string; kind?: string; query?: string }): Array<{ id: string; kind: string; scope: string; content: string }> }
  ) {
    this.memoryService = memoryService;
  }

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

    let currentInput: unknown = input.input;

    for (const step of definition.steps) {
      const stepInput: WorkflowRuntimeStartInput = { ...input, input: currentInput };
      const stateId = this.startStep(stepInput, step, eventId);
      const ctx = this.buildContext(stepInput, stateId);
      const result = await step.run(ctx);

      if (result.kind === "wait") {
        this.waitStep(stepInput, step, stateId, result.output, result.waitFor, eventId);
        this.finish(stepInput, "waiting", step.stepId, null, eventId);
        return { status: "waiting" };
      }
      if (result.kind === "fail") {
        this.failStep(stepInput, step, stateId, result.error, eventId);
        this.finish(stepInput, "failed", step.stepId, result.error, eventId);
        return { status: "failed" };
      }
      if (result.kind === "complete") {
        this.succeedStep(stepInput, step, stateId, result.output, eventId);
        this.finish(stepInput, "succeeded", null, null, eventId);
        return { status: "succeeded" };
      }

      this.succeedStep(stepInput, step, stateId, result.output, eventId);
      currentInput = { ...(currentInput as Record<string, unknown> ?? {}), ...(result.output as Record<string, unknown> ?? {}) };
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
      },
      memory: this.memoryService
        ? {
            searchActive: (params: MemorySearchParams) =>
              this.memoryService!.searchActive(params)
          }
        : undefined
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

  async resume(input: {
    workflowInstanceId: string;
    runAttemptId: string;
    signal: WorkflowSignal;
    workspaceId: string;
    now: string;
  }): Promise<{ status: "succeeded" | "failed" | "waiting" }> {
    const instance = this.store.getWorkflowInstance(input.workflowInstanceId);
    if (!instance) {
      throw new Error(`workflow instance not found: ${input.workflowInstanceId}`);
    }
    if (instance.status !== "waiting") {
      throw new Error(`workflow instance is not waiting: ${input.workflowInstanceId} status=${instance.status}`);
    }

    const waitingSteps = this.store.listWaitingStepStates(input.workflowInstanceId);
    if (waitingSteps.length === 0) {
      throw new Error(`no waiting steps for workflow instance: ${input.workflowInstanceId}`);
    }

    const waitingStep = waitingSteps[0];
    if (!waitingStep.waitCondition) {
      throw new Error(`waiting step has no wait condition: ${waitingStep.id}`);
    }

    // Validate signal matches wait condition
    this.validateSignal(waitingStep.waitCondition, input.signal);

    const definition = this.registry.require(instance.definitionId ?? "");
    const stepIndex = definition.steps.findIndex((s) => s.stepId === waitingStep.stepId);
    if (stepIndex === -1) {
      throw new Error(`step not found in definition: ${waitingStep.stepId}`);
    }

    const eventId = (suffix: string) => `${input.runAttemptId}:${suffix}`;

    // Emit signal received event
    this.appendResumeEvent(input, eventId("signal-received"), "workflow.signal_received", {
      signalId: input.signal.signalId,
      signalKind: input.signal.kind
    });

    // Create new run attempt
    this.store.createRunAttempt({
      id: input.runAttemptId,
      workflowInstanceId: input.workflowInstanceId,
      status: "running",
      triggerEventId: input.signal.signalId,
      now: input.now
    });
    this.appendResumeEvent(input, eventId("attempt-started"), "attempt.started", {});

    // Mark waiting step as resumed, create new step state from the same step index
    this.store.updateStepState({
      id: waitingStep.id,
      status: "succeeded",
      output: waitingStep.output ?? input.signal.payload,
      waitCondition: null,
      error: null,
      now: input.now
    });

    // Build context with signal as input
    const resumeInput: WorkflowRuntimeStartInput = {
      workflowInstanceId: input.workflowInstanceId,
      runAttemptId: input.runAttemptId,
      workspaceId: input.workspaceId,
      projectId: null,
      definitionId: instance.definitionId ?? "",
      input: { previousOutput: waitingStep.output, signal: input.signal.payload },
      now: input.now
    };

    // Run remaining steps from waiting step index
    for (let idx = stepIndex; idx < definition.steps.length; idx++) {
      const step = definition.steps[idx];
      if (step.stepId === waitingStep.stepId) {
        // For the waiting step itself, emit step.resumed and continue without re-running
        const newStateId = `${input.runAttemptId}:step:${step.stepId}`;
        this.store.createStepState({
          id: newStateId,
          workflowInstanceId: input.workflowInstanceId,
          runAttemptId: input.runAttemptId,
          stepId: step.stepId,
          status: "succeeded",
          input: waitingStep.output ?? input.signal.payload,
          now: input.now
        });
        this.appendResumeEvent(input, eventId(`step-resumed-${step.stepId}`), "step.resumed", {
          stepId: step.stepId,
          previousStateId: waitingStep.id
        }, newStateId);
        continue;
      }

      const stateId = this.startResumeStep(input, step, resumeInput, eventId);
      const ctx = this.buildResumeContext(resumeInput, stateId);
      const result = await step.run(ctx);

      if (result.kind === "wait") {
        this.waitResumeStep(input, step, stateId, result.output, result.waitFor, eventId);
        this.finishResume(input, "waiting", step.stepId, null, eventId);
        return { status: "waiting" };
      }
      if (result.kind === "fail") {
        this.failResumeStep(input, step, stateId, result.error, eventId);
        this.finishResume(input, "failed", step.stepId, result.error, eventId);
        return { status: "failed" };
      }
      if (result.kind === "complete") {
        this.succeedResumeStep(input, step, stateId, result.output, eventId);
        this.finishResume(input, "succeeded", null, null, eventId);
        return { status: "succeeded" };
      }

      this.succeedResumeStep(input, step, stateId, result.output, eventId);
    }

    this.finishResume(input, "succeeded", null, null, eventId);
    return { status: "succeeded" };
  }

  private validateSignal(condition: { kind: string; action?: string; callbackType?: string }, signal: WorkflowSignal): void {
    if (condition.kind !== signal.kind) {
      throw new Error(
        `signal kind mismatch: expected ${condition.kind}, got ${signal.kind}`
      );
    }
    if (condition.kind === "control_action" && condition.action && signal.payload.action !== condition.action) {
      throw new Error(
        `signal action mismatch: expected ${condition.action}, got ${signal.payload.action}`
      );
    }
    if (condition.kind === "external_callback" && condition.callbackType && signal.payload.callbackType !== condition.callbackType) {
      throw new Error(
        `signal callbackType mismatch: expected ${condition.callbackType}, got ${signal.payload.callbackType}`
      );
    }
  }

  private buildResumeInput(
    input: { workflowInstanceId: string; runAttemptId: string; workspaceId: string; now: string },
    _stepId: string,
    previousOutput: unknown,
    signal: WorkflowSignal
  ): WorkflowRuntimeStartInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      runAttemptId: input.runAttemptId,
      workspaceId: input.workspaceId,
      projectId: null,
      definitionId: "",
      input: { previousOutput, signal: signal.payload },
      now: input.now
    };
  }

  private buildResumeContext(
    input: WorkflowRuntimeStartInput,
    stepStateId: string
  ): WorkflowStepContext {
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
      },
      memory: this.memoryService
        ? {
            searchActive: (params: MemorySearchParams) =>
              this.memoryService!.searchActive(params)
          }
        : undefined
    };
  }

  // Resume-specific step helpers

  private startResumeStep(
    input: { workflowInstanceId: string; runAttemptId: string; now: string },
    step: WorkflowStep,
    resumeInput: WorkflowRuntimeStartInput,
    eventId: (suffix: string) => string
  ): string {
    const stateId = `${input.runAttemptId}:step:${step.stepId}`;
    this.store.createStepState({
      id: stateId,
      workflowInstanceId: input.workflowInstanceId,
      runAttemptId: input.runAttemptId,
      stepId: step.stepId,
      status: "running",
      input: resumeInput.input,
      now: input.now
    });
    this.appendResumeEvent(input, eventId(`step-started-${step.stepId}`), "step.started", { stepId: step.stepId }, stateId);
    return stateId;
  }

  private succeedResumeStep(
    input: { workflowInstanceId: string; runAttemptId: string; now: string },
    step: WorkflowStep,
    stateId: string,
    output: unknown,
    eventId: (suffix: string) => string
  ): void {
    this.store.updateStepState({ id: stateId, status: "succeeded", output, waitCondition: null, error: null, now: input.now });
    this.appendResumeEvent(input, eventId(`step-succeeded-${step.stepId}`), "step.succeeded", { stepId: step.stepId }, stateId);
  }

  private waitResumeStep(
    input: { workflowInstanceId: string; runAttemptId: string; now: string },
    step: WorkflowStep,
    stateId: string,
    output: unknown,
    waitCondition: Parameters<RuntimeStore["updateStepState"]>[0]["waitCondition"],
    eventId: (suffix: string) => string
  ): void {
    this.store.updateStepState({ id: stateId, status: "waiting", output, waitCondition, error: null, now: input.now });
    this.appendResumeEvent(input, eventId(`step-waiting-${step.stepId}`), "step.waiting", { stepId: step.stepId }, stateId);
  }

  private failResumeStep(
    input: { workflowInstanceId: string; runAttemptId: string; now: string },
    step: WorkflowStep,
    stateId: string,
    error: RuntimeError,
    eventId: (suffix: string) => string
  ): void {
    this.store.updateStepState({ id: stateId, status: "failed", output: undefined, waitCondition: null, error, now: input.now });
    this.appendResumeEvent(input, eventId(`step-failed-${step.stepId}`), "step.failed", { stepId: step.stepId, errorCode: error.code }, stateId);
  }

  private finishResume(
    input: { workflowInstanceId: string; runAttemptId: string; now: string },
    status: "succeeded" | "failed" | "waiting",
    currentStepId: string | null,
    error: RuntimeError | null,
    eventId: (suffix: string) => string
  ): void {
    this.store.finishRunAttempt({ id: input.runAttemptId, status, error, now: input.now });
    this.store.updateWorkflowInstanceStatus({ id: input.workflowInstanceId, status, currentStepId, now: input.now });
    const attemptEvent = status === "succeeded" ? "attempt.completed" : `attempt.${status}`;
    const attemptEventId = status === "succeeded" ? "attempt-completed" : `attempt-${status}`;
    this.appendResumeEvent(input, eventId(attemptEventId), attemptEvent, {});
    this.appendResumeEvent(input, eventId("workflow-state-changed"), "workflow_instance.state_changed", { status });
  }

  private appendResumeEvent(
    input: { workflowInstanceId: string; runAttemptId: string; workspaceId?: string; now: string },
    id: string,
    type: string,
    payload: unknown,
    stepStateId: string | null = null
  ): void {
    this.store.appendRuntimeEvent({
      id,
      workspaceId: input.workspaceId ?? "",
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
