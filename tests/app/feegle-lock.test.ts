import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireFeegleLock } from "@infra/app/feegle-lock.js";

describe("acquireFeegleLock", () => {
  it("prevents two app instances from sharing the same state directory", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-lock-"));
    const release = await acquireFeegleLock(home);

    await expect(acquireFeegleLock(home)).rejects.toThrow(/Another feegle instance is running/);

    await release();
  });
});
