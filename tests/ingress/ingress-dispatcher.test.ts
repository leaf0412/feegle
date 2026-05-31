import { describe, expect, it } from "vitest";
import { IngressDispatcher } from "@core/ingress/ingress-dispatcher.js";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";

function stubResolvers() {
  return {
    identityResolver: {
      resolve: () => ({ status: "resolved" as const, userId: "user_1", displayName: "Test User" })
    },
    workspaceResolver: {
      resolve: () =>
        ({
          status: "resolved" as const,
          workspaceId: "ws_1",
          projectId: null,
          conversationKey: "chat_1"
        })
    },
    permissionPolicy: {
      checkPermission: () => ({ allowed: true, role: "member" as const, reason: "member" }),
      decide: () => ({ kind: "allow" as const })
    }
  };
}

function stubEventSink() {
  const emitted: unknown[] = [];
  return {
    emitted,
    sink: {
      emit: (input: unknown) => {
        emitted.push(input);
      }
    }
  };
}

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
    const { sink } = stubEventSink();
    const dispatcher = new IngressDispatcher({
      ...stubResolvers(),
      intentResolvers: resolvers,
      workflowSelector: selector,
      workflowRuntime: {
        start: async (input: unknown) => {
          starts.push(input);
          return { status: "succeeded" as const };
        }
      },
      eventSink: sink,
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

  it("returns failed when policy denies", async () => {
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
        payload: {}
      })
    });
    const selector = new WorkflowSelector();
    selector.register({ id: "chat", matches: () => true, definitionId: "test.chat" });
    const starts: unknown[] = [];
    const { sink } = stubEventSink();
    const dispatcher = new IngressDispatcher({
      ...stubResolvers(),
      permissionPolicy: {
        checkPermission: () => ({ allowed: false, role: null, reason: "not a member" }),
        decide: () => ({ kind: "deny" as const, reason: "not a member" })
      },
      intentResolvers: resolvers,
      workflowSelector: selector,
      workflowRuntime: {
        start: async (input: unknown) => {
          starts.push(input);
          return { status: "succeeded" as const };
        }
      },
      eventSink: sink,
      idFactory: {
        workflowInstanceId: () => "wfi_1",
        runAttemptId: () => "run_1"
      },
      clock: { nowIso: () => "2026-05-31T00:00:00.000Z" }
    });

    const result = await dispatcher.dispatch({
      triggerEventId: "trg_2",
      source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "message" },
      receivedAt: "2026-05-31T00:00:00.000Z",
      external: {},
      payloadSummary: {}
    });

    expect(result.status).toBe("failed");
    expect(starts).toHaveLength(0);
  });

  it("emits diagnostic events for each pipeline stage", async () => {
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
        payload: {}
      })
    });
    const selector = new WorkflowSelector();
    selector.register({ id: "chat", matches: () => true, definitionId: "test.chat" });
    const { sink, emitted } = stubEventSink();
    const dispatcher = new IngressDispatcher({
      ...stubResolvers(),
      intentResolvers: resolvers,
      workflowSelector: selector,
      workflowRuntime: {
        start: async () => ({ status: "succeeded" as const })
      },
      eventSink: sink,
      idFactory: {
        workflowInstanceId: () => "wfi_1",
        runAttemptId: () => "run_1"
      },
      clock: { nowIso: () => "2026-05-31T00:00:00.000Z" }
    });

    await dispatcher.dispatch({
      triggerEventId: "trg_3",
      source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "message" },
      receivedAt: "2026-05-31T00:00:00.000Z",
      external: {},
      payloadSummary: {}
    });

    const types = (emitted as Array<{ type: string }>).map((e) => e.type);
    expect(types).toContain("ingress.identity_resolved");
    expect(types).toContain("ingress.workspace_resolved");
    expect(types).toContain("ingress.permission_checked");
    expect(types).toContain("ingress.policy_decided");
  });
});
