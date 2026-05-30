import { describe, expect, it } from "vitest";
import { feishuMessageEnvelopeToTriggerEvent } from "../../src/feishu/feishu-trigger-event-adapter.js";

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
    expect(event.conversationHint).toEqual({ chatId: "oc_1" });
    expect(event.payloadSummary).toEqual({ commandType: "chat", textLength: 5 });
  });
});
