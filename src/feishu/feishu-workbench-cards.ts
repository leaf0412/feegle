import type { FeishuCardColor, FeishuPlainText } from "./feishu-card-builder.js";

export interface PlanReviewCardInput {
  planId: string;
  title: string;
  version: number;
  summary: PlanReviewSummary;
  docUrl?: string;
}

export interface PlanReviewSummary {
  steps: number;
  risks: string[];
}

export interface PlanRevisionRequestCardInput {
  planId: string;
  version: number;
}

export interface BaseBranchPromptCardInput {
  planId: string;
  version: number;
  title: string;
  defaultHeadBranch: string;
  candidates: string[];
  reason?: string;
}

export type PlanProgressStage =
  | "prepared"
  | "creating_worktree"
  | "executing"
  | "verifying"
  | "completed"
  | "failed";

export interface PlanProgressCardInput {
  planId: string;
  version: number;
  title: string;
  headBranch?: string;
  iteration: number;
  stage: PlanProgressStage;
  recentEvents: string[];
  errorMessage?: string;
}

export interface PlanCompletedCardIterationSummary {
  iteration: number;
  note: string | null;
}

export interface PlanCompletedCardInput {
  planId: string;
  version: number;
  title: string;
  headBranch: string;
  worktreePath: string;
  iteration: number;
  commitCount: number;
  filesChanged: number;
  iterationNotes: PlanCompletedCardIterationSummary[];
}

export interface PlanExecutionRevisionCardInput {
  planId: string;
  version: number;
  iteration: number;
}

export interface PlanPushResultCardInput {
  planId: string;
  version: number;
  title: string;
  headBranch: string;
  success: boolean;
  stderr?: string;
}

export interface BindRepoPromptCardInput {
  scopeKey: string;
  scopeNoun: string;
}

export interface RepoBoundCardInput {
  scopeNoun: string;
  repoName: string;
  repoId: string;
  boundLines: string;
}

export interface FeishuWorkbenchCard {
  schema: "2.0";
  config: {
    wide_screen_mode: true;
    update_multi: true;
  };
  header: {
    template: FeishuCardColor;
    title: FeishuPlainText;
  };
  body: {
    elements: FeishuWorkbenchCardElement[];
  };
}

type FeishuWorkbenchCardElement =
  | { tag: "markdown"; content: string }
  | { tag: "action"; actions: FeishuButtonElement[] }
  | {
      tag: "form";
      name: string;
      elements: FeishuFormElement[];
    };

type FeishuFormElement =
  | {
      tag: "select_static";
      name: string;
      placeholder: FeishuPlainText;
      options: FeishuSelectOption[];
    }
  | {
      tag: "input";
      name: string;
      placeholder: FeishuPlainText;
      input_type?: "multiline";
    }
  | FeishuFormSubmitButton;

interface FeishuSelectOption {
  text: FeishuPlainText;
  value: string;
}

interface FeishuFormSubmitButton {
  tag: "button";
  text: FeishuPlainText;
  type: "default" | "primary" | "danger";
  action_type: "form_submit";
  name: string;
  value: Record<string, string>;
}

interface FeishuButtonElement {
  tag: "button";
  text: FeishuPlainText;
  type: "default" | "primary" | "danger";
  value?: Record<string, string>;
  multi_url?: {
    url: string;
    pc_url: string;
    ios_url: string;
    android_url: string;
  };
}

export function buildPlanReviewCard(input: PlanReviewCardInput): FeishuWorkbenchCard {
  const actions: FeishuButtonElement[] = [];
  if (input.docUrl) {
    actions.push(docUrlButton(input.docUrl));
  }
  actions.push(
    planActionButton("确认计划", "primary", "act:/workbench plan approve", input),
    planActionButton("要求修改", "default", "act:/workbench plan revise", input),
    planActionButton("取消", "danger", "act:/workbench plan cancel", input)
  );

  return {
    schema: "2.0",
    config: {
      wide_screen_mode: true,
      update_multi: true
    },
    header: {
      template: "blue",
      title: plainText(`${input.title} · 计划待确认`)
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: [
            `**计划版本**：v${input.version}`,
            `**步骤数**：${input.summary.steps}`,
            `**风险点**：${renderRisks(input.summary.risks)}`,
            "",
            input.docUrl ? "点击下方按钮打开飞书云文档查看完整计划。" : "完整计划已作为文件发送到群里。"
          ].join("\n")
        },
        {
          tag: "action",
          actions
        }
      ]
    }
  };
}

export function buildPlanRevisionRequestCard(input: PlanRevisionRequestCardInput): FeishuWorkbenchCard {
  return {
    schema: "2.0",
    config: {
      wide_screen_mode: true,
      update_multi: true
    },
    header: {
      template: "orange",
      title: plainText(`修改计划 · v${input.version}`)
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: "请输入需要调整的内容。提交后会生成新的计划文件版本。\n\n**修改意见**：支持多行输入。"
        },
        {
          tag: "form",
          name: "workbench_plan_revision",
          elements: [
            {
              tag: "input",
              name: "revision_note",
              placeholder: plainText("例如：补充 Playwright 验证；拆小数据库迁移步骤"),
              input_type: "multiline"
            },
            planRevisionSubmitButton(input)
          ]
        }
      ]
    }
  };
}

export function buildBaseBranchPromptCard(input: BaseBranchPromptCardInput): FeishuWorkbenchCard {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: "yellow", title: plainText(`${input.title} · 选择基线分支`) },
    body: {
      elements: [
        {
          tag: "markdown",
          content: [
            ...(input.reason ? [`⚠️ ${input.reason}`, ""] : []),
            "本次执行需要一个**基线分支**，新分支会从它派生。",
            "",
            "**基线分支**：从下方候选选择，或手填一个本地 / 远程已有的分支名。",
            "**新分支名**：默认从计划标题派生，可在下方编辑。"
          ].join("\n")
        },
        {
          tag: "form",
          name: "workbench_plan_base_branch",
          elements: [
            {
              tag: "select_static",
              name: "base_branch",
              placeholder: plainText("选择基线分支"),
              options: input.candidates.map((branch) => ({
                text: plainText(branch),
                value: branch
              }))
            },
            {
              tag: "input",
              name: "base_branch_manual",
              placeholder: plainText("或手填：main / beta / develop ...")
            },
            {
              tag: "input",
              name: "head_branch",
              placeholder: plainText(input.defaultHeadBranch)
            },
            baseBranchSubmitButton(input)
          ]
        }
      ]
    }
  };
}

export function buildPlanProgressCard(input: PlanProgressCardInput): FeishuWorkbenchCard {
  const stageLabels: Record<PlanProgressStage, string> = {
    prepared: "准备就绪",
    creating_worktree: "创建 worktree...",
    executing: "执行中...",
    verifying: "校验工作区...",
    completed: "已完成",
    failed: "失败"
  };
  const headerTemplate: FeishuCardColor = input.stage === "failed" ? "red" : "blue";
  const eventBlock =
    input.recentEvents.length === 0
      ? "_尚无事件_"
      : input.recentEvents
          .slice(-5)
          .map((line) => `- ${line}`)
          .join("\n");

  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: headerTemplate, title: plainText(`${input.title} · 执行中`) },
    body: {
      elements: [
        {
          tag: "markdown",
          content: [
            `**计划版本**：v${input.version}`,
            `**迭代**：迭代 ${input.iteration}`,
            `**分支**：${input.headBranch ?? "_（尚未创建）_"}`,
            `**阶段**：${stageLabels[input.stage]} (${input.stage})`,
            input.errorMessage ? `**错误**：${input.errorMessage}` : "",
            "",
            "**最近事件**：",
            eventBlock
          ]
            .filter(Boolean)
            .join("\n")
        }
      ]
    }
  };
}

export function buildPlanCompletedCard(input: PlanCompletedCardInput): FeishuWorkbenchCard {
  const iterationLines = input.iterationNotes
    .slice(-5)
    .map((entry) =>
      entry.note ? `- 迭代 ${entry.iteration}：${entry.note}` : `- 迭代 ${entry.iteration}：(首次执行)`
    )
    .join("\n");

  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: "green", title: plainText(`${input.title} · 执行完成`) },
    body: {
      elements: [
        {
          tag: "markdown",
          content: [
            `**分支**：\`${input.headBranch}\``,
            `**Commits**：${input.commitCount}`,
            `**修改文件**：${input.filesChanged}`,
            `**迭代**：当前为迭代 ${input.iteration}`,
            `**Worktree 路径**：\`${input.worktreePath}\``,
            "",
            "**历次意见**：",
            iterationLines
          ].join("\n")
        },
        {
          tag: "action",
          actions: [
            completedActionButton("继续调整", "default", "act:/workbench plan revise_execution", input),
            completedActionButton("推送", "primary", "act:/workbench plan push", input),
            completedActionButton("拒绝", "danger", "act:/workbench plan reject", input),
            completedActionButton("清理", "default", "act:/workbench plan cleanup", input)
          ]
        }
      ]
    }
  };
}

export function buildPlanExecutionRevisionCard(input: PlanExecutionRevisionCardInput): FeishuWorkbenchCard {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: "orange", title: plainText(`继续调整 · 迭代 ${input.iteration + 1}`) },
    body: {
      elements: [
        {
          tag: "markdown",
          content: "请输入需要 agent 在现有代码基础上调整的内容。提交后会生成新的 iteration。"
        },
        {
          tag: "form",
          name: "workbench_plan_execution_revision",
          elements: [
            {
              tag: "input",
              name: "revision_note",
              placeholder: plainText("例如：补充错误处理；去掉不需要的 try/catch"),
              input_type: "multiline"
            },
            {
              tag: "button",
              text: plainText("再跑一次"),
              type: "primary",
              action_type: "form_submit",
              name: "submit_execution_revision",
              value: {
                action: "act:/workbench plan revise_execution_submit",
                plan_id: input.planId,
                version: String(input.version)
              }
            }
          ]
        }
      ]
    }
  };
}

export function buildPlanPushResultCard(input: PlanPushResultCardInput): FeishuWorkbenchCard {
  if (input.success) {
    return {
      schema: "2.0",
      config: { wide_screen_mode: true, update_multi: true },
      header: { template: "green", title: plainText(`${input.title} · 已推送`) },
      body: {
        elements: [
          {
            tag: "markdown",
            content: [
              `**分支**：\`${input.headBranch}\``,
              "",
              "已推送到 origin。worktree 仍保留在本地，下次需要可直接进入；或点下方按钮清理。"
            ].join("\n")
          },
          {
            tag: "action",
            actions: [
              {
                tag: "button",
                text: plainText("清理 worktree"),
                type: "default",
                value: {
                  action: "act:/workbench plan cleanup",
                  plan_id: input.planId,
                  version: String(input.version)
                }
              }
            ]
          }
        ]
      }
    };
  }

  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: "red", title: plainText(`${input.title} · 推送失败`) },
    body: {
      elements: [
        {
          tag: "markdown",
          content: [
            `**分支**：\`${input.headBranch}\``,
            "",
            "**stderr**：",
            "```",
            (input.stderr ?? "(empty)").trim(),
            "```"
          ].join("\n")
        },
        {
          tag: "action",
          actions: [
            {
              tag: "button",
              text: plainText("重试推送"),
              type: "primary",
              value: {
                action: "act:/workbench plan push",
                plan_id: input.planId,
                version: String(input.version)
              }
            },
            {
              tag: "button",
              text: plainText("继续调整"),
              type: "default",
              value: {
                action: "act:/workbench plan revise_execution",
                plan_id: input.planId,
                version: String(input.version)
              }
            }
          ]
        }
      ]
    }
  };
}

export function buildBindRepoPromptCard(input: BindRepoPromptCardInput): FeishuWorkbenchCard {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: "orange", title: plainText(`${input.scopeNoun}尚未绑定仓库`) },
    body: {
      elements: [
        {
          tag: "markdown",
          content: [
            "聊天前需要先绑定一个 Git 仓库。",
            "粘贴仓库 URL，点下方按钮即可绑定。"
          ].join("\n")
        },
        {
          tag: "form",
          name: "bind_repo",
          elements: [
            {
              tag: "input",
              name: "repo_url",
              placeholder: plainText("例如 git@github.com:org/repo.git")
            },
            {
              tag: "button",
              text: plainText("绑定仓库"),
              type: "primary",
              action_type: "form_submit",
              name: "submit_bind_repo",
              value: {
                action: "act:/repo bind_submit",
                scope_key: input.scopeKey,
                scope_noun: input.scopeNoun
              }
            },
            {
              // Cancel lives in the form as a second submit button: schema 2.0
              // dropped the standalone `tag: action` block. repo_url isn't
              // required, so submitting via cancel never trips input validation.
              tag: "button",
              text: plainText("取消"),
              type: "default",
              action_type: "form_submit",
              name: "cancel_bind_repo",
              value: { action: "act:/repo bind_cancel", scope_key: input.scopeKey }
            }
          ]
        }
      ]
    }
  };
}

export function buildRepoBindCancelledCard(): FeishuWorkbenchCard {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: "grey", title: plainText("已取消绑定") },
    body: {
      elements: [
        {
          tag: "markdown",
          content: "已取消。如需绑定仓库，重新发条消息再点卡片，或直接 /bind_repo <仓库url>。"
        }
      ]
    }
  };
}

/**
 * Shown on the *other* outstanding prompt cards once any one of them (or a
 * /bind_repo) has bound the scope — it makes the now-redundant cards inert so a
 * stray click can't re-trigger the form.
 */
export function buildBindPromptSupersededCard(): FeishuWorkbenchCard {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: "grey", title: plainText("仓库已绑定") },
    body: {
      elements: [
        {
          tag: "markdown",
          content: "本群已绑定仓库，此卡片已失效。"
        }
      ]
    }
  };
}

export function buildRepoBoundCard(input: RepoBoundCardInput): FeishuWorkbenchCard {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: "green", title: plainText("仓库绑定成功") },
    body: {
      elements: [
        {
          tag: "markdown",
          content: [
            `✅ 已为${input.scopeNoun}绑定仓库：${input.repoName} (${input.repoId})`,
            "当前绑定：",
            input.boundLines,
            "",
            "现在可以直接发消息开始聊天。"
          ].join("\n")
        }
      ]
    }
  };
}

export function assertValidFeishuWorkbenchCard(card: unknown): asserts card is FeishuWorkbenchCard {
  const violations: string[] = [];
  for (const form of formElements(card)) {
    if (hasOwnProperty(form, "submit")) {
      violations.push("form must not include submit");
    }
    const elements = Array.isArray(form.elements) ? form.elements.filter(isRecord) : [];
    for (const element of elements) {
      if (hasOwnProperty(element, "label")) {
        violations.push("form elements must not include label");
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(`Invalid Feishu workbench card: ${Array.from(new Set(violations)).sort().join("; ")}`);
  }
}

function docUrlButton(docUrl: string): FeishuButtonElement {
  return {
    tag: "button",
    text: plainText("打开云文档"),
    type: "primary",
    multi_url: {
      url: docUrl,
      pc_url: docUrl,
      ios_url: docUrl,
      android_url: docUrl
    }
  };
}

function planRevisionSubmitButton(input: PlanRevisionRequestCardInput): FeishuFormSubmitButton {
  return {
    tag: "button",
    text: plainText("生成新版本"),
    type: "primary",
    action_type: "form_submit",
    name: "submit_revision",
    value: {
      action: "act:/workbench plan revise submit",
      plan_id: input.planId,
      version: String(input.version)
    }
  };
}

function baseBranchSubmitButton(input: BaseBranchPromptCardInput): FeishuFormSubmitButton {
  return {
    tag: "button",
    text: plainText("开始执行"),
    type: "primary",
    action_type: "form_submit",
    name: "submit_base_branch",
    value: {
      action: "act:/workbench plan base_branch_submit",
      plan_id: input.planId,
      version: String(input.version)
    }
  };
}

function completedActionButton(
  text: string,
  type: FeishuButtonElement["type"],
  action: string,
  input: Pick<PlanCompletedCardInput, "planId" | "version">
): FeishuButtonElement {
  return {
    tag: "button",
    text: plainText(text),
    type,
    value: {
      action,
      plan_id: input.planId,
      version: String(input.version)
    }
  };
}

function planActionButton(
  text: string,
  type: FeishuButtonElement["type"],
  action: string,
  input: Pick<PlanReviewCardInput, "planId" | "version">
): FeishuButtonElement {
  return {
    tag: "button",
    text: plainText(text),
    type,
    value: {
      action,
      plan_id: input.planId,
      version: String(input.version)
    }
  };
}

function renderRisks(risks: string[]): string {
  return risks.length > 0 ? risks.join("；") : "暂无";
}

function plainText(content: string): FeishuPlainText {
  return { tag: "plain_text", content };
}

function formElements(card: unknown): Array<Record<string, unknown>> {
  if (!isRecord(card) || !isRecord(card.body) || !Array.isArray(card.body.elements)) {
    return [];
  }
  return card.body.elements.filter(isRecord).filter((element) => element.tag === "form");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwnProperty(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
