import { describe, expect, it } from "vitest";
import { WorkflowSelector } from "../../src/ingress/workflow-selector.js";

describe("WorkflowSelector", () => {
  it("selects a workflow definition from a resolved intent", () => {
    const selector = new WorkflowSelector();
    selector.register({
      id: "chat-selector",
      matches: (intent) => intent.kind === "chat",
      definitionId: "feishu.chat.workflow"
    });

    const selected = selector.select({
      intentId: "intent_1",
      kind: "chat",
      workspaceId: "ws_1",
      projectId: null,
      actor: { kind: "user", userId: "user_1" },
      payload: { text: "hello" }
    });

    expect(selected.definitionId).toBe("feishu.chat.workflow");
  });
});
