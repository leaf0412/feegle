import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ulid } from "ulid";
import type { FeishuClientPort } from "../feishu/feishu-client.js";
import { buildPlanReviewCard, type PlanReviewSummary } from "../feishu/feishu-workbench-cards.js";
import type { PlanArtifact, PlanArtifactStore } from "./plan-artifact-store.js";

export interface PlanArtifactServiceDeps {
  feegleHome: string;
  client: Pick<FeishuClientPort, "sendFile" | "sendInteractiveCard">;
  store: Pick<PlanArtifactStore, "createVersion">;
  planIdFactory?: () => string;
}

export interface CreateInitialPlanInput {
  chatId: string;
  sourceMessageId: string;
  provider: string;
  workspacePath: string;
  title: string;
  content: string;
  summary: PlanReviewSummary;
}

export class PlanArtifactService {
  constructor(private readonly deps: PlanArtifactServiceDeps) {}

  async createInitialPlan(input: CreateInitialPlanInput): Promise<PlanArtifact> {
    const planId = this.deps.planIdFactory?.() ?? `plan_${ulid()}`;
    const version = 1;
    const filePath = join(this.deps.feegleHome, "artifacts", "plans", planId, `plan-v${version}.md`);
    await mkdir(join(this.deps.feegleHome, "artifacts", "plans", planId), { recursive: true });
    await writeFile(filePath, input.content, "utf8");

    const feishuFileMessageId = await this.deps.client.sendFile(input.chatId, filePath);
    if (!feishuFileMessageId) {
      throw new Error("Feishu plan file upload did not return message id");
    }

    const artifact = this.deps.store.createVersion({
      planId,
      chatId: input.chatId,
      sourceMessageId: input.sourceMessageId,
      provider: input.provider,
      workspacePath: input.workspacePath,
      version,
      filePath,
      feishuFileMessageId,
      status: "pending_review"
    });

    await this.deps.client.sendInteractiveCard(
      input.chatId,
      buildPlanReviewCard({
        planId,
        title: input.title,
        version,
        summary: input.summary
      })
    );
    return artifact;
  }
}
