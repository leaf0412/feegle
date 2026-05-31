import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb } from "../../src/app/runtime-db.js";
import { RuntimeStore } from "../../src/runtime/runtime-store.js";
import { RuntimeHealthService } from "../../src/operations/runtime-health-service.js";

describe("RuntimeHealthService", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-health-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("reports pass when DB is healthy", async () => {
    const db = openRuntimeDb(join(tempDir, "feegle.db"));
    db.prepare("insert into workspaces (id, name, created_at, updated_at) values ('ws_1', 'Test', '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z')").run();
    const store = new RuntimeStore(db);
    const service = new RuntimeHealthService(store, db);

    const report = await service.check();
    expect(report.status).toBe("pass");
    expect(report.checks.some((c) => c.name === "db_available")).toBe(true);

    db.close();
  });
});
