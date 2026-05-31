import type { RuntimeStore } from "./runtime-store.js";
import type { EffectHandlerRegistry } from "./effect-handler-registry.js";
import type { RuntimeError } from "./runtime-models.js";
import type { PolicyService } from "../security/policy-service.js";

export interface EffectExecutionInput {
  effectId: string;
  pluginId: string;
  effectType: string;
  input: unknown;
  idempotencyKey?: string;
  workspaceId: string;
  workflowInstanceId: string;
  runAttemptId: string;
  stepStateId: string;
  now: string;
  actor?: string;
}

function normalizeError(cause: unknown): RuntimeError {
  if (cause instanceof Error) {
    return {
      code: "EFFECT_FAILED",
      category: "capability",
      message: cause.message,
      retryable: false,
      recoverable: true,
      stack: cause.stack
    };
  }
  return {
    code: "EFFECT_FAILED",
    category: "capability",
    message: String(cause),
    retryable: false,
    recoverable: true
  };
}

export class RuntimeEffectExecutor {
  private readonly policyService?: PolicyService;

  constructor(
    private readonly store: RuntimeStore,
    private readonly handlers: EffectHandlerRegistry,
    policyService?: PolicyService
  ) {
    this.policyService = policyService;
  }

  async execute(input: EffectExecutionInput): Promise<unknown> {
    if (input.idempotencyKey) {
      const existing = this.store.getEffectExecutionByIdempotencyKey(input.idempotencyKey);
      if (existing?.status === "succeeded") {
        return existing.outputSummary;
      }
    }

    this.store.createEffectExecution({
      id: input.effectId,
      runAttemptId: input.runAttemptId,
      stepStateId: input.stepStateId,
      pluginId: input.pluginId,
      effectType: input.effectType,
      status: "running",
      idempotencyKey: input.idempotencyKey ?? null,
      inputSummary: input.input,
      now: input.now
    });

    this.appendEvent(input, "effect.started", {
      effectId: input.effectId,
      pluginId: input.pluginId,
      effectType: input.effectType
    });

    // Policy check: deny effect execution if actor lacks permission
    if (this.policyService && input.actor) {
      const policy = this.policyService.evaluate({
        actor: input.actor,
        action: "effect.execute",
        resource: { type: "effect", id: input.effectId },
        workspaceId: input.workspaceId
      });
      if (policy.kind === "deny") {
        const deniedError: RuntimeError = {
          code: "PERMISSION_DENIED",
          category: "permission",
          message: `effect execution denied by policy: ${policy.reason}`,
          retryable: false,
          recoverable: false,
          evidence: { policyReason: policy.reason }
        };
        this.store.updateEffectExecution({
          id: input.effectId,
          status: "failed",
          outputSummary: null,
          error: deniedError,
          now: input.now
        });
        this.appendEvent(input, "effect.failed", {
          effectId: input.effectId,
          pluginId: input.pluginId,
          effectType: input.effectType,
          errorCode: deniedError.code
        });
        throw deniedError;
      }
    }

    if (!this.handlers.has(input.pluginId, input.effectType)) {
      const notFoundError: RuntimeError = {
        code: "EFFECT_HANDLER_NOT_FOUND",
        category: "capability",
        message: `No effect handler registered: ${input.pluginId}:${input.effectType}`,
        retryable: false,
        recoverable: false
      };

      this.store.updateEffectExecution({
        id: input.effectId,
        status: "failed",
        outputSummary: null,
        error: notFoundError,
        now: input.now
      });

      this.appendEvent(input, "effect.failed", {
        effectId: input.effectId,
        pluginId: input.pluginId,
        effectType: input.effectType,
        errorCode: notFoundError.code
      });

      throw notFoundError;
    }

    try {
      const result = await this.handlers.execute({
        effectId: input.effectId,
        pluginId: input.pluginId,
        effectType: input.effectType,
        input: input.input
      });

      this.store.updateEffectExecution({
        id: input.effectId,
        status: "succeeded",
        outputSummary: result,
        error: null,
        now: input.now
      });

      this.appendEvent(input, "effect.succeeded", {
        effectId: input.effectId,
        pluginId: input.pluginId,
        effectType: input.effectType
      });

      return result;
    } catch (error) {
      const normalized: RuntimeError =
        error && typeof error === "object" && "code" in error && "category" in error
          ? (error as RuntimeError)
          : normalizeError(error);

      this.store.updateEffectExecution({
        id: input.effectId,
        status: "failed",
        outputSummary: null,
        error: normalized,
        now: input.now
      });

      this.appendEvent(input, "effect.failed", {
        effectId: input.effectId,
        pluginId: input.pluginId,
        effectType: input.effectType,
        errorCode: normalized.code
      });

      throw normalized;
    }
  }

  private appendEvent(
    input: EffectExecutionInput,
    type: string,
    payload: unknown
  ): void {
    this.store.appendRuntimeEvent({
      id: `${input.runAttemptId}:effect:${input.effectId}:${type.split(".")[1]}`,
      workspaceId: input.workspaceId,
      workflowInstanceId: input.workflowInstanceId,
      runAttemptId: input.runAttemptId,
      stepStateId: input.stepStateId,
      effectExecutionId: input.effectId,
      category: "required",
      type,
      payload,
      now: input.now
    });
  }
}
