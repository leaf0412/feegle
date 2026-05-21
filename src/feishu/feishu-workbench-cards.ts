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

export interface PlanReviewCardInput {
  planId: string;
  title: string;
  version: number;
  summary: PlanReviewSummary;
}

export interface PlanReviewSummary {
  steps: number;
  risks: string[];
}

export interface PlanRevisionRequestCardInput {
  planId: string;
  version: number;
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
  value: Record<string, string>;
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

export function buildPlanReviewCard(input: PlanReviewCardInput): FeishuWorkbenchCard {
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
            "完整计划已作为文件发送到群里。"
          ].join("\n")
        },
        {
          tag: "action",
          actions: [
            planActionButton("确认计划", "primary", "act:/workbench plan approve", input),
            planActionButton("要求修改", "default", "act:/workbench plan revise", input),
            planActionButton("取消", "danger", "act:/workbench plan cancel", input)
          ]
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
