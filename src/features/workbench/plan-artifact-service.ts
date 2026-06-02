import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ulid } from "ulid";
import type { Agent } from "@integrations/agent/agent-session.js";
import { collectText } from "@integrations/agent/collect-text.js";
import type { FeishuCloudDocClientPort } from "@integrations/feishu/feishu-cloud-doc-client.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import { buildPlanReviewCard, type PlanReviewSummary } from "@integrations/feishu/feishu-workbench-cards.js";
import type { PlanArtifact, PlanArtifactStore } from "./plan-artifact-store.js";

export interface PlanArtifactServiceDeps {
  feegleHome: string;
  client: Pick<FeishuClientPort, "sendInteractiveCard">;
  cloudDoc: FeishuCloudDocClientPort;
  store: Pick<PlanArtifactStore, "createVersion" | "latest">;
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

export interface RevisePlanInput {
  planId: string;
  revisionNote: string;
  agent: Agent;
}

export class PlanArtifactService {
  constructor(private readonly deps: PlanArtifactServiceDeps) {}

  async createInitialPlan(input: CreateInitialPlanInput): Promise<PlanArtifact> {
    const planId = this.deps.planIdFactory?.() ?? `plan_${ulid()}`;
    const version = 1;
    return this.writeUploadAndRecord({
      planId,
      chatId: input.chatId,
      sourceMessageId: input.sourceMessageId,
      provider: input.provider,
      workspacePath: input.workspacePath,
      title: input.title,
      content: input.content,
      summary: input.summary,
      version
    });
  }

  async revisePlan(input: RevisePlanInput): Promise<PlanArtifact> {
    const current = this.deps.store.latest(input.planId);
    if (!current) {
      throw new Error(`plan artifact not found: ${input.planId}`);
    }

    const currentPlan = await readFile(current.filePath, "utf8");
    const revisedPlan = (
      await collectText(input.agent, buildRevisionPrompt(input.revisionNote, currentPlan), {
        cwd: current.workspacePath
      })
    ).trim();
    if (!revisedPlan) {
      throw new Error(`plan revision returned empty content: ${input.planId}`);
    }

    const version = current.version + 1;
    return this.writeUploadAndRecord({
      planId: input.planId,
      chatId: current.chatId,
      sourceMessageId: current.sourceMessageId,
      provider: current.provider,
      workspacePath: current.workspacePath,
      title: input.planId,
      content: revisedPlan,
      summary: summarizePlan(revisedPlan),
      version,
      revisionNote: input.revisionNote
    });
  }

  private async writeUploadAndRecord(input: WriteUploadRecordInput): Promise<PlanArtifact> {
    const planDir = join(this.deps.feegleHome, "artifacts", "plans", input.planId);
    const filePath = join(planDir, `plan-v${input.version}.md`);
    await mkdir(planDir, { recursive: true });
    await writeFile(filePath, input.content, "utf8");

    const { documentId } = await this.deps.cloudDoc.createDoc({ title: input.title });
    await this.deps.cloudDoc.writeMarkdown({ documentId, markdown: input.content });
    const docUrl = this.deps.cloudDoc.buildDocUrl(documentId);

    const artifact = this.deps.store.createVersion({
      planId: input.planId,
      chatId: input.chatId,
      sourceMessageId: input.sourceMessageId,
      provider: input.provider,
      workspacePath: input.workspacePath,
      version: input.version,
      filePath,
      docToken: documentId,
      docUrl,
      status: "pending_review",
      ...(input.revisionNote ? { revisionNote: input.revisionNote } : {})
    });

    await this.deps.client.sendInteractiveCard(
      input.chatId,
      buildPlanReviewCard({
        planId: input.planId,
        title: input.title,
        version: input.version,
        summary: input.summary,
        docUrl
      })
    );
    return artifact;
  }
}

interface WriteUploadRecordInput extends CreateInitialPlanInput {
  planId: string;
  version: number;
  revisionNote?: string;
}

function buildRevisionPrompt(revisionNote: string, currentPlan: string): string {
  return [
    "Revise this implementation plan.",
    "Keep it as a complete standalone markdown plan.",
    "Do not overwrite prior versions.",
    `Revision request:\n${revisionNote}`,
    `Current plan:\n${currentPlan}`
  ].join("\n\n");
}

function summarizePlan(content: string): PlanReviewSummary {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const steps = lines.filter((line) => /^[-*]\s+|\d+\.\s+/.test(line)).length;
  const risks = lines
    .filter((line) => /risk|风险/i.test(line))
    .map((line) => line.replace(/^[-*]\s+/, ""))
    .slice(0, 5);
  return {
    steps,
    risks
  };
}
