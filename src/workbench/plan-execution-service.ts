import type { AgentCli } from "../agent/agent-cli.js";
import type { FeishuClientPort } from "../feishu/feishu-client.js";
import { buildBaseBranchPromptCard } from "../feishu/feishu-workbench-cards.js";
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
}

function planIdToTitle(plan: Pick<PlanArtifact, "planId">): string {
  return plan.planId;
}
