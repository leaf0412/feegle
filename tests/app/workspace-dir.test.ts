import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWorkspaceDir } from "../../src/app/workspace-dir.js";

describe("resolveWorkspaceDir", () => {
  it("defaults to <home>/workspace and creates it so chats always have a cwd", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-ws-"));
    try {
      const dir = resolveWorkspaceDir(home, undefined);
      expect(dir).toBe(join(home, "workspace"));
      expect((await stat(dir)).isDirectory()).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("uses config.defaultWorkspace (absolute) when provided, and creates it", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-ws-"));
    const custom = join(home, "custom-ws");
    try {
      const dir = resolveWorkspaceDir(home, custom);
      expect(dir).toBe(custom);
      expect((await stat(dir)).isDirectory()).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
