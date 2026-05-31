import type { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import type { FeishuCloudDocClientPort } from "@integrations/feishu/feishu-cloud-doc-client.js";

type RequirementRenderInput = {
  chatId?: string;
  requirementId?: string;
  [key: string]: unknown;
};

type MinimalCardElement =
  | { tag: "markdown"; content: string }
  | { tag: "action"; actions: MinimalButtonElement[] }
  | { tag: "form"; name: string; elements: MinimalFormElement[] };

type MinimalButtonElement = {
  tag: "button";
  text: { tag: "plain_text"; content: string };
  type: "default" | "primary" | "danger";
  value?: Record<string, string>;
};

type MinimalFormElement =
  | { tag: "input"; name: string; placeholder: { tag: "plain_text"; content: string }; input_type?: "multiline" }
  | {
      tag: "button";
      text: { tag: "plain_text"; content: string };
      type: "default" | "primary" | "danger";
      action_type: "form_submit";
      name: string;
      value: Record<string, string>;
    };

interface MinimalFeishuCard {
  schema: "2.0";
  config: { wide_screen_mode: true; update_multi: true };
  header: { template: string; title: { tag: "plain_text"; content: string } };
  body: { elements: MinimalCardElement[] };
}

function plainText(content: string): { tag: "plain_text"; content: string } {
  return { tag: "plain_text", content };
}

function buildMinimalCard(title: string, color: string, body: string): MinimalFeishuCard {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: color, title: plainText(title) },
    body: { elements: [{ tag: "markdown", content: body }] }
  };
}

function validateRequiredFields(input: RequirementRenderInput): { chatId: string; requirementId: string } {
  if (!input.chatId) {
    throw new Error("Missing required field: chatId");
  }
  if (!input.requirementId) {
    throw new Error("Missing required field: requirementId");
  }
  return { chatId: input.chatId, requirementId: input.requirementId };
}

function buildPlanReviewActionButton(
  text: string,
  type: "primary" | "danger" | "default",
  requirementId: string,
  action: string,
  planVersion?: number
): MinimalButtonElement {
  const value: Record<string, string> = { action, requirement_id: requirementId };
  if (planVersion !== undefined) {
    value.plan_version = String(planVersion);
  }
  return { tag: "button", text: plainText(text), type, value };
}

function buildPlanReviewLinkCard(
  requirementId: string,
  planVersion: number,
  summary: string | undefined,
  docUrl: string
): MinimalFeishuCard {
  const summaryLine = summary ? `**摘要**：${summary}\n\n` : "";
  const bodyContent = [
    `**需求 ID**：${requirementId}`,
    `**计划版本**：v${planVersion}`,
    "",
    summaryLine + `[查看完整计划文档（云文档）](${docUrl})`
  ].join("\n");

  const approveButton = buildPlanReviewActionButton(
    "确认计划",
    "primary",
    requirementId,
    "act:/requirement plan approve",
    planVersion
  );
  const cancelButton = buildPlanReviewActionButton(
    "取消",
    "danger",
    requirementId,
    "act:/requirement plan cancel"
  );

  const reviseForm: MinimalCardElement = {
    tag: "form",
    name: "requirement_plan_revision",
    elements: [
      {
        tag: "input",
        name: "revision_note",
        placeholder: plainText("请输入修改意见，例如：补充验收标准；拆解步骤粒度"),
        input_type: "multiline"
      },
      {
        tag: "button",
        text: plainText("要求修改"),
        type: "default",
        action_type: "form_submit",
        name: "submit_requirement_revision",
        value: {
          action: "act:/requirement plan revise submit",
          requirement_id: requirementId,
          plan_version: String(planVersion)
        }
      }
    ]
  };

  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: "blue", title: plainText(`需求计划待确认 · ${requirementId}`) },
    body: {
      elements: [
        { tag: "markdown", content: bodyContent },
        { tag: "action", actions: [approveButton, cancelButton] },
        reviseForm
      ]
    }
  };
}

function buildExecutionProgressCard(requirementId: string, input: RequirementRenderInput): MinimalFeishuCard {
  const result = input.result as Record<string, unknown> | undefined;
  const status = result && typeof result.status === "string" ? result.status : "unknown";
  return buildMinimalCard(
    `需求执行进度 · ${requirementId}`,
    "blue",
    [`**需求 ID**：${requirementId}`, `**状态**：${status}`].join("\n")
  );
}

function buildReportCard(title: string, requirementId: string, input: RequirementRenderInput): MinimalFeishuCard {
  const report = typeof input.report === "string" ? input.report : "_无验收报告_";
  return buildMinimalCard(title, "green", [`**需求 ID**：${requirementId}`, "", report].join("\n"));
}

interface RequirementRenderEntry {
  effectType: string;
  buildCard(requirementId: string, input: RequirementRenderInput): MinimalFeishuCard;
}

const SIMPLE_RENDER_ENTRIES: readonly RequirementRenderEntry[] = [
  { effectType: "requirement.execution_progress.render", buildCard: buildExecutionProgressCard },
  {
    effectType: "requirement.verification_result.render",
    buildCard: (requirementId, input) => buildReportCard(`需求验收结果 · ${requirementId}`, requirementId, input)
  },
  {
    effectType: "requirement.acceptance_result.render",
    buildCard: (requirementId, input) => buildReportCard(`需求验收完成 · ${requirementId}`, requirementId, input)
  }
];

function registerSimpleCardEffects(
  registry: EffectHandlerRegistry,
  client: Pick<FeishuClientPort, "sendInteractiveCard">
): void {
  for (const entry of SIMPLE_RENDER_ENTRIES) {
    registry.register({
      pluginId: "feishu",
      effectType: entry.effectType,
      execute: async (effect) => {
        const input = effect.input as RequirementRenderInput;
        const { chatId, requirementId } = validateRequiredFields(input);
        const card = entry.buildCard(requirementId, input);
        const messageId = await client.sendInteractiveCard(chatId, card);
        return { rendered: true, messageId };
      }
    });
  }
}

function registerPlanReviewEffect(
  registry: EffectHandlerRegistry,
  client: Pick<FeishuClientPort, "sendInteractiveCard">,
  cloudDoc: FeishuCloudDocClientPort
): void {
  registry.register({
    pluginId: "feishu",
    effectType: "requirement.plan_review.render",
    execute: async (effect) => {
      const input = effect.input as RequirementRenderInput;
      const { chatId, requirementId } = validateRequiredFields(input);

      const planVersion = typeof input.planVersion === "number" ? input.planVersion : 1;
      const markdown = String(input.markdown ?? "");
      const summary = typeof input.summary === "string" ? input.summary : undefined;
      const docTitle = `需求计划 ${requirementId} v${planVersion}`;

      const { documentId } = await cloudDoc.createDoc({ title: docTitle });
      await cloudDoc.writeMarkdown({ documentId, markdown });
      const docUrl = cloudDoc.buildDocUrl(documentId);

      const card = buildPlanReviewLinkCard(requirementId, planVersion, summary, docUrl);
      const messageId = await client.sendInteractiveCard(chatId, card);

      return { rendered: true, messageId, documentId, docUrl };
    }
  });
}

export function registerFeishuRequirementRenderEffects(
  registry: EffectHandlerRegistry,
  client: Pick<FeishuClientPort, "sendInteractiveCard">,
  cloudDoc: FeishuCloudDocClientPort
): void {
  registerPlanReviewEffect(registry, client, cloudDoc);
  registerSimpleCardEffects(registry, client);
}
