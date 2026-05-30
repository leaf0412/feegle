import { describe, expect, it } from "vitest";
import { IngressDispatcher } from "../../src/ingress/ingress-dispatcher.js";
import { IntentResolverRegistry } from "../../src/ingress/intent-resolver-registry.js";
import { WorkflowSelector } from "../../src/ingress/workflow-selector.js";

describe("IngressDispatcher", () => {
  it("resolves intent, selects workflow, and starts runtime", async () => {
    const resolvers = new IntentResolverRegistry();
    resolvers.register({
      id: "test-chat",
      canResolve: () => true,
      resolve: () => ({
        intentId: "intent_1",
        kind: "chat",
        workspaceId: "ws_1",
        projectId: null,
        actor: { kind: "user", userId: "user_1" },
        payload: { text: "hello" }
      })
    });
    const selector = new WorkflowSelector();
    selector.register({ id: "chat", matches: (intent) => intent.kind === "chat", definitionId: "test.chat" });
    const starts: unknown[] = [];
    const dispatcher = new IngressDispatcher({
      intentResolvers: resolvers,
      workflowSelector: selector,
      workflowRuntime: {
        start: async (input: unknown) => {
          starts.push(input);
          return { status: "succeeded" as const };
        }
      },
      idFactory: {
        workflowInstanceId: () => "wfi_1",
        runAttemptId: () => "run_1"
      },
      clock: { nowIso: () => "2026-05-31T00:00:00.000Z" }
    });

    const result = await dispatcher.dispatch({
      triggerEventId: "trg_1",
      source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "message" },
      receivedAt: "2026-05-31T00:00:00.000Z",
      external: {},
      payloadSummary: {}
    });

    expect(result.status).toBe("succeeded");
    expect(starts).toHaveLength(1);
  });
});
