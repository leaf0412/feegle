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
