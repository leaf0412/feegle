import { describe, expect, it } from "vitest";
import { gitlabEventToTriggerEvent } from "@integrations/gitlab/gitlab-trigger-event-adapter.js";

describe("gitlab trigger event adapter", () => {
  it("converts an issue event to a TriggerEvent", () => {
    const event = gitlabEventToTriggerEvent({
      triggerEventId: "trg_gl",
      receivedAt: "2026-05-31T00:00:00.000Z",
      host: "gitlab.com",
      projectId: 42,
      eventType: "issue",
      resourceType: "issue",
      resourceIid: 1,
      action: "open",
      payload: { title: "Fix bug" }
    });

    expect(event.source.pluginId).toBe("gitlab");
    expect(event.source.triggerType).toBe("issue");
    expect(event.payloadSummary).toHaveProperty("title", "Fix bug");
    expect(event.conversationHint).toHaveProperty("conversationKey");
  });

  it("converts a merge request event to a TriggerEvent", () => {
    const event = gitlabEventToTriggerEvent({
      triggerEventId: "trg_mr",
      receivedAt: "2026-05-31T00:00:00.000Z",
      host: "gitlab.example.com",
      projectId: 100,
      eventType: "merge_request",
      resourceType: "merge_request",
      resourceIid: 5,
      action: "open",
      payload: { title: "Add feature" }
    });

    expect(event.source.triggerType).toBe("merge_request");
    expect(event.external).toHaveProperty("resourceIid", 5);
  });
});
