import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DedupStore } from "../../src/scheduler/dedup-store.js";

describe("DedupStore", () => {
  it("marks a condition once per local date and clears all marks when the date changes", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-dedup-"));
    const store = await DedupStore.load(home);

    await expect(store.checkAndMark("task", "sh600519:stop", "2026-05-18")).resolves.toBe(true);
    await expect(store.checkAndMark("task", "sh600519:stop", "2026-05-18")).resolves.toBe(false);
    await expect(store.checkAndMark("task", "sh600519:stop", "2026-05-19")).resolves.toBe(true);
  });
});
