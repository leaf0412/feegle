import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ArtifactKind, ArtifactRecord } from "./artifact-models.js";
import { defaultRetentionDays } from "./artifact-models.js";
import type { ArtifactStore } from "./artifact-store.js";
import { redactSensitive } from "../security/redaction.js";

export class ArtifactService {
  constructor(
    private readonly store: ArtifactStore,
    private readonly rootDirectory: string
  ) {}

  async writeTextArtifact(input: {
    artifactId: string;
    workspaceId: string;
    workflowInstanceId?: string | null;
    runAttemptId?: string | null;
    kind: ArtifactKind;
    fileName: string;
    content: string;
    now: string;
  }): Promise<ArtifactRecord> {
    const workspaceDir = join(this.rootDirectory, input.workspaceId);
    await mkdir(workspaceDir, { recursive: true });
    const filePath = join(workspaceDir, input.fileName);
    const safeContent = redactSensitive(input.content);
    await writeFile(filePath, safeContent, "utf8");

    const record: ArtifactRecord = {
      id: input.artifactId,
      workspaceId: input.workspaceId,
      workflowInstanceId: input.workflowInstanceId ?? null,
      runAttemptId: input.runAttemptId ?? null,
      kind: input.kind,
      filePath,
      contentType: "text/plain; charset=utf-8",
      summary: { bytes: Buffer.byteLength(input.content) },
      retentionDays: defaultRetentionDays(input.kind),
      pinned: false,
      createdAt: input.now,
      updatedAt: input.now
    };

    this.store.insert(record);
    return record;
  }
}
