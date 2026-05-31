import type { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";

type RequirementRenderInput = {
  chatId?: string;
  requirementId?: string;
  [key: string]: unknown;
};

interface MinimalFeishuCard {
  schema: "2.0";
  config: { wide_screen_mode: true; update_multi: true };
  header: { template: string; title: { tag: "plain_text"; content: string } };
  body: { elements: Array<{ tag: "markdown"; content: string }> };
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

async function sendRequirementCard(
  client: Pick<FeishuClientPort, "sendInteractiveCard">,
  chatId: string,
  card: MinimalFeishuCard
): Promise<{ rendered: true; messageId: string | undefined }> {
  const messageId = await client.sendInteractiveCard(chatId, card);
  return { rendered: true, messageId };
}

interface RequirementRenderEntry {
  effectType: string;
  buildCard(requirementId: string, input: RequirementRenderInput): MinimalFeishuCard;
}

function buildPlanReviewCard(requirementId: string, input: RequirementRenderInput): MinimalFeishuCard {
  const markdown = typeof input.markdown === "string" ? input.markdown : "_无计划内容_";
  const version = typeof input.planVersion === "number" ? input.planVersion : 1;
  return buildMinimalCard(
    `需求计划待确认 · ${requirementId}`,
    "blue",
    [`**需求 ID**：${requirementId}`, `**计划版本**：v${version}`, "", markdown].join("\n")
  );
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

const RENDER_ENTRIES: readonly RequirementRenderEntry[] = [
  { effectType: "requirement.plan_review.render", buildCard: buildPlanReviewCard },
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

export function registerFeishuRequirementRenderEffects(
  registry: EffectHandlerRegistry,
  client: Pick<FeishuClientPort, "sendInteractiveCard">
): void {
  for (const entry of RENDER_ENTRIES) {
    registry.register({
      pluginId: "feishu",
      effectType: entry.effectType,
      execute: async (effect) => {
        const input = effect.input as RequirementRenderInput;
        const { chatId, requirementId } = validateRequiredFields(input);
        const card = entry.buildCard(requirementId, input);
        return sendRequirementCard(client, chatId, card);
      }
    });
  }
}
