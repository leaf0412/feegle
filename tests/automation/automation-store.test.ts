import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/infra/app/runtime-db.js";
import { AutomationStore } from "../../src/features/automation/automation-store.js";

describe("AutomationStore", () => {
  let tempDir: string;
  let db: RuntimeDb;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-automation-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    db.prepare("insert into workspaces (id, name, created_at, updated_at) values ('ws_1', 'Test', '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z')").run();
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates and lists automations", () => {
    const store = new AutomationStore(db);
    store.create({
      id: "auto_1", workspaceId: "ws_1", name: "Auto Recover",
      trigger: "on_workflow_failed", conditionType: "always", conditionValue: "",
      effect: "trigger_recovery", now: "2026-05-31T00:00:00.000Z"
    });

    const list = store.listEnabled("ws_1");
    expect(list).toHaveLength(1);
    expect(list[0].trigger).toBe("on_workflow_failed");
  });
});
