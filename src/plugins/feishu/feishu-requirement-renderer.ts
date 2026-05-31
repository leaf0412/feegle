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
  | { tag: "form"; name: string; elements: MinimalFormElement[] };

type MinimalFormSubmitButton = {
  tag: "button";
  text: { tag: "plain_text"; content: string };
  type: "default" | "primary" | "danger";
  action_type: "form_submit";
  name: string;
  value: Record<string, string>;
};

type MinimalFormElement =
  | { tag: "input"; name: string; placeholder: { tag: "plain_text"; content: string } }
  | MinimalFormSubmitButton;

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

function actionValue(requirementId: string, action: string, planVersion?: number): Record<string, string> {
  const value: Record<string, string> = { action, requirement_id: requirementId };
  if (planVersion !== undefined) {
    value.plan_version = String(planVersion);
  }
  return value;
}

// schema 2.0 dropped the standalone `tag: "action"` block, so every interactive
// button must live inside a form as a form_submit button (matching the workbench
// bind-repo card). A single-button form carries no inputs; the button value
// arrives at the action top level, exactly what parseFeishuCardActionValue reads.
function formSubmitButton(
  text: string,
  type: "primary" | "danger" | "default",
  name: string,
  value: Record<string, string>
): MinimalFormSubmitButton {
  return { tag: "button", text: plainText(text), type, action_type: "form_submit", name, value };
}

function singleButtonForm(formName: string, button: MinimalFormSubmitButton): MinimalCardElement {
  return { tag: "form", name: formName, elements: [button] };
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

  // approve / revise / cancel all live in one form (schema 2.0 has no standalone
  // action block). revision_note is optional, so approve & cancel submit cleanly
  // without tripping input validation — same trick as the workbench bind-repo card.
  const actionsForm: MinimalCardElement = {
    tag: "form",
    name: "requirement_plan_actions",
    elements: [
      {
        tag: "input",
        name: "revision_note",
        placeholder: plainText("（可选）要求修改时填写：补充验收标准；拆解步骤粒度")
      },
      formSubmitButton(
        "确认计划",
        "primary",
        "submit_requirement_plan_approve",
        actionValue(requirementId, "act:/requirement plan approve", planVersion)
      ),
      formSubmitButton(
        "要求修改",
        "default",
        "submit_requirement_plan_revise",
        actionValue(requirementId, "act:/requirement plan revise submit", planVersion)
      ),
      formSubmitButton(
        "取消",
        "danger",
        "submit_requirement_plan_cancel",
        actionValue(requirementId, "act:/requirement plan cancel")
      )
    ]
  };

  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: "blue", title: plainText(`需求计划待确认 · ${requirementId}`) },
    body: {
      elements: [{ tag: "markdown", content: bodyContent }, actionsForm]
    }
  };
}

function buildPlanApprovedCard(requirementId: string, input: RequirementRenderInput): MinimalFeishuCard {
  const planVersion = typeof input.planVersion === "number" ? input.planVersion : 1;
  const bodyContent = [`**需求 ID**：${requirementId}`, `**计划版本**：v${planVersion}`].join("\n");
  const executeButton = formSubmitButton(
    "执行开发",
    "primary",
    "submit_requirement_execute",
    actionValue(requirementId, "act:/requirement execute", planVersion)
  );
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: "green", title: plainText(`✅ 计划已批准 (v${planVersion}) · ${requirementId}`) },
    body: {
      elements: [
        { tag: "markdown", content: bodyContent },
        singleButtonForm("requirement_execute_action", executeButton)
      ]
    }
  };
}

function buildExecutionProgressCard(requirementId: string, input: RequirementRenderInput): MinimalFeishuCard {
  const result = input.result as Record<string, unknown> | undefined;
  const status = result && typeof result.status === "string" ? result.status : "unknown";
  const bodyContent = [`**需求 ID**：${requirementId}`, `**状态**：${status}`].join("\n");
  const verifyButton = formSubmitButton(
    "验证",
    "primary",
    "submit_requirement_verify",
    actionValue(requirementId, "act:/requirement verify")
  );
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: "blue", title: plainText(`需求执行进度 · ${requirementId}`) },
    body: {
      elements: [
        { tag: "markdown", content: bodyContent },
        singleButtonForm("requirement_verify_action", verifyButton)
      ]
    }
  };
}

function buildVerificationResultCard(requirementId: string, input: RequirementRenderInput): MinimalFeishuCard {
  const report = typeof input.report === "string" ? input.report : "_无验收报告_";
  const bodyContent = [`**需求 ID**：${requirementId}`, "", report].join("\n");
  const result = input.result as Record<string, unknown> | undefined;
  const passed = result && result.status === "passed";
  const elements: MinimalCardElement[] = [{ tag: "markdown", content: bodyContent }];
  if (passed) {
    const acceptButton = formSubmitButton(
      "验收",
      "primary",
      "submit_requirement_accept",
      actionValue(requirementId, "act:/requirement accept")
    );
    elements.push(singleButtonForm("requirement_accept_action", acceptButton));
  }
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: { template: passed ? "green" : "red", title: plainText(`需求验收结果 · ${requirementId}`) },
    body: { elements }
  };
}

function buildAcceptanceResultCard(requirementId: string, input: RequirementRenderInput): MinimalFeishuCard {
  const report = typeof input.report === "string" ? input.report : "_无验收报告_";
  return buildMinimalCard(
    `🎉 需求已验收 · ${requirementId}`,
    "green",
    [`**需求 ID**：${requirementId}`, "", report].join("\n")
  );
}

function registerSimpleCardEffects(
  registry: EffectHandlerRegistry,
  client: Pick<FeishuClientPort, "sendInteractiveCard">
): void {
  registry.register({
    pluginId: "feishu",
    effectType: "requirement.acceptance_result.render",
    execute: async (effect) => {
      const input = effect.input as RequirementRenderInput;
      const { chatId, requirementId } = validateRequiredFields(input);
      const card = buildAcceptanceResultCard(requirementId, input);
      const messageId = await client.sendInteractiveCard(chatId, card);
      return { rendered: true, messageId };
    }
  });
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

function registerPlanApprovedEffect(
  registry: EffectHandlerRegistry,
  client: Pick<FeishuClientPort, "sendInteractiveCard">
): void {
  registry.register({
    pluginId: "feishu",
    effectType: "requirement.plan_approved.render",
    execute: async (effect) => {
      const input = effect.input as RequirementRenderInput;
      const { chatId, requirementId } = validateRequiredFields(input);
      const card = buildPlanApprovedCard(requirementId, input);
      const messageId = await client.sendInteractiveCard(chatId, card);
      return { rendered: true, messageId };
    }
  });
}

function registerExecutionProgressEffect(
  registry: EffectHandlerRegistry,
  client: Pick<FeishuClientPort, "sendInteractiveCard">
): void {
  registry.register({
    pluginId: "feishu",
    effectType: "requirement.execution_progress.render",
    execute: async (effect) => {
      const input = effect.input as RequirementRenderInput;
      const { chatId, requirementId } = validateRequiredFields(input);
      const card = buildExecutionProgressCard(requirementId, input);
      const messageId = await client.sendInteractiveCard(chatId, card);
      return { rendered: true, messageId };
    }
  });
}

function registerVerificationResultEffect(
  registry: EffectHandlerRegistry,
  client: Pick<FeishuClientPort, "sendInteractiveCard">
): void {
  registry.register({
    pluginId: "feishu",
    effectType: "requirement.verification_result.render",
    execute: async (effect) => {
      const input = effect.input as RequirementRenderInput;
      const { chatId, requirementId } = validateRequiredFields(input);
      const card = buildVerificationResultCard(requirementId, input);
      const messageId = await client.sendInteractiveCard(chatId, card);
      return { rendered: true, messageId };
    }
  });
}

export function registerFeishuRequirementRenderEffects(
  registry: EffectHandlerRegistry,
  client: Pick<FeishuClientPort, "sendInteractiveCard">,
  cloudDoc: FeishuCloudDocClientPort
): void {
  registerPlanReviewEffect(registry, client, cloudDoc);
  registerPlanApprovedEffect(registry, client);
  registerExecutionProgressEffect(registry, client);
  registerVerificationResultEffect(registry, client);
  registerSimpleCardEffects(registry, client);
}
