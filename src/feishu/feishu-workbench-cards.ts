import type { FeishuCardColor, FeishuPlainText } from "./feishu-card-builder.js";

export interface DirectorySetupCardInput {
  interactionId: string;
  providers: string[];
  workspaces: DirectorySetupWorkspace[];
}

export interface DirectorySetupWorkspace {
  label: string;
  path: string;
}

export interface DirectorySavedCardInput {
  provider?: string;
  workspacePath: string;
}

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
  type: "primary";
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

export function buildDirectorySetupCard(input: DirectorySetupCardInput): FeishuWorkbenchCard {
  return {
    schema: "2.0",
    config: {
      wide_screen_mode: true,
      update_multi: true
    },
    header: {
      template: "blue",
      title: plainText("选择工作目录")
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: [
            "这个群还没有绑定工作目录。请选择常用目录，或直接输入一个本机目录。",
            "",
            "**Agent**：选择本次使用的本地 agent。",
            "**常用目录**：来自 `~/.feegle/config.jsonc` 的快捷项。",
            "**手动输入目录**：会优先于常用目录。"
          ].join("\n")
        },
        {
          tag: "form",
          name: "workbench_directory",
          elements: [
            {
              tag: "select_static",
              name: "provider",
              placeholder: plainText("选择 Agent"),
              options: input.providers.map((provider) => ({ text: plainText(provider), value: provider }))
            },
            {
              tag: "select_static",
              name: "workspace_path",
              placeholder: plainText("选择常用目录"),
              options: input.workspaces.map((workspace) => ({
                text: plainText(workspace.label),
                value: workspace.path
              }))
            },
            {
              tag: "input",
              name: "manual_path",
              placeholder: plainText("/Users/yb/Desktop/code/project")
            },
            directorySubmitButton(input.interactionId)
          ]
        }
      ]
    }
  };
}

export function buildDirectorySavedCard(input: DirectorySavedCardInput): FeishuWorkbenchCard {
  return {
    schema: "2.0",
    config: {
      wide_screen_mode: true,
      update_multi: true
    },
    header: {
      template: "green",
      title: plainText("已保存工作目录")
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: [
            `**工作目录**：\`${input.workspacePath}\``,
            ...(input.provider ? [`**Agent**：${input.provider}`] : []),
            "",
            "这次选择已确认，原请求正在继续处理。"
          ].join("\n")
        }
      ]
    }
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

function directorySubmitButton(interactionId: string): FeishuFormSubmitButton {
  return {
    tag: "button",
    text: plainText("保存并继续"),
    type: "primary",
    action_type: "form_submit",
    name: "submit_directory",
    value: {
      action: "act:/workbench directory submit",
      interaction_id: interactionId
    }
  };
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
