import type { RequirementStatus } from "../domain/status.js";
import { createPlatformCard, type PlatformCardButton } from "../platform/platform-card.js";
import { renderFeishuCard } from "./feishu-card-renderer.js";

export interface FeishuInteractiveCard {
  schema?: "2.0";
  config: {
    wide_screen_mode?: boolean;
    update_multi: true;
    enable_forward_interaction?: boolean;
  };
  header: {
    template: FeishuCardColor;
    title: FeishuPlainText;
  };
  body?: {
    elements: FeishuCardElement[];
  };
  elements?: FeishuCardElement[];
}

export type FeishuCardColor = "blue" | "green" | "red" | "orange" | "grey";

export interface FeishuPlainText {
  tag: "plain_text";
  content: string;
}

export type FeishuCardElement =
  | { tag: "markdown"; content: string }
  | { tag: "hr" }
  | { tag: "action"; actions: FeishuButtonElement[] };

export interface FeishuButtonElement {
  tag: "button";
  text: FeishuPlainText;
  type: "default" | "primary" | "danger";
  value: Record<string, string>;
}

export interface RequirementStatusCardRepository {
  id: string;
  name: string;
  branch?: string;
  pushStatus: "not_ready" | "ready" | "pushed";
}

export interface RequirementStatusCardInput {
  title: string;
  requirementId: string;
  status: RequirementStatus;
  repositories: RequirementStatusCardRepository[];
  prototypeFileName?: string;
  planSummary?: string;
}

export interface WorkflowProgressCardInput {
  title: string;
  status: "running" | "done" | "failed";
  steps: WorkflowProgressStep[];
  footer?: string;
}

export interface WorkflowProgressStep {
  label: string;
  state: "pending" | "running" | "done" | "failed";
  detail?: string;
}

const statusLabels: Record<RequirementStatus, string> = {
  created: "已创建",
  repo_selected: "已选仓库",
  requirement_received: "已收集需求",
  branch_suggested: "待创建分支",
  branch_created: "已创建分支",
  requirement_materialized: "已落需求文件",
  prototype_generated: "原型已生成",
  prototype_reviewing: "原型确认中",
  plan_generated: "计划已生成",
  plan_confirmed: "计划已确认",
  dev_running: "开发中",
  committed: "已提交",
  push_ready: "可推送",
  pushed: "已推送",
  closed: "已关闭"
};

export function buildRequirementStatusCard(input: RequirementStatusCardInput): FeishuInteractiveCard {
  const card = createPlatformCard()
    .title(`${input.title} · ${statusLabels[input.status]}`, requirementStatusColor(input.status))
    .markdown(
      [
        `**需求 ID**：${input.requirementId}`,
        `**当前状态**：${statusLabels[input.status]}`,
        input.prototypeFileName ? `**离线原型**：${input.prototypeFileName}` : undefined,
        input.planSummary ? `**开发计划**：${input.planSummary}` : undefined
      ]
        .filter(isDefined)
        .join("\n")
    )
    .divider()
    .markdown(renderRepositoryLines(input.repositories));

  const reviewButtons = buildReviewButtons(input.requirementId, input.status);
  if (reviewButtons.length > 0) {
    card.buttonRow(reviewButtons, "equal_columns");
  }

  const pushButtons = input.repositories
    .filter((repository) => repository.pushStatus === "ready")
    .map((repository): PlatformCardButton => ({
      text: `推送 ${repository.name}`,
      type: "primary",
      action: `act:/push repo ${repository.id}`,
      extra: {
        requirementId: input.requirementId,
        repositoryId: repository.id
      }
    }));

  if (pushButtons.length > 0) {
    card.buttonRow(pushButtons);
  }

  return renderFeishuCard(card.build()) as unknown as FeishuInteractiveCard;
}

export function buildWorkflowProgressCard(input: WorkflowProgressCardInput): FeishuInteractiveCard {
  const doneCount = input.steps.filter((step) => step.state === "done").length;
  const progressText = [`**进度**：已完成 ${doneCount}/${input.steps.length}`, ...input.steps.map(renderStep)];
  if (input.footer) {
    progressText.push("", input.footer);
  }

  return {
    schema: "2.0",
    config: {
      update_multi: true,
      enable_forward_interaction: true
    },
    header: {
      template: workflowStatusColor(input.status),
      title: plainText(input.title)
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: progressText.join("\n")
        }
      ]
    }
  };
}

function renderRepositoryLines(repositories: RequirementStatusCardRepository[]): string {
  if (repositories.length === 0) {
    return "尚未绑定仓库。";
  }

  return repositories
    .map((repository, index) => {
      const branch = repository.branch ?? "待绑定分支";
      const pushState = renderPushState(repository.pushStatus);
      return `${index + 1}. **${repository.name}**：${branch}，${pushState}`;
    })
    .join("\n");
}

function renderStep(step: WorkflowProgressStep): string {
  const marker = stepStateMarker(step.state);
  const detail = step.detail ? `\n   ${step.detail}` : "";
  return `${marker} ${step.label}${detail}`;
}

function renderPushState(status: RequirementStatusCardRepository["pushStatus"]): string {
  if (status === "ready") {
    return "等待推送";
  }
  if (status === "pushed") {
    return "已推送";
  }
  return "未到推送阶段";
}

function stepStateMarker(state: WorkflowProgressStep["state"]): string {
  if (state === "done") {
    return "✓";
  }
  if (state === "running") {
    return "…";
  }
  if (state === "failed") {
    return "!";
  }
  return "○";
}

function requirementStatusColor(status: RequirementStatus): FeishuCardColor {
  if (status === "closed") {
    return "grey";
  }
  if (status === "push_ready" || status === "pushed") {
    return "green";
  }
  if (status === "prototype_reviewing" || status === "branch_suggested") {
    return "blue";
  }
  return "blue";
}

function workflowStatusColor(status: WorkflowProgressCardInput["status"]): FeishuCardColor {
  if (status === "done") {
    return "green";
  }
  if (status === "failed") {
    return "red";
  }
  return "blue";
}

function buildReviewButtons(requirementId: string, status: RequirementStatus): PlatformCardButton[] {
  if (status === "prototype_reviewing") {
    return [
      {
        text: "确认原型",
        type: "primary",
        action: `act:/prototype approve ${requirementId}`
      },
      buildCancelButton(requirementId)
    ];
  }

  if (status === "plan_generated") {
    return [
      {
        text: "确认计划",
        type: "primary",
        action: `act:/plan confirm ${requirementId}`
      },
      buildCancelButton(requirementId)
    ];
  }

  return [];
}

function buildCancelButton(requirementId: string): PlatformCardButton {
  return {
    text: "取消需求",
    type: "danger",
    action: `act:/requirement cancel ${requirementId}`
  };
}

function plainText(content: string): FeishuPlainText {
  return {
    tag: "plain_text",
    content
  };
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
