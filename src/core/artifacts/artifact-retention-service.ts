import { unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { ArtifactStore } from "./artifact-store.js";

export class ArtifactRetentionService {
  constructor(private readonly store: ArtifactStore) {}

  pin(id: string, now: string): void {
    this.store.pin(id, now);
  }

  unpin(id: string, now: string): void {
    this.store.unpin(id, now);
  }

  /**
   * Mark expired artifacts as `expired` and clear their payload files.
   * Keeps metadata (kind, workspace, timestamps) for audit trail.
   * Pinned artifacts are never expired.
   */
  async deleteExpired(now: string): Promise<number> {
    const candidates = this.store.listExpired(now);
    let expired = 0;

    for (const artifact of candidates) {
      // Pinned artifacts bypass retention deletion
      if (artifact.pinned) continue;

      try {
        if (existsSync(artifact.filePath)) {
          await unlink(artifact.filePath);
        }
      } catch {
        // File already gone — proceed with marking expired
      }

      this.store.markExpired(artifact.id, now);
      expired++;
    }

    return expired;
  }

  /**
   * Permanently remove artifacts that have been expired/deleted and no longer
   * have any associated RuntimeEvent summaries. This is the final cleanup pass
   * after `deleteExpired` has run; it only targets artifacts whose
   * workflow/run events have also been cleaned up.
   */
  async purgeOrphaned(): Promise<number> {
    const orphaned = this.store.listOrphaned();
    let purged = 0;

    for (const artifact of orphaned) {
      try {
        if (existsSync(artifact.filePath)) {
          await unlink(artifact.filePath);
        }
      } catch {
        // File already gone — proceed
      }

      this.store.deletePermanently(artifact.id);
      purged++;
    }

    return purged;
  }

  /**
   * Legacy: purge expired unpinned artifacts (hard file delete + markDeleted).
   * Prefer `deleteExpired` for safe tombstoning that preserves metadata.
   */
  async purgeExpired(now: string): Promise<number> {
    const expired = this.store.listExpiredUnpinned(now);
    let purged = 0;

    for (const artifact of expired) {
      try {
        if (existsSync(artifact.filePath)) {
          await unlink(artifact.filePath);
        }
        this.store.markDeleted(artifact.id, now);
        purged++;
      } catch {
        // File missing or locked — mark as deleted anyway
        this.store.markDeleted(artifact.id, now);
        purged++;
      }
    }

    return purged;
  }
}
