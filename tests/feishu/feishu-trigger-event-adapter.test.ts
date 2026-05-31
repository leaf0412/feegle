import { describe, expect, it } from "vitest";
import {
  feishuBotMenuToTriggerEvent,
  feishuCardActionToTriggerEvent,
  feishuMessageEnvelopeToTriggerEvent
} from "@integrations/feishu/feishu-trigger-event-adapter.js";

describe("feishu trigger event adapter", () => {
  it("converts a routed Feishu message envelope into an open TriggerEvent", () => {
    const event = feishuMessageEnvelopeToTriggerEvent({
      triggerEventId: "trg_1",
      receivedAt: "2026-05-31T00:00:00.000Z",
      chatId: "oc_1",
      messageId: "om_1",
      senderUserId: "ou_1",
      commandType: "chat",
      textLength: 5
    });

    expect(event.source).toEqual({
      pluginId: "feishu",
      adapterId: "long_connection",
      triggerType: "message"
    });
    expect(event.conversationHint).toEqual({ conversationKey: "feishu:oc_1" });
    expect(event.actorHint).toEqual({ provider: "feishu", externalUserId: "ou_1" });
    expect(event.payloadSummary).toEqual({ commandType: "chat", textLength: 5 });
  });

  it("converts a card action into a TriggerEvent", () => {
    const event = feishuCardActionToTriggerEvent({
      triggerEventId: "trg_card",
      receivedAt: "2026-05-31T00:00:00.000Z",
      chatId: "oc_2",
      messageId: "om_2",
      senderUserId: "ou_2",
      actionType: "approve_step",
      actionPayload: { stepStateId: "step_1" }
    });

    expect(event.source.triggerType).toBe("card_action");
    expect(event.external).toHaveProperty("actionType", "approve_step");
    expect(event.conversationHint).toEqual({ conversationKey: "feishu:oc_2" });
  });

  it("converts a bot menu event into a TriggerEvent with bot_menu trigger type", () => {
    const event = feishuBotMenuToTriggerEvent({
      triggerEventId: "trg_bot_menu",
      receivedAt: "2026-05-31T00:00:00.000Z",
      chatId: "ou_alice",
      messageId: "menu:ou_alice:help:1717000000000",
      senderUserId: "ou_alice",
      commandText: "help"
    });

    expect(event.source.triggerType).toBe("bot_menu");
    expect(event.source.pluginId).toBe("feishu");
    expect(event.external).toHaveProperty("commandText", "help");
    expect(event.conversationHint).toEqual({ conversationKey: "feishu:ou_alice" });
    expect(event.actorHint).toEqual({ provider: "feishu", externalUserId: "ou_alice" });
  });
});
