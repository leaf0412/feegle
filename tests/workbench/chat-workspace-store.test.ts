import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { ChatWorkspaceStore } from "../../src/workbench/chat-workspace-store.js";

describe("ChatWorkspaceStore", () => {
  let home: string;
  let db: RuntimeDb;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-chat-workspace-"));
    db = openRuntimeDb(join(home, "feegle.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(home, { recursive: true, force: true });
  });

  it("upserts and retrieves a group workspace binding", () => {
    const store = new ChatWorkspaceStore(db, () => new Date("2026-05-21T00:00:00.000Z"));

    store.upsert({
      chatId: "oc_1",
      workspacePath: "/repo/feegle",
      defaultProvider: "codex",
      updatedBy: "ou_owner"
    });

    expect(store.get("oc_1")).toEqual({
      chatId: "oc_1",
      workspacePath: "/repo/feegle",
      defaultProvider: "codex",
      updatedBy: "ou_owner",
      updatedAt: "2026-05-21T00:00:00.000Z"
    });
  });
});
