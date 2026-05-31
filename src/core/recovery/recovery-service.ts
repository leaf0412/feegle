import type { ArtifactRecord } from "../artifacts/artifact-models.js";
import type { ArtifactService } from "../artifacts/artifact-service.js";
import type { ArtifactStore } from "../artifacts/artifact-store.js";
import type { DiagnosticBundle } from "../diagnostics/diagnostic-bundle.js";
import type { MemoryStore } from "../memory/memory-store.js";
import type { RuntimeError } from "../runtime/runtime-models.js";
import type { RuntimeStore } from "../runtime/runtime-store.js";

export class RecoveryService {
  constructor(
    private readonly artifacts: ArtifactService,
    private readonly runtimeStore: RuntimeStore,
    private readonly artifactStore: ArtifactStore,
    private readonly memoryStore: MemoryStore
  ) {}

  async createDiagnosticBundle(input: {
    artifactId: string;
    workspaceId: string;
    workflowInstanceId?: string;
    runAttemptId?: string;
    error: RuntimeError;
    now: string;
  }): Promise<ArtifactRecord> {
    const timeline: Array<{ at: string; type: string; summary: string }> = [];
    const failedEffects: Array<{ effectExecutionId: string; pluginId: string; effectType: string; error: RuntimeError | null; idempotencyKey: string | null }> = [];
    let statusSnapshot: Record<string, unknown> = {};

    if (input.workflowInstanceId) {
      const instance = this.runtimeStore.getWorkflowInstance(input.workflowInstanceId);
      statusSnapshot.workflowInstance = instance ? {
        id: instance.id,
        status: instance.status,
        currentStepId: instance.currentStepId,
        definitionId: instance.definitionId
      } : null;

      const events = this.runtimeStore.listRuntimeEvents(input.workflowInstanceId);
      for (const event of events) {
        timeline.push({
          at: "" /* events don't have timestamps in current schema */,
          type: event.type,
          summary: typeof event.payload === "object" ? JSON.stringify(event.payload) : String(event.payload)
        });
      }
    }

    if (input.runAttemptId) {
      const attempt = this.runtimeStore.getRunAttempt(input.runAttemptId);
      statusSnapshot.runAttempt = attempt ? {
        id: attempt.id,
        status: attempt.status
      } : null;

      const effects = this.runtimeStore.listEffectExecutions(input.runAttemptId);
      for (const effect of effects) {
        if (effect.status === "failed") {
          failedEffects.push({
            effectExecutionId: effect.id,
            pluginId: effect.pluginId,
            effectType: effect.effectType,
            error: effect.error,
            idempotencyKey: effect.idempotencyKey
          });
        }
      }
    }

    const relatedArtifactIds: string[] = [];
    if (input.runAttemptId) {
      const runArtifacts = this.artifactStore.listByRun(input.workspaceId, input.runAttemptId);
      runArtifacts.forEach((a) => relatedArtifactIds.push(a.id));
    }
    if (input.workflowInstanceId) {
      const wfArtifacts = this.artifactStore.listByWorkflow(input.workspaceId, input.workflowInstanceId);
      for (const a of wfArtifacts) {
        if (!relatedArtifactIds.includes(a.id)) {
          relatedArtifactIds.push(a.id);
        }
      }
    }

    const memoryRecords = this.memoryStore.listActive(input.workspaceId);
    const relatedMemory = memoryRecords.map((m) => m.id);

    const bundle: DiagnosticBundle = {
      target: {
        workflowInstanceId: input.workflowInstanceId,
        runAttemptId: input.runAttemptId
      },
      statusSnapshot,
      error: input.error,
      timeline,
      failedEffects,
      relatedArtifacts: relatedArtifactIds,
      relatedMemory,
      environmentSummary: {
        generatedAt: input.now,
        nodeVersion: process.version,
        platform: process.platform
      }
    };

    return this.artifacts.writeTextArtifact({
      artifactId: input.artifactId,
      workspaceId: input.workspaceId,
      runAttemptId: input.runAttemptId ?? null,
      kind: "diagnostic_bundle",
      fileName: `${input.artifactId}.json`,
      content: JSON.stringify(bundle, null, 2),
      now: input.now
    });
  }
}
