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

type MinimalInputElement = {
  tag: "input";
  name: string;
  placeholder: { tag: "plain_text"; content: string };
  // schema 2.0 multi-line input: input_type "multiline_text" (NOT "multiline"),
  // rows = initial line count, auto_resize grows it on PC up to max_rows.
  input_type?: "multiline_text";
  rows?: number;
  auto_resize?: boolean;
  max_rows?: number;
};

type MinimalFormElement = MinimalInputElement | MinimalFormSubmitButton;

function multilineInput(name: string, placeholder: string): MinimalInputElement {
  return {
    tag: "input",
    name,
    placeholder: plainText(placeholder),
    input_type: "multiline_text",
    rows: 4,
    auto_resize: true,
    max_rows: 12
  };
}

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

function readCardMessageId(input: RequirementRenderInput): string | undefined {
  return typeof input.cardMessageId === "string" && input.cardMessageId.length > 0
    ? input.cardMessageId
    : undefined;
}

// Lock the card a button was clicked on: re-render it buttonless so it reads as
// a settled history entry and can't be re-clicked. The next interactive card is
// sent as a NEW message, so each click lands on its own message id.
function buildLockedCard(requirementId: string, input: RequirementRenderInput): MinimalFeishuCard {
  const title = typeof input.lockedTitle === "string" && input.lockedTitle.length > 0
    ? input.lockedTitle
    : `已处理 · ${requirementId}`;
  const note = typeof input.lockedNote === "string" ? input.lockedNote : "";
  const docUrl = typeof input.docUrl === "string" && input.docUrl.length > 0 ? input.docUrl : undefined;
  const lines = [`**需求 ID**：${requirementId}`];
  if (note) {
    lines.push("", note);
  }
  if (docUrl) {
    lines.push("", `[查看计划文档（云文档）](${docUrl})`);
  }
  return buildMinimalCard(title, "grey", lines.join("\n"));
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
      multilineInput("revision_note", "（可选）要求修改时填写：补充验收标准；拆解步骤粒度；指出风险点等，可多行输入"),
      formSubmitButton(
        "确认计划",
        "primary",
        "submit_requirement_plan_approve",
        // carry doc_url forward so 确认→开发→回退 can re-link the cloud doc
        { ...actionValue(requirementId, "act:/requirement plan approve", planVersion), doc_url: docUrl }
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

type DevelopmentPhase = "developing" | "completed" | "failed";

function readDevelopmentPhase(input: RequirementRenderInput): DevelopmentPhase {
  if (input.phase === "developing" || input.phase === "failed") {
    return input.phase;
  }
  return "completed";
}

// One evolving card across the development phase: approve flips it to
// "developing" (locked, no buttons) while the agent runs, then to "completed"
// (结束/取消) or "failed" (取消) when the synchronous run resolves.
function buildDevelopmentCard(requirementId: string, input: RequirementRenderInput): MinimalFeishuCard {
  const phase = readDevelopmentPhase(input);
  const planVersion = typeof input.planVersion === "number" ? input.planVersion : 1;
  const docUrl = typeof input.docUrl === "string" ? input.docUrl : undefined;
  const base = {
    schema: "2.0" as const,
    config: { wide_screen_mode: true as const, update_multi: true as const }
  };
  const cancelButton = formSubmitButton(
    "取消",
    "danger",
    "submit_requirement_plan_cancel",
    actionValue(requirementId, "act:/requirement plan cancel")
  );
  // 回退到计划: carries doc_url so the re-rendered plan-review card re-links the
  // existing cloud doc instead of creating a new one.
  const backButton = formSubmitButton("回退上一步", "default", "submit_requirement_plan_back", {
    ...actionValue(requirementId, "act:/requirement plan back", planVersion),
    ...(docUrl ? { doc_url: docUrl } : {})
  });

  if (phase === "developing") {
    return {
      ...base,
      header: { template: "blue", title: plainText(`🛠 开发中 · ${requirementId}`) },
      body: {
        elements: [{ tag: "markdown", content: [`**需求 ID**：${requirementId}`, "", "正在执行开发，请稍候…"].join("\n") }]
      }
    };
  }

  if (phase === "failed") {
    const error = typeof input.error === "string" && input.error.length > 0 ? input.error : "开发执行失败";
    return {
      ...base,
      header: { template: "red", title: plainText(`❌ 开发失败 · ${requirementId}`) },
      body: {
        elements: [
          { tag: "markdown", content: [`**需求 ID**：${requirementId}`, "", `开发执行失败：${error}`].join("\n") },
          { tag: "form", name: "requirement_dev_failed_actions", elements: [backButton, cancelButton] }
        ]
      }
    };
  }

  const result = input.result as Record<string, unknown> | undefined;
  const status = result && typeof result.status === "string" ? result.status : "implementation_ready";
  const finishButton = formSubmitButton(
    "结束",
    "primary",
    "submit_requirement_verify",
    actionValue(requirementId, "act:/requirement verify")
  );
  return {
    ...base,
    header: { template: "green", title: plainText(`✅ 开发完成 · ${requirementId}`) },
    body: {
      elements: [
        {
          tag: "markdown",
          content: [`**需求 ID**：${requirementId}`, `**状态**：${status}`, "", "开发已完成。点「结束」进入验证，「回退上一步」回到计划，或「取消」放弃本需求。"].join("\n")
        },
        { tag: "form", name: "requirement_dev_actions", elements: [finishButton, backButton, cancelButton] }
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
  client: Pick<FeishuClientPort, "sendInteractiveCard" | "updateInteractiveCard">
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

  // Lock the clicked card in place (buttonless) so it can't be re-clicked. This
  // is how every action settles its source card before the next card is sent;
  // 取消 uses it as its terminal state.
  registry.register({
    pluginId: "feishu",
    effectType: "requirement.card_locked.render",
    execute: async (effect) => {
      const input = effect.input as RequirementRenderInput;
      if (!input.requirementId) {
        throw new Error("Missing required field: requirementId");
      }
      const cardMessageId = readCardMessageId(input);
      if (!cardMessageId) {
        throw new Error("Missing required field: cardMessageId");
      }
      const card = buildLockedCard(input.requirementId, input);
      await client.updateInteractiveCard(cardMessageId, card);
      return { rendered: true, messageId: cardMessageId };
    }
  });
}

function registerPlanReviewEffect(
  registry: EffectHandlerRegistry,
  client: Pick<FeishuClientPort, "sendInteractiveCard" | "updateInteractiveCard">,
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
      const providedDocUrl = typeof input.docUrl === "string" && input.docUrl.length > 0 ? input.docUrl : undefined;

      // 回退 re-renders this card with the doc already published — reuse the
      // carried docUrl instead of creating a duplicate cloud doc.
      let documentId: string | undefined;
      let docUrl: string;
      if (providedDocUrl) {
        docUrl = providedDocUrl;
      } else {
        const created = await cloudDoc.createDoc({ title: `需求计划 ${requirementId} v${planVersion}` });
        documentId = created.documentId;
        await cloudDoc.writeMarkdown({ documentId, markdown });
        docUrl = cloudDoc.buildDocUrl(documentId);
      }

      const card = buildPlanReviewLinkCard(requirementId, planVersion, summary, docUrl);
      const messageId = await client.sendInteractiveCard(chatId, card);

      return { rendered: true, messageId, ...(documentId ? { documentId } : {}), docUrl };
    }
  });
}

function registerDevelopmentEffect(
  registry: EffectHandlerRegistry,
  client: Pick<FeishuClientPort, "sendInteractiveCard" | "updateInteractiveCard">
): void {
  registry.register({
    pluginId: "feishu",
    effectType: "requirement.execution_progress.render",
    execute: async (effect) => {
      const input = effect.input as RequirementRenderInput;
      const { chatId, requirementId } = validateRequiredFields(input);
      const card = buildDevelopmentCard(requirementId, input);
      const messageId = await client.sendInteractiveCard(chatId, card);
      return { rendered: true, messageId };
    }
  });
}

function registerVerificationResultEffect(
  registry: EffectHandlerRegistry,
  client: Pick<FeishuClientPort, "sendInteractiveCard" | "updateInteractiveCard">
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
  client: Pick<FeishuClientPort, "sendInteractiveCard" | "updateInteractiveCard">,
  cloudDoc: FeishuCloudDocClientPort
): void {
  registerPlanReviewEffect(registry, client, cloudDoc);
  registerDevelopmentEffect(registry, client);
  registerVerificationResultEffect(registry, client);
  registerSimpleCardEffects(registry, client);
}
