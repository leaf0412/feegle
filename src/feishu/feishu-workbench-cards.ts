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
      submit: FeishuFormSubmitButton;
    };

type FeishuFormElement =
  | {
      tag: "select_static";
      name: string;
      label: FeishuPlainText;
      placeholder: FeishuPlainText;
      options: FeishuSelectOption[];
    }
  | {
      tag: "input";
      name: string;
      label: FeishuPlainText;
      placeholder: FeishuPlainText;
    };

interface FeishuSelectOption {
  text: FeishuPlainText;
  value: string;
}

interface FeishuFormSubmitButton {
  tag: "button";
  text: FeishuPlainText;
  type: "primary";
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
          content: "这个群还没有绑定工作目录。请选择常用目录，或直接输入一个本机目录。"
        },
        {
          tag: "form",
          name: "workbench_directory",
          elements: [
            {
              tag: "select_static",
              name: "provider",
              label: plainText("Agent"),
              placeholder: plainText("选择 Agent"),
              options: input.providers.map((provider) => ({ text: plainText(provider), value: provider }))
            },
            {
              tag: "select_static",
              name: "workspace_path",
              label: plainText("常用目录"),
              placeholder: plainText("选择常用目录"),
              options: input.workspaces.map((workspace) => ({
                text: plainText(workspace.label),
                value: workspace.path
              }))
            },
            {
              tag: "input",
              name: "manual_path",
              label: plainText("手动输入目录"),
              placeholder: plainText("/Users/yb/Desktop/code/project")
            }
          ],
          submit: {
            tag: "button",
            text: plainText("保存并继续"),
            type: "primary",
            value: {
              action: "act:/workbench directory submit",
              interaction_id: input.interactionId
            }
          }
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
