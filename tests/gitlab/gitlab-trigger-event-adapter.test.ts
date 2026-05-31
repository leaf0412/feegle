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

  it("redacts sensitive fields in payload summary", () => {
    const event = gitlabEventToTriggerEvent({
      triggerEventId: "trg_redact",
      receivedAt: "2026-05-31T00:00:00.000Z",
      host: "gitlab.internal",
      projectId: 1,
      eventType: "issue",
      resourceType: "issue",
      resourceIid: 99,
      action: "update",
      payload: {
        title: "Fix login bug",
        token: "glpat-secret123",
        password: "s3cur3",
        secret: "shhh",
        api_key: "key-abc",
        public_field: "visible"
      }
    });

    expect(event.payloadSummary.token).toBe("[REDACTED]");
    expect(event.payloadSummary.password).toBe("[REDACTED]");
    expect(event.payloadSummary.secret).toBe("[REDACTED]");
    expect(event.payloadSummary.api_key).toBe("[REDACTED]");
    expect(event.payloadSummary.public_field).toBe("visible");
    expect(event.payloadSummary.title).toBe("Fix login bug");
  });

  it("sets workspace/project conversation key for resolution", () => {
    const event = gitlabEventToTriggerEvent({
      triggerEventId: "trg_ws",
      receivedAt: "2026-05-31T00:00:00.000Z",
      host: "gitlab.mycompany.com",
      projectId: 77,
      eventType: "merge_request",
      resourceType: "merge_request",
      resourceIid: 12,
      action: "open",
      payload: { title: "MR for review" }
    });

    expect(event.conversationHint).toHaveProperty("conversationKey");
    expect(event.conversationHint!.conversationKey).toBe(
      "gitlab:gitlab.mycompany.com:77:merge_request:12"
    );
  });
});
