import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { PendingInteractionStore } from "../../src/workbench/pending-interaction-store.js";

describe("PendingInteractionStore", () => {
  let home: string;
  let db: RuntimeDb;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-pending-interaction-"));
    db = openRuntimeDb(join(home, "feegle.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(home, { recursive: true, force: true });
  });

  it("takes a pending interaction once and deletes it transactionally", () => {
    const store = new PendingInteractionStore(db, () => new Date("2026-05-21T00:00:00.000Z"));
    store.put({
      interactionId: "pi_1",
      chatId: "oc_1",
      messageId: "om_1",
      kind: "directory_setup",
      payload: { sessionKey: "feishu:oc_1:channel", userText: "inspect repo" },
      expiresAt: "2026-05-22T00:00:00.000Z"
    });

    expect(store.take("pi_1")).toMatchObject({
      interactionId: "pi_1",
      payload: { sessionKey: "feishu:oc_1:channel", userText: "inspect repo" }
    });
    expect(store.take("pi_1")).toBeUndefined();
  });

  it("deletes expired interactions", () => {
    const store = new PendingInteractionStore(db, () => new Date("2026-05-21T00:00:00.000Z"));
    store.put({
      interactionId: "pi_old",
      chatId: "oc_1",
      messageId: "om_1",
      kind: "directory_setup",
      payload: {},
      expiresAt: "2026-05-20T00:00:00.000Z"
    });

    expect(store.deleteExpired("2026-05-21T00:00:00.000Z")).toBe(1);
    expect(store.take("pi_old")).toBeUndefined();
  });
});
