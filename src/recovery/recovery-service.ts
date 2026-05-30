import type { ArtifactRecord } from "../artifacts/artifact-models.js";
import type { ArtifactService } from "../artifacts/artifact-service.js";
import type { DiagnosticBundle } from "../diagnostics/diagnostic-bundle.js";
import type { RuntimeError } from "../runtime/runtime-models.js";

export class RecoveryService {
  constructor(private readonly artifacts: ArtifactService) {}

  async createDiagnosticBundle(input: {
    artifactId: string;
    workspaceId: string;
    workflowInstanceId?: string;
    runAttemptId?: string;
    error: RuntimeError;
    now: string;
  }): Promise<ArtifactRecord> {
    const bundle: DiagnosticBundle = {
      target: {
        workflowInstanceId: input.workflowInstanceId,
        runAttemptId: input.runAttemptId
      },
      statusSnapshot: {},
      error: input.error,
      timeline: [],
      failedEffects: [],
      relatedArtifacts: [],
      relatedMemory: [],
      environmentSummary: { generatedAt: input.now }
    };

    return this.artifacts.writeTextArtifact({
      artifactId: input.artifactId,
      workspaceId: input.workspaceId,
      runAttemptId: input.runAttemptId,
      kind: "diagnostic_bundle",
      fileName: `${input.artifactId}.json`,
      content: JSON.stringify(bundle, null, 2),
      now: input.now
    });
  }
}
