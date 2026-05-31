import { describe, expect, it } from "vitest";
import { createRuntimeClosedLoopHarness } from "../e2e/runtime-closed-loop-harness.js";
import { feishuMessageEnvelopeToTriggerEvent } from "@integrations/feishu/feishu-trigger-event-adapter.js";
import { gitlabEventToTriggerEvent } from "@integrations/gitlab/gitlab-trigger-event-adapter.js";
import { webhookPayloadToTriggerEvent } from "@integrations/webhook/webhook-trigger-event-adapter.js";
import { taskToTriggerEvent } from "@features/scheduler/scheduler-trigger-event.js";
import { ALL_REQUIRED_EVENTS } from "@core/runtime/runtime-event-contract.js";
import type { WorkflowStep } from "@core/runtime/runtime-models.js";
import { assertRuntimeTrace, assertSuccessPath, assertFailedPath } from "../helpers/assert-runtime-trace.js";

/**
 * Helper: given a harness, register a simple workflow for the scenario,
 * dispatch the trigger, and return the trace events.
 */
async function dispatchScenario(
  harness: Awaited<ReturnType<typeof createRuntimeClosedLoopHarness>>,
  trigger: Parameters<typeof harness.dispatcher.dispatch>[0],
  opts: {
    definitionId: string;
    steps: WorkflowStep[];
  }
) {
  harness.workflowRegistry.register({
    definitionId: opts.definitionId,
    version: 1,
    concurrencyPolicy: "skip_if_running",
    steps: opts.steps
  });

  const result = await harness.dispatcher.dispatch(trigger);
  const wfiId = `wfi_e2e_${harness.wfiCounter}`;
  const events = harness.runtimeStore.listRuntimeEvents(wfiId).map((e) => ({
    type: e.type,
    payload: e.payload
  }));

  return { result, wfiId, events };
}

describe("Runtime Event Trace Contract", () => {
  it("REQUIRED_EVENTS constant is well-formed", () => {
    // Every category has at least one event
    expect(ALL_REQUIRED_EVENTS.length).toBeGreaterThan(0);
    // Every event is a dot-separated string
    for (const e of ALL_REQUIRED_EVENTS) {
      expect(e).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
    // All events are unique
    expect(new Set(ALL_REQUIRED_EVENTS).size).toBe(ALL_REQUIRED_EVENTS.length);
  });

  it("Feishu message happy path emits required workflow events", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      harness.effectHandlerRegistry.register({
        pluginId: "feishu",
        effectType: "message.reply",
        execute(effect) {
          harness.effectCalls.push({
            pluginId: effect.pluginId,
            effectType: effect.effectType,
            input: effect.input
          });
          return { sent: true };
        }
      });

      harness.intentResolvers.register({
        id: "feishu-trace",
        canResolve(event) {
          return event.source.pluginId === "feishu" && event.source.triggerType === "message";
        },
        resolve(event) {
          return {
            intentId: `intent_${event.triggerEventId}`,
            kind: "chat" as const,
            workspaceId: "ws_e2e",
            projectId: null,
            actor: { kind: "user" as const, userId: "user_e2e" },
            payload: { text: "hello" }
          };
        }
      });

      harness.workflowSelector.register({
        id: "chat-trace",
        matches(intent) { return intent.kind === "chat"; },
        definitionId: "feishu.chat.trace.workflow"
      });

      const trigger = feishuMessageEnvelopeToTriggerEvent({
        triggerEventId: "trg_feishu_trace",
        receivedAt: "2026-05-31T00:00:00.000Z",
        chatId: "oc_e2e",
        messageId: "om_trace",
        senderUserId: "ou_e2e",
        commandType: "chat",
        textLength: 5
      });

      const { events, result } = await dispatchScenario(harness, trigger, {
        definitionId: "feishu.chat.trace.workflow",
        steps: [
          {
            stepId: "reply",
            async run(ctx) {
              await ctx.executeEffect({
                pluginId: "feishu",
                effectType: "message.reply",
                input: { text: "hi" }
              });
              return { kind: "complete" as const };
            }
          }
        ]
      });

      expect(result.status).toBe("succeeded");
      assertSuccessPath(events);
    } finally {
      await harness.close();
    }
  });

  it("failed workflow path does NOT contain attempt.completed", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      harness.intentResolvers.register({
        id: "fail-trace",
        canResolve(event) {
          return event.source.pluginId === "feishu" && event.source.triggerType === "message";
        },
        resolve(event) {
          return {
            intentId: `intent_${event.triggerEventId}`,
            kind: "chat" as const,
            workspaceId: "ws_e2e",
            projectId: null,
            actor: { kind: "user" as const, userId: "user_e2e" },
            payload: { text: "fail" }
          };
        }
      });

      harness.workflowSelector.register({
        id: "fail-trace-rule",
        matches(intent) { return intent.kind === "chat"; },
        definitionId: "fail.trace.workflow"
      });

      const trigger = feishuMessageEnvelopeToTriggerEvent({
        triggerEventId: "trg_fail_trace",
        receivedAt: "2026-05-31T00:00:00.000Z",
        chatId: "oc_e2e",
        messageId: "om_fail_trace",
        senderUserId: "ou_e2e",
        commandType: "chat",
        textLength: 4
      });

      const { events, result } = await dispatchScenario(harness, trigger, {
        definitionId: "fail.trace.workflow",
        steps: [
          {
            stepId: "failing_step",
            async run() {
              return {
                kind: "fail" as const,
                error: {
                  code: "TEST_FAILURE",
                  category: "agent_process",
                  message: "deliberate failure",
                  retryable: false,
                  recoverable: true
                },
                recoverable: true
              };
            }
          }
        ]
      });

      expect(result.status).toBe("failed");

      // Failed path must NOT contain attempt.completed
      assertFailedPath(events);

      // Must contain attempt.failed
      assertRuntimeTrace(events, {
        required: ["attempt.failed", "step.failed"]
      });
    } finally {
      await harness.close();
    }
  });

  it("no secret values leak into event payloads", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      harness.effectHandlerRegistry.register({
        pluginId: "webhook",
        effectType: "process",
        execute(effect) {
          harness.effectCalls.push({
            pluginId: effect.pluginId,
            effectType: effect.effectType,
            input: effect.input
          });
          return { processed: true };
        }
      });

      harness.intentResolvers.register({
        id: "webhook-secret",
        canResolve(event) { return event.source.pluginId === "webhook"; },
        resolve(event) {
          return {
            intentId: `intent_${event.triggerEventId}`,
            kind: "chat" as const,
            workspaceId: "ws_e2e",
            projectId: null,
            actor: { kind: "system" as const },
            payload: {
              summary: event.payloadSummary,
              sourceId: (event.external as Record<string, unknown>).sourceId
            }
          };
        }
      });

      harness.workflowSelector.register({
        id: "webhook-noleak-rule",
        matches() { return true; },
        definitionId: "webhook.noleak.workflow"
      });

      // Include known secret-like fields
      const trigger = webhookPayloadToTriggerEvent({
        triggerEventId: "trg_noleak",
        receivedAt: "2026-05-31T00:00:00.000Z",
        sourceId: "wh_noleak_1",
        pluginId: "webhook",
        headers: {
          "content-type": "application/json",
          "x-signature": "abc123"
        },
        payload: {
          action: "deploy",
          token: "sk-secret-token-value-12345",
          password: "super-secret-password",
          api_key: "key-sensitive-data"
        }
      });

      const { events, result } = await dispatchScenario(harness, trigger, {
        definitionId: "webhook.noleak.workflow",
        steps: [
          {
            stepId: "process",
            async run(ctx) {
              await ctx.executeEffect({
                pluginId: "webhook",
                effectType: "process",
                input: ctx.input
              });
              return { kind: "complete" as const };
            }
          }
        ]
      });

      expect(result.status).toBe("succeeded");

      // Assert no secret values leak into runtime event payloads
      assertRuntimeTrace(events, {
        secretValues: ["super-secret-password", "key-sensitive-data", "sk-secret-token-value-12345"]
      });
    } finally {
      await harness.close();
    }
  });

  it("GitLab path: required workflow events present", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      harness.effectHandlerRegistry.register({
        pluginId: "gitlab",
        effectType: "issue.comment",
        execute(effect) {
          harness.effectCalls.push({
            pluginId: effect.pluginId,
            effectType: effect.effectType,
            input: effect.input
          });
          return { commented: true };
        }
      });

      harness.intentResolvers.register({
        id: "gitlab-trace",
        canResolve(event) {
          return event.source.pluginId === "gitlab" && event.source.triggerType === "issue";
        },
        resolve(event) {
          return {
            intentId: `intent_${event.triggerEventId}`,
            kind: "chat" as const,
            workspaceId: "ws_e2e",
            projectId: null,
            actor: { kind: "system" as const },
            payload: {
              host: (event.external as Record<string, unknown>).host,
              projectId: (event.external as Record<string, unknown>).projectId,
              resourceType: (event.external as Record<string, unknown>).resourceType,
              resourceIid: (event.external as Record<string, unknown>).resourceIid,
              action: (event.external as Record<string, unknown>).action
            }
          };
        }
      });

      harness.workflowSelector.register({
        id: "gitlab-trace-rule",
        matches() { return true; },
        definitionId: "gitlab.trace.workflow"
      });

      const trigger = gitlabEventToTriggerEvent({
        triggerEventId: "trg_gitlab_trace",
        receivedAt: "2026-05-31T00:00:00.000Z",
        host: "gitlab.example.com",
        projectId: 42,
        eventType: "issue",
        resourceType: "issue",
        resourceIid: 7,
        action: "updated",
        payload: { title: "Trace test" }
      });

      const { events, result } = await dispatchScenario(harness, trigger, {
        definitionId: "gitlab.trace.workflow",
        steps: [
          {
            stepId: "comment",
            async run(ctx) {
              const input = ctx.input as Record<string, unknown>;
              await ctx.executeEffect({
                pluginId: "gitlab",
                effectType: "issue.comment",
                input: {
                  projectId: input.projectId as number,
                  issueIid: input.resourceIid as number,
                  body: `Processing ${input.action}`
                }
              });
              return { kind: "complete" as const };
            }
          }
        ]
      });

      expect(result.status).toBe("succeeded");
      assertSuccessPath(events);
    } finally {
      await harness.close();
    }
  });

  it("Scheduler path: required workflow events present", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      harness.effectHandlerRegistry.register({
        pluginId: "core",
        effectType: "agent.prompt",
        execute(effect) {
          harness.effectCalls.push({
            pluginId: effect.pluginId,
            effectType: effect.effectType,
            input: effect.input
          });
          return { response: "ok" };
        }
      });

      harness.intentResolvers.register({
        id: "scheduler-trace",
        canResolve(event) {
          return event.source.pluginId === "core" && event.source.triggerType === "scheduled_workflow";
        },
        resolve(event) {
          return {
            intentId: `intent_${event.triggerEventId}`,
            kind: "scheduled_workflow" as const,
            workspaceId: "ws_e2e",
            projectId: null,
            actor: { kind: "scheduler" as const },
            payload: {
              taskId: (event.external as Record<string, unknown>).taskId,
              kind: (event.external as Record<string, unknown>).kind,
              prompt: "Daily metrics check"
            }
          };
        }
      });

      harness.workflowSelector.register({
        id: "scheduler-trace-rule",
        matches(intent) { return intent.kind === "scheduled_workflow"; },
        definitionId: "scheduler.trace.workflow"
      });

      const trigger = taskToTriggerEvent({
        triggerEventId: "trg_sched_trace",
        receivedAt: "2026-05-31T00:00:00.000Z",
        taskId: "task_trace",
        taskName: "Trace task",
        kind: "agent-prompt"
      });

      const { events, result } = await dispatchScenario(harness, trigger, {
        definitionId: "scheduler.trace.workflow",
        steps: [
          {
            stepId: "run_agent",
            async run(ctx) {
              await ctx.executeEffect({
                pluginId: "core",
                effectType: "agent.prompt",
                input: { prompt: (ctx.input as Record<string, unknown>).prompt }
              });
              return {
                kind: "continue" as const,
                output: { done: true }
              };
            }
          }
        ]
      });

      expect(result.status).toBe("succeeded");
      assertSuccessPath(events);
    } finally {
      await harness.close();
    }
  });
});
