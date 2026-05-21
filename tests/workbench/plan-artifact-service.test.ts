import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import type { FeishuClientPort } from "../../src/feishu/feishu-client.js";
import { PlanArtifactService } from "../../src/workbench/plan-artifact-service.js";
import { PlanArtifactStore } from "../../src/workbench/plan-artifact-store.js";
import { makeFakeFeishuClient } from "../fixtures/fake-feishu-client.js";

describe("PlanArtifactService", () => {
  let home: string;
  let db: RuntimeDb;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-plan-service-"));
    db = openRuntimeDb(join(home, "feegle.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(home, { recursive: true, force: true });
  });

  it("writes a plan file, uploads it, records version 1, and sends a review card", async () => {
    const sentFiles: Array<{ chatId: string; filePath: string }> = [];
    const sentCards: Array<{ chatId: string; card: unknown }> = [];
    const client = fakeClient(sentFiles, sentCards);
    const store = new PlanArtifactStore(db, () => new Date("2026-05-21T00:00:00.000Z"));
    const service = new PlanArtifactService({
      feegleHome: home,
      client,
      store,
      planIdFactory: () => "plan_1"
    });

    const result = await service.createInitialPlan({
      chatId: "oc_1",
      sourceMessageId: "om_1",
      provider: "codex",
      workspacePath: home,
      title: "Fix startup",
      content: "# Plan\n\n- Step 1",
      summary: { steps: 1, risks: ["unknown env"] }
    });

    expect(result).toMatchObject({
      planId: "plan_1",
      version: 1,
      chatId: "oc_1",
      sourceMessageId: "om_1",
      provider: "codex",
      workspacePath: home,
      status: "pending_review",
      feishuFileMessageId: "om_file"
    });
    expect(result.filePath).toBe(join(home, "artifacts", "plans", "plan_1", "plan-v1.md"));
    expect(await readFile(result.filePath, "utf8")).toContain("# Plan");
    expect(sentFiles).toEqual([{ chatId: "oc_1", filePath: result.filePath }]);
    expect(store.latest("plan_1")).toMatchObject({ version: 1, filePath: result.filePath });
    expect(sentCards).toHaveLength(1);
    expect(JSON.stringify(sentCards[0]?.card)).toContain("act:/workbench plan approve");
    expect(JSON.stringify(sentCards[0]?.card)).toContain("unknown env");
  });
});

function fakeClient(
  sentFiles: Array<{ chatId: string; filePath: string }>,
  sentCards: Array<{ chatId: string; card: unknown }>
): FeishuClientPort {
  return makeFakeFeishuClient({
    async sendFile(chatId, filePath) {
      sentFiles.push({ chatId, filePath });
      return "om_file";
    },
    async sendInteractiveCard(chatId, card) {
      sentCards.push({ chatId, card });
      return "om_card";
    }
  });
}
