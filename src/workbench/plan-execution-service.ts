import type { AgentCli } from "../agent/agent-cli.js";
import type { FeishuClientPort } from "../feishu/feishu-client.js";
import { buildBaseBranchPromptCard, buildPlanProgressCard } from "../feishu/feishu-workbench-cards.js";
import type { GitService } from "../git/git-service.js";
import type { PlanArtifact, PlanArtifactStatus, PlanArtifactStore } from "./plan-artifact-store.js";
import { deriveSlug } from "./plan-execution-helpers.js";

const TERMINAL_STATUSES: PlanArtifactStatus[] = ["pushed", "cancelled", "cleaned", "failed"];

export interface PlanExecutionServiceDeps {
  feegleHome: string;
  client: Pick<FeishuClientPort, "sendInteractiveCard" | "updateInteractiveCard">;
  store: PlanArtifactStore;
  git: Pick<
    GitService,
    | "getRepoRoot"
    | "getBranchSha"
    | "branchExists"
    | "listRemoteBranches"
    | "createWorktree"
    | "removeWorktree"
    | "isClean"
    | "diffStats"
    | "push"
  >;
  agent: Pick<AgentCli, "runDevelopmentTask">;
  now?: () => Date;
}

export type PlanExecutionReply =
  | { kind: "text"; text: string }
  | { kind: "feishu_card"; card: unknown }
  | { kind: "feishu_card_update"; card: unknown };

export class PlanExecutionService {
  constructor(private readonly deps: PlanExecutionServiceDeps) {}

  async approve(planId: string): Promise<PlanExecutionReply | undefined> {
    const plan = this.deps.store.latest(planId);
    if (!plan) return { kind: "text", text: `计划不存在：${planId}` };

    if (TERMINAL_STATUSES.includes(plan.status)) {
      return { kind: "text", text: `该计划已结束（status=${plan.status}）` };
    }
    if (plan.status === "executing") {
      return { kind: "text", text: "该计划正在执行中" };
    }
    if (plan.status !== "pending_review") {
      return { kind: "text", text: `该计划当前状态不允许 approve（status=${plan.status}）` };
    }

    if (!plan.baseBranch) {
      this.deps.store.setStatus(planId, {
        status: "pending_base",
        expectedStatus: "pending_review"
      });
      const repoRoot = await this.deps.git.getRepoRoot(plan.workspacePath);
      const candidates = await this.deps.git.listRemoteBranches(repoRoot);
      const title = planIdToTitle(plan);
      const slug = deriveSlug(title, planId);
      return {
        kind: "feishu_card",
        card: buildBaseBranchPromptCard({
          planId,
          version: plan.version,
          title,
          defaultHeadBranch: `yb/feat/${slug}`,
          candidates
        })
      };
    }

    return { kind: "text", text: "TODO: baseBranch 已填，待 Task 11 实现执行链路" };
  }

  async submitBaseBranch(input: {
    planId: string;
    baseBranch: string;
    headBranch?: string;
  }): Promise<PlanExecutionReply | undefined> {
    const plan = this.deps.store.latest(input.planId);
    if (!plan) return { kind: "text", text: `计划不存在：${input.planId}` };
    if (plan.status !== "pending_base") {
      return { kind: "text", text: `当前状态不允许提交 base（status=${plan.status}）` };
    }

    const repoRoot = await this.deps.git.getRepoRoot(plan.workspacePath);
    const candidates = await this.deps.git.listRemoteBranches(repoRoot);
    const baseExists = candidates.includes(input.baseBranch);
    const localExists = !baseExists && (await this.deps.git.branchExists(repoRoot, input.baseBranch));
    const title = planIdToTitle(plan);
    const defaultHeadBranch = input.headBranch ?? `yb/feat/${deriveSlug(title, plan.planId)}`;

    if (!baseExists && !localExists) {
      return {
        kind: "feishu_card",
        card: buildBaseBranchPromptCard({
          planId: input.planId,
          version: plan.version,
          title,
          defaultHeadBranch,
          candidates,
          reason: `提交的 base "${input.baseBranch}" 不在远程分支列表，请重新选择`
        })
      };
    }

    const baseSha = await this.deps.git.getBranchSha(repoRoot, input.baseBranch);
    const headBranch = sanitizeHeadBranch(input.headBranch) ?? `yb/feat/${deriveSlug(title, plan.planId)}`;
    const worktreePath = this.composeWorktreePath(repoRoot, plan.planId);

    this.deps.store.setBaseBranch(input.planId, {
      baseBranch: input.baseBranch,
      headBranch,
      expectedStatus: "pending_base"
    });

    await this.deps.git.createWorktree({
      repoPath: repoRoot,
      worktreePath,
      baseBranch: input.baseBranch,
      newBranch: headBranch
    });

    this.deps.store.setStatus(input.planId, {
      status: "approved",
      expectedStatus: "pending_base"
    });

    const messageId = await this.deps.client.sendInteractiveCard(
      plan.chatId,
      buildPlanProgressCard({
        planId: input.planId,
        version: plan.version,
        title,
        headBranch,
        iteration: 1,
        stage: "prepared",
        recentEvents: []
      })
    );

    this.deps.store.setExecution(input.planId, {
      baseSha,
      headBranch,
      worktreePath,
      ...(messageId ? { progressCardMessageId: messageId } : {}),
      status: "executing",
      expectedStatus: "approved"
    });

    void this.runIteration(input.planId, null);
    return undefined;
  }

  private composeWorktreePath(repoRoot: string, planId: string): string {
    const repoName = repoRoot.split("/").filter(Boolean).pop() ?? "repo";
    return `${this.deps.feegleHome}/worktrees/${repoName}/${planId}`;
  }

  private async runIteration(planId: string, _note: string | null): Promise<void> {
    const plan = this.deps.store.latest(planId);
    if (!plan?.worktreePath || !plan.headBranch) return;
    await this.deps.agent.runDevelopmentTask(
      { requirementId: planId, title: plan.planId, requirementText: "" },
      { repositoryId: planId, localPath: plan.worktreePath, branchName: plan.headBranch },
      "",
      { cwd: plan.worktreePath }
    );
  }
}

function planIdToTitle(plan: Pick<PlanArtifact, "planId">): string {
  return plan.planId;
}

function sanitizeHeadBranch(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (!/^[a-z0-9_/]+$/.test(trimmed) || trimmed.includes("-")) {
    throw new Error(`invalid head branch (alphanum/underscore/slash only, no hyphen): ${value}`);
  }
  return trimmed;
}
