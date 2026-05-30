import type { IntentResolverRegistry } from "./intent-resolver-registry.js";
import type { TriggerEvent } from "./trigger-event.js";
import type { WorkflowSelector } from "./workflow-selector.js";

export interface IngressWorkflowRuntime {
  start(input: {
    workflowInstanceId: string;
    runAttemptId: string;
    workspaceId: string;
    projectId: string | null;
    definitionId: string;
    input: unknown;
    now: string;
  }): Promise<{ status: "succeeded" | "failed" | "waiting" }>;
}

export class IngressDispatcher {
  constructor(
    private readonly deps: {
      intentResolvers: IntentResolverRegistry;
      workflowSelector: WorkflowSelector;
      workflowRuntime: IngressWorkflowRuntime;
      idFactory: { workflowInstanceId(): string; runAttemptId(): string };
      clock: { nowIso(): string };
    }
  ) {}

  async dispatch(event: TriggerEvent): Promise<{ status: "succeeded" | "failed" | "waiting" }> {
    const intent = await this.deps.intentResolvers.resolve(event);
    const selected = this.deps.workflowSelector.select(intent);
    return this.deps.workflowRuntime.start({
      workflowInstanceId: this.deps.idFactory.workflowInstanceId(),
      runAttemptId: this.deps.idFactory.runAttemptId(),
      workspaceId: intent.workspaceId,
      projectId: intent.projectId,
      definitionId: selected.definitionId,
      input: intent.payload,
      now: this.deps.clock.nowIso()
    });
  }
}
