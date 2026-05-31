import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import lockfile from "proper-lockfile";

export async function acquireFeegleLock(feegleHome: string): Promise<() => Promise<void>> {
  const lockfilePath = join(feegleHome, ".locks", "feegle");
  await mkdir(join(feegleHome, ".locks"), { recursive: true });
  try {
    return await lockfile.lock(lockfilePath, {
      retries: 0,
      realpath: false,
      stale: 30_000
    });
  } catch (error) {
    if (isNodeError(error) && error.code === "ELOCKED") {
      throw new Error(
        `Another feegle instance is running (lockfile: ${lockfilePath}). ` +
          "If you're sure no other process holds the lock, remove the file and retry."
      );
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
