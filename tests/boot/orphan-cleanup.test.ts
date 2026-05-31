import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteOrphanWorkspacesJson } from "@infra/boot/phases/stores-phase.js";

describe("deleteOrphanWorkspacesJson", () => {
  let home: string;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-orphan-"));
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(async () => {
    infoSpy.mockRestore();
    await rm(home, { recursive: true, force: true });
  });

  it("deletes workspaces.json when present so the orphan file does not accumulate on old installs", async () => {
    const filePath = join(home, "workspaces.json");
    await writeFile(filePath, JSON.stringify({ workspaces: [] }), "utf8");

    deleteOrphanWorkspacesJson(home);

    expect(existsSync(filePath)).toBe(false);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("workspaces.json")
    );
  });

  it("is a no-op when workspaces.json is absent so first-run and already-cleaned installs do not throw", () => {
    expect(() => deleteOrphanWorkspacesJson(home)).not.toThrow();
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
