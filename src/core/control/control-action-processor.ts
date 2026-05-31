import type { ControlActionStore } from "./control-action-store.js";
import type { RuntimeError } from "../runtime/runtime-models.js";
import { parsePayload } from "./control-action-models.js";

export interface ApproveStepHandler {
  approveStep(payload: { stepStateId: string; comment?: string }): Promise<{ status: "completed" }>;
}

export interface RejectStepHandler {
  rejectStep(payload: { stepStateId: string; reason: string }): Promise<{ status: "completed" }>;
}

export interface ResumeWorkflowHandler {
  resumeWorkflow(payload: { workflowInstanceId: string }): Promise<{ status: "completed" }>;
}

export interface CancelWorkflowHandler {
  cancelWorkflow(payload: { workflowInstanceId: string; reason?: string }): Promise<{ status: "completed" }>;
}

export interface TriggerRecoveryHandler {
  triggerRecovery(payload: { workflowInstanceId: string; runAttemptId: string }): Promise<{ status: "completed" }>;
}

export interface ConfirmMemoryHandler {
  confirmMemory(payload: { memoryId: string }): Promise<{ status: "completed" }>;
}

export interface DeleteMemoryHandler {
  deleteMemory(payload: { memoryId: string }): Promise<{ status: "completed" }>;
}

export interface ControlActionHandlers {
  approveStep?: ApproveStepHandler;
  rejectStep?: RejectStepHandler;
  resumeWorkflow?: ResumeWorkflowHandler;
  cancelWorkflow?: CancelWorkflowHandler;
  triggerRecovery?: TriggerRecoveryHandler;
  confirmMemory?: ConfirmMemoryHandler;
  deleteMemory?: DeleteMemoryHandler;
}

export interface ControlEventSink {
  emit(input: {
    id: string;
    workspaceId: string;
    workflowInstanceId: string | null;
    runAttemptId: string | null;
    stepStateId: string | null;
    effectExecutionId: string | null;
    category: string;
    type: string;
    payload: unknown;
    now: string;
  }): void;
}

export class ControlActionProcessor {
  constructor(
    private readonly store: ControlActionStore,
    private readonly handlers: ControlActionHandlers,
    private readonly eventSink: ControlEventSink
  ) {}

  async process(actionId: string, now: string): Promise<{ status: "completed" | "failed"; error?: RuntimeError }> {
    const action = this.store.getById(actionId);
    if (!action) {
      return { status: "failed", error: { code: "CONTROL_ACTION_NOT_FOUND", category: "routing", message: `control action not found: ${actionId}`, retryable: false, recoverable: false } };
    }
    if (action.status !== "pending") {
      return { status: action.status };
    }

    const parsed = parsePayload(action.actionType, action.payload);
    if (!parsed.ok) {
      this.store.updateStatus({ id: actionId, status: "failed", errorMessage: parsed.error, now });
      this.emitEvent(action, "control_action.processing_failed", { error: parsed.error }, now);
      return { status: "failed", error: { code: "CONTROL_ACTION_INVALID_PAYLOAD", category: "validation", message: parsed.error, retryable: false, recoverable: false } };
    }

    this.emitEvent(action, "control_action.processing_started", { actionType: action.actionType }, now);

    try {
      await this.dispatchHandler(action.actionType, parsed.value, action.workspaceId);

      this.store.updateStatus({ id: actionId, status: "completed", errorMessage: null, now });
      this.emitEvent(action, "control_action.completed", { actionType: action.actionType }, now);
      return { status: "completed" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.updateStatus({ id: actionId, status: "failed", errorMessage: message, now });
      this.emitEvent(action, "control_action.failed", { actionType: action.actionType, error: message }, now);
      return {
        status: "failed",
        error: {
          code: "CONTROL_ACTION_EXECUTION_FAILED",
          category: "capability",
          message,
          retryable: false,
          recoverable: false
        }
      };
    }
  }

  private async dispatchHandler(actionType: string, payload: unknown, _workspaceId: string): Promise<void> {
    switch (actionType) {
      case "approve_step": {
        if (!this.handlers.approveStep) throw new Error("approve_step handler not wired");
        await this.handlers.approveStep.approveStep(payload as { stepStateId: string; comment?: string });
        return;
      }
      case "reject_step": {
        if (!this.handlers.rejectStep) throw new Error("reject_step handler not wired");
        await this.handlers.rejectStep.rejectStep(payload as { stepStateId: string; reason: string });
        return;
      }
      case "resume_workflow": {
        if (!this.handlers.resumeWorkflow) throw new Error("resume_workflow handler not wired");
        await this.handlers.resumeWorkflow.resumeWorkflow(payload as { workflowInstanceId: string });
        return;
      }
      case "cancel_workflow": {
        if (!this.handlers.cancelWorkflow) throw new Error("cancel_workflow handler not wired");
        await this.handlers.cancelWorkflow.cancelWorkflow(payload as { workflowInstanceId: string; reason?: string });
        return;
      }
      case "trigger_recovery": {
        if (!this.handlers.triggerRecovery) throw new Error("trigger_recovery handler not wired");
        await this.handlers.triggerRecovery.triggerRecovery(
          payload as { workflowInstanceId: string; runAttemptId: string }
        );
        return;
      }
      case "confirm_memory": {
        if (!this.handlers.confirmMemory) throw new Error("confirm_memory handler not wired");
        await this.handlers.confirmMemory.confirmMemory(payload as { memoryId: string });
        return;
      }
      case "delete_memory": {
        if (!this.handlers.deleteMemory) throw new Error("delete_memory handler not wired");
        await this.handlers.deleteMemory.deleteMemory(payload as { memoryId: string });
        return;
      }
      default:
        throw new Error(`unknown action type: ${actionType}`);
    }
  }

  private emitEvent(
    action: { id: string; workspaceId: string },
    type: string,
    payload: unknown,
    now: string
  ): void {
    this.eventSink.emit({
      id: `${action.id}:${type.replace(/\./g, "_")}`,
      workspaceId: action.workspaceId,
      workflowInstanceId: null,
      runAttemptId: null,
      stepStateId: null,
      effectExecutionId: null,
      category: "diagnostic",
      type,
      payload,
      now
    });
  }
}
