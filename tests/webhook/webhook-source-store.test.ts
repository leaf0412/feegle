import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { WebhookSourceStore } from "../../src/integrations/webhook/webhook-source-store.js";

describe("WebhookSourceStore", () => {
  let tempDir: string;
  let db: RuntimeDb;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-webhook-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a webhook source", () => {
    const store = new WebhookSourceStore(db);
    const source = store.create({
      id: "wh_1",
      name: "GitHub webhook",
      pluginId: "github",
      secretRef: "secret/github-webhook",
      now: "2026-05-31T00:00:00.000Z"
    });

    expect(source.id).toBe("wh_1");
    expect(source.enabled).toBe(true);
  });

  it("retrieves a source by id", () => {
    const store = new WebhookSourceStore(db);
    store.create({
      id: "wh_1",
      name: "Test",
      pluginId: "test",
      secretRef: "ref/1",
      now: "2026-05-31T00:00:00.000Z"
    });

    const source = store.getById("wh_1");
    expect(source).toBeDefined();
    expect(source?.name).toBe("Test");
  });

  it("disables a source", () => {
    const store = new WebhookSourceStore(db);
    store.create({
      id: "wh_1",
      name: "Test",
      pluginId: "test",
      secretRef: "ref/1",
      now: "2026-05-31T00:00:00.000Z"
    });

    store.disable("wh_1", "2026-05-31T00:01:00.000Z");

    const source = store.getById("wh_1");
    expect(source?.enabled).toBe(false);
  });
});
