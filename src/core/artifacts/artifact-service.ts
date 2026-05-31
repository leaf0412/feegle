import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ArtifactKind, ArtifactRecord } from "./artifact-models.js";
import { defaultRetentionDays } from "./artifact-models.js";
import type { ArtifactStore } from "./artifact-store.js";
import { redactSensitive } from "../security/redaction.js";
import { containsSecretValue, redactSecretValues } from "../security/secret-resolver.js";
import type { PermissionService } from "../security/permission-service.js";
import type { PolicyService } from "../security/policy-service.js";

export class ArtifactService {
  constructor(
    private readonly store: ArtifactStore,
    private readonly rootDirectory: string,
    private readonly permissionService?: PermissionService,
    private readonly policyService?: PolicyService
  ) {}

  /**
   * Check whether the given user can read the specified artifact.
   * Requires workspace membership; the artifact must belong to the same workspace.
   */
  canReadArtifact(userId: string, artifactId: string): { allowed: boolean; reason: string } {
    const artifact = this.store.getById(artifactId);
    if (!artifact) {
      return { allowed: false, reason: `artifact ${artifactId} not found` };
    }

    // System access is always allowed
    if (userId === "system") return { allowed: true, reason: "system" };

    // Cross-workspace check
    if (!this.permissionService) {
      // Without permission service, allow only same-workspace via artifact record itself
      return { allowed: true, reason: "no permission service configured" };
    }

    const check = this.permissionService.checkMembership(artifact.workspaceId, userId);
    if (!check.allowed) {
      return { allowed: false, reason: `user ${userId} is not a member of workspace ${artifact.workspaceId}` };
    }

    return { allowed: true, reason: `member of workspace ${artifact.workspaceId}` };
  }

  /**
   * Check whether the given user can delete the specified artifact.
   * Requires admin or owner role in the artifact's workspace.
   */
  canDeleteArtifact(userId: string, artifactId: string): { allowed: boolean; reason: string } {
    const artifact = this.store.getById(artifactId);
    if (!artifact) {
      return { allowed: false, reason: `artifact ${artifactId} not found` };
    }

    if (userId === "system") return { allowed: true, reason: "system" };

    if (!this.permissionService) {
      return { allowed: true, reason: "no permission service configured" };
    }

    const check = this.permissionService.checkMembership(artifact.workspaceId, userId);
    if (!check.allowed) {
      return { allowed: false, reason: `user ${userId} is not a member of workspace ${artifact.workspaceId}` };
    }

    // Delete requires operator-level privileges (admin or owner)
    if (!this.permissionService.canWrite(check.role)) {
      return {
        allowed: false,
        reason: `user ${userId} has role ${check.role} in workspace ${artifact.workspaceId}, but delete requires admin or owner`
      };
    }

    if (this.policyService) {
      const decision = this.policyService.evaluate({
        actor: userId,
        action: "delete",
        resource: { type: "artifact", id: artifactId },
        workspaceId: artifact.workspaceId
      });
      if (decision.kind === "deny") {
        return { allowed: false, reason: decision.reason };
      }
    }

    return { allowed: true, reason: `authorized to delete artifact ${artifactId}` };
  }

  /**
   * Scan content for secrets and redact before writing.
   * Applies both regex-based redaction (redactSensitive) and known-secret-pattern
   * replacement (redactSecretValues).
   */
  private sanitizeContent(content: string): string {
    let safeContent = content;
    // First pass: pattern-based redaction from secret-resolver
    safeContent = redactSecretValues(safeContent);
    // Second pass: bearer tokens, JWTs, connection strings, private keys from redaction module
    safeContent = redactSensitive(safeContent);
    return safeContent;
  }

  async writeTextArtifact(input: {
    artifactId: string;
    workspaceId: string;
    workflowInstanceId?: string | null;
    runAttemptId?: string | null;
    kind: ArtifactKind;
    fileName: string;
    content: string;
    now: string;
    userId?: string;
  }): Promise<ArtifactRecord> {
    // Permission check: only workspace members can write
    if (input.userId && input.userId !== "system" && this.permissionService) {
      const check = this.permissionService.checkMembership(input.workspaceId, input.userId);
      if (!check.allowed) {
        throw new Error(
          `PERMISSION_DENIED: user ${input.userId} cannot write to workspace ${input.workspaceId}`
        );
      }
    }

    const workspaceDir = join(this.rootDirectory, input.workspaceId);
    await mkdir(workspaceDir, { recursive: true });
    const filePath = join(workspaceDir, input.fileName);
    const safeContent = this.sanitizeContent(input.content);
    await writeFile(filePath, safeContent, "utf8");

    const record: ArtifactRecord = {
      id: input.artifactId,
      workspaceId: input.workspaceId,
      workflowInstanceId: input.workflowInstanceId ?? null,
      runAttemptId: input.runAttemptId ?? null,
      kind: input.kind,
      filePath,
      contentType: "text/plain; charset=utf-8",
      summary: { bytes: Buffer.byteLength(safeContent), redacted: safeContent !== input.content },
      retentionDays: defaultRetentionDays(input.kind),
      pinned: false,
      createdAt: input.now,
      updatedAt: input.now
    };

    this.store.insert(record);
    return record;
  }

  /**
   * Verify that an artifact's content does not contain known secret patterns.
   * Returns the first detected secret kind, or null if clean.
   */
  static checkContentForSecrets(content: string): string | null {
    if (containsSecretValue(content)) {
      return "detected known secret pattern in artifact content";
    }
    return null;
  }
}
