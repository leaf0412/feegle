import type { ChatWorkbenchState, WorkbenchButton } from "./workbench-models.js";
import { createPlatformCard, type PlatformCard, type PlatformCardColor, type PlatformCardButton } from "@platform/platform-card.js";

const hasRequirement = (s: ChatWorkbenchState): boolean => s.requirementText != null;
const hasPlan = (s: ChatWorkbenchState): boolean => s.planText != null;

function canManageRepos(_state: ChatWorkbenchState): boolean { return true; }
function canDiscuss(state: ChatWorkbenchState): boolean { return state.repositories.length >= 1; }
function canGeneratePlan(state: ChatWorkbenchState): boolean { return state.requirementText != null && state.planText == null; }

const canReviseRequirement = hasRequirement;
const canDeleteRequirement = hasRequirement;
const canRevisePlan = hasPlan;
const canDeletePlan = hasPlan;

function headerColor(state: ChatWorkbenchState): PlatformCardColor {
  if (state.planStale) return "orange";
  if (state.planText != null) return "green";
  if (state.requirementText != null) return "turquoise";
  return "blue";
}

interface ButtonDef {
  key: WorkbenchButton;
  text: string;
  type: PlatformCardButton["type"];
  enabled: (state: ChatWorkbenchState) => boolean;
}

const BUTTONS: ButtonDef[] = [
  { key: "manage_repos", text: "管理仓库", type: "default", enabled: canManageRepos },
  { key: "discuss_requirement", text: "讨论需求", type: "primary", enabled: canDiscuss },
  { key: "revise_requirement", text: "修订需求", type: "default", enabled: canReviseRequirement },
  { key: "delete_requirement", text: "删除需求", type: "danger", enabled: canDeleteRequirement },
  { key: "generate_plan", text: "生成计划", type: "primary", enabled: canGeneratePlan },
  { key: "revise_plan", text: "修订计划", type: "default", enabled: canRevisePlan },
  { key: "delete_plan", text: "删除计划", type: "danger", enabled: canDeletePlan },
];

export function renderWorkbenchCard(state: ChatWorkbenchState): PlatformCard {
  const builder = createPlatformCard()
    .title("工作台", headerColor(state));

  const repoList = state.repositories.length > 0
    ? state.repositories.map((r) => `• ${r}`).join("\n")
    : "暂无仓库";
  builder.markdown(`**仓库** (${state.repositories.length})\n${repoList}`);
  builder.buttonRow(
    BUTTONS.filter((b) => b.key === "manage_repos").map(toButton),
    "row",
  );

  builder.divider();

  const reqDisplay = state.requirementDocUrl
    ? `[需求文档](${state.requirementDocUrl})`
    : "未设定";
  builder.markdown(`**需求** ${reqDisplay}`);

  const reqButtons = BUTTONS
    .filter((b) => ["discuss_requirement", "revise_requirement", "delete_requirement"].includes(b.key))
    .filter((b) => b.enabled(state))
    .map(toButton);
  if (reqButtons.length > 0) {
    builder.buttonRow(reqButtons, "row");
  }

  builder.divider();

  const planDisplay = state.planDocUrl
    ? `[计划文档](${state.planDocUrl})`
    : state.planText != null ? "已有计划" : "─";
  builder.markdown(`**计划** ${planDisplay}`);

  if (state.planStale) {
    builder.markdown("⚠️ 需求已变更, 需重新生成计划");
  }

  const planButtons = BUTTONS
    .filter((b) => ["generate_plan", "revise_plan", "delete_plan"].includes(b.key))
    .filter((b) => b.enabled(state))
    .map(toButton);
  if (planButtons.length > 0) {
    builder.buttonRow(planButtons, "row");
  }

  return builder.build();
}

const WORKBENCH_ACTION: Record<WorkbenchButton, string> = {
  manage_repos: "manage_repos",
  add_repo: "add_repo",
  remove_repo: "remove_repo",
  back: "back",
  discuss_requirement: "discuss",
  revise_requirement: "revise_requirement",
  generate_plan: "generate_plan",
  revise_plan: "revise_plan",
  delete_requirement: "delete_requirement",
  delete_plan: "delete_plan",
};

function toButton(def: ButtonDef): PlatformCardButton {
  return { text: def.text, type: def.type, action: `act:/workbench ${WORKBENCH_ACTION[def.key]}` };
}
