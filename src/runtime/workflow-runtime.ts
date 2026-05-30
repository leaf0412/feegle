import type { RuntimeStore } from "./runtime-store.js";
import type { WorkflowRegistry } from "./workflow-registry.js";

export class WorkflowRuntime {
  constructor(
    private readonly store: RuntimeStore,
    private readonly registry: WorkflowRegistry
  ) {}

  async start(input: {
    workflowInstanceId: string;
    runAttemptId: string;
    workspaceId: string;
    projectId: string | null;
    definitionId: string;
    input: unknown;
    now: string;
  }): Promise<{ status: "succeeded" | "failed" | "waiting" }> {
    const definition = this.registry.require(input.definitionId);
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
    this.store.createRunAttempt({
      id: input.runAttemptId,
      workflowInstanceId: input.workflowInstanceId,
      status: "running",
      triggerEventId: null,
      now: input.now
    });

    for (const step of definition.steps) {
      const result = await step.run({
        workflowInstanceId: input.workflowInstanceId,
        runAttemptId: input.runAttemptId,
        input: input.input
      });

      if (result.kind === "wait") {
        return { status: "waiting" };
      }
      if (result.kind === "fail") {
        return { status: "failed" };
      }
      if (result.kind === "complete") {
        return { status: "succeeded" };
      }
    }

    return { status: "succeeded" };
  }
}
