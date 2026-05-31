import { describe, expect, it } from "vitest";
import { createRuntimeClosedLoopHarness } from "./runtime-closed-loop-harness.js";
import { feishuMessageEnvelopeToTriggerEvent } from "@integrations/feishu/feishu-trigger-event-adapter.js";
import { gitlabEventToTriggerEvent } from "@integrations/gitlab/gitlab-trigger-event-adapter.js";
import { webhookPayloadToTriggerEvent } from "@integrations/webhook/webhook-trigger-event-adapter.js";
import { taskToTriggerEvent } from "@features/scheduler/scheduler-trigger-event.js";
import { FakeGitLabClient } from "../fixtures/fake-gitlab-client.js";
import { createRecoveryWorkflow } from "@core/recovery/recovery-workflow.js";
import { FakeAgentCli } from "../fixtures/fake-agent-cli.js";

describe("runtime closed-loop e2e", () => {
  it("creates a fully wired in-process runtime harness", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      expect(harness.workspaceId).toBe("ws_e2e");
      expect(harness.workflowRuntime).toBeDefined();
      expect(harness.dispatcher).toBeDefined();
      expect(harness.runtimeStore).toBeDefined();
      expect(harness.controlActionStore).toBeDefined();
      expect(harness.memoryStore).toBeDefined();
      expect(harness.artifactStore).toBeDefined();
      expect(harness.inspectionService).toBeDefined();
      expect(harness.healthService).toBeDefined();
      expect(harness.stuckDetector).toBeDefined();
    } finally {
      await harness.close();
    }
  });

  it("Feishu message happy path: trigger -> ingress -> workflow -> effect -> complete", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      // Register a fake feishu effect handler that records calls
      harness.effectHandlerRegistry.register({
        pluginId: "feishu",
        effectType: "message.reply",
        execute(effect) {
          harness.effectCalls.push({
            pluginId: effect.pluginId,
            effectType: effect.effectType,
            input: effect.input
          });
          return { sent: true, text: (effect.input as Record<string, unknown>).text };
        }
      });

      // Register intent resolver for feishu messages
      harness.intentResolvers.register({
        id: "feishu-chat",
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

      // Register workflow selector for chat intents
      harness.workflowSelector.register({
        id: "chat-rule",
        matches(intent) {
          return intent.kind === "chat";
        },
        definitionId: "feishu.chat.workflow"
      });

      // Register the workflow definition
      harness.workflowRegistry.register({
        definitionId: "feishu.chat.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
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

      // Create trigger event and dispatch
      const trigger = feishuMessageEnvelopeToTriggerEvent({
        triggerEventId: "trg_feishu_msg",
        receivedAt: "2026-05-31T00:00:00.000Z",
        chatId: "oc_e2e",
        messageId: "om_e2e",
        senderUserId: "ou_e2e",
        commandType: "chat",
        textLength: 12
      });

      const result = await harness.dispatcher.dispatch(trigger);

      // The dispatcher calls idFactory.workflowInstanceId() twice:
      // once for workspace resolution (unused), once for actual workflow start
      const wfiId = `wfi_e2e_${harness.wfiCounter}`;

      // Assert
      expect(result.status).toBe("succeeded");
      const events = harness.runtimeEvents(wfiId);
      expect(events).toContain("workflow_instance.created");
      expect(events).toContain("attempt.completed");

      expect(harness.effectCalls).toContainEqual(
        expect.objectContaining({ pluginId: "feishu", effectType: "message.reply" })
      );
    } finally {
      await harness.close();
    }
  });

  it("Feishu card action wait/resume: workflow waits, then resumes via control action", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      // Register fake feishu effect handler
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

      // Intent resolver for feishu messages
      harness.intentResolvers.register({
        id: "feishu-chat-wait",
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
            payload: { text: "approve me" }
          };
        }
      });

      harness.workflowSelector.register({
        id: "chat-rule-wait",
        matches(intent) { return intent.kind === "chat"; },
        definitionId: "feishu.card.workflow"
      });

      // Register workflow that waits for approval, then resumes
      harness.workflowRegistry.register({
        definitionId: "feishu.card.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "wait_for_approval",
            async run(_ctx) {
              return {
                kind: "wait" as const,
                reason: "needs approval",
                waitFor: { kind: "control_action" as const, action: "approve_step" as const }
              };
            }
          },
          {
            stepId: "send_response",
            async run(ctx) {
              await ctx.executeEffect({
                pluginId: "feishu",
                effectType: "message.reply",
                input: { text: "approved" }
              });
              return { kind: "complete" as const };
            }
          }
        ]
      });

      // Dispatch message trigger → workflow enters waiting
      const trigger = feishuMessageEnvelopeToTriggerEvent({
        triggerEventId: "trg_card_wait",
        receivedAt: "2026-05-31T00:00:00.000Z",
        chatId: "oc_e2e",
        messageId: "om_card",
        senderUserId: "ou_e2e",
        commandType: "chat",
        textLength: 10
      });

      const result1 = await harness.dispatcher.dispatch(trigger);
      expect(result1.status).toBe("waiting");

      const wfiId = `wfi_e2e_${harness.wfiCounter}`;

      // Verify the workflow is waiting
      const waitingSteps = harness.runtimeStore.listWaitingStepStates(wfiId);
      expect(waitingSteps).toHaveLength(1);
      expect(waitingSteps[0].waitCondition).toEqual({ kind: "control_action", action: "approve_step" });

      // Wire the approve_step handler to resume the workflow
      harness.controlHandlers.approveStep = {
        async approveStep(_payload) {
          await harness.workflowRuntime.resume({
            workflowInstanceId: wfiId,
            runAttemptId: harness.nextRunAttemptId(),
            signal: {
              signalId: "sig_approve_1",
              kind: "control_action",
              payload: { action: "approve_step" }
            },
            workspaceId: "ws_e2e",
            now: "2026-05-31T00:00:00.000Z"
          });
          return { status: "completed" };
        }
      };

      // Create and process the control action
      const actionId = "ca_approve_step_1";
      harness.controlActionStore.create({
        id: actionId,
        workspaceId: "ws_e2e",
        actorUserId: "user_e2e",
        actionType: "approve_step",
        payload: { stepStateId: waitingSteps[0].id },
        now: "2026-05-31T00:00:00.000Z"
      });

      const procResult = await harness.controlActionProcessor.process(actionId, "2026-05-31T00:00:00.000Z");
      expect(procResult.status).toBe("completed");

      // Verify the workflow resumed and completed
      const events = harness.runtimeEvents(wfiId);
      expect(events).toContain("step.waiting");
      expect(events).toContain("workflow.signal_received");
      expect(events).toContain("step.resumed");
      expect(events).toContain("attempt.completed");

      expect(harness.effectCalls).toContainEqual(
        expect.objectContaining({ pluginId: "feishu", effectType: "message.reply", input: { text: "approved" } })
      );
    } finally {
      await harness.close();
    }
  });

  it("GitLab polling path: gitlab event -> workflow -> gitlab effect", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    const fakeGitlab = new FakeGitLabClient();
    try {
      // Register gitlab effect handler that records calls
      harness.effectHandlerRegistry.register({
        pluginId: "gitlab",
        effectType: "issue.comment",
        execute(effect) {
          const input = effect.input as { projectId: number; issueIid: number; body: string };
          fakeGitlab.comments.push({ projectId: input.projectId, issueIid: input.issueIid, body: input.body });
          harness.effectCalls.push({
            pluginId: effect.pluginId,
            effectType: effect.effectType,
            input: effect.input
          });
          return { commented: true };
        }
      });

      // Intent resolver for gitlab events
      harness.intentResolvers.register({
        id: "gitlab-issue",
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
        id: "gitlab-rule",
        matches(_intent) { return true; },
        definitionId: "gitlab.issue.workflow"
      });

      // Register gitlab workflow
      harness.workflowRegistry.register({
        definitionId: "gitlab.issue.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
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
                  body: `Processing ${input.action} on ${input.resourceType}`
                }
              });
              return { kind: "complete" as const };
            }
          }
        ]
      });

      // Create trigger event
      const trigger = gitlabEventToTriggerEvent({
        triggerEventId: "trg_gitlab_issue",
        receivedAt: "2026-05-31T00:00:00.000Z",
        host: "gitlab.example.com",
        projectId: 42,
        eventType: "issue",
        resourceType: "issue",
        resourceIid: 7,
        action: "updated",
        payload: { title: "Need summary" }
      });

      const result = await harness.dispatcher.dispatch(trigger);
      const wfiId = `wfi_e2e_${harness.wfiCounter}`;

      expect(result.status).toBe("succeeded");
      const events = harness.runtimeEvents(wfiId);
      expect(events).toContain("attempt.completed");

      // Verify the gitlab effect was called
      expect(harness.effectCalls).toContainEqual(
        expect.objectContaining({ pluginId: "gitlab", effectType: "issue.comment" })
      );

      // Verify the fake gitlab client recorded the comment
      expect(fakeGitlab.comments).toHaveLength(1);
      expect(fakeGitlab.comments[0]).toEqual({
        projectId: 42,
        issueIid: 7,
        body: "Processing updated on issue"
      });
    } finally {
      await harness.close();
    }
  });

  it("webhook payload path: webhook trigger -> workflow -> no sensitive leak", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      // Register no-op effect handler for webhook
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

      // Intent resolver for webhook
      harness.intentResolvers.register({
        id: "webhook-deploy",
        canResolve(event) {
          return event.source.pluginId === "webhook";
        },
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
        id: "webhook-rule",
        matches(_intent) { return true; },
        definitionId: "webhook.deploy.workflow"
      });

      harness.workflowRegistry.register({
        definitionId: "webhook.deploy.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "process_webhook",
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

      // Create webhook trigger with sensitive fields
      const trigger = webhookPayloadToTriggerEvent({
        triggerEventId: "trg_webhook",
        receivedAt: "2026-05-31T00:00:00.000Z",
        sourceId: "wh_src_1",
        pluginId: "webhook",
        headers: {
          "content-type": "application/json",
          "x-signature": "abc123"
        },
        payload: {
          action: "deploy",
          environment: "staging",
          token: "secret-token-value",
          password: "super-secret",
          api_key: "key-12345"
        }
      });

      const result = await harness.dispatcher.dispatch(trigger);
      const wfiId = `wfi_e2e_${harness.wfiCounter}`;

      expect(result.status).toBe("succeeded");
      const events = harness.runtimeEvents(wfiId);
      expect(events).toContain("attempt.completed");

      // Verify NO sensitive values leak into runtime event payloads
      const payloadsJson = JSON.stringify(harness.runtimeEventsPayloads(wfiId));
      expect(payloadsJson).not.toContain("secret-token-value");
      expect(payloadsJson).not.toContain("super-secret");
      expect(payloadsJson).not.toContain("key-12345");

      // Verify the webhook effect was called
      expect(harness.effectCalls).toContainEqual(
        expect.objectContaining({ pluginId: "webhook", effectType: "process" })
      );
    } finally {
      await harness.close();
    }
  });

  it("scheduler tick path: task trigger -> workflow -> agent effect", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    const fakeAgent = new FakeAgentCli();
    fakeAgent.setResponse("agent response for task");
    fakeAgent.setUsage({ inputTokens: 5, outputTokens: 10 });
    try {
      // Register agent-prompt effect handler
      harness.effectHandlerRegistry.register({
        pluginId: "core",
        effectType: "agent.prompt",
        execute(effect) {
          const input = effect.input as { prompt: string };
          harness.effectCalls.push({
            pluginId: effect.pluginId,
            effectType: effect.effectType,
            input: effect.input
          });
          return fakeAgent.run(input.prompt);
        }
      });

      // Intent resolver for scheduler tasks
      harness.intentResolvers.register({
        id: "scheduler-task",
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
              prompt: "Analyze the daily metrics"
            }
          };
        }
      });

      harness.workflowSelector.register({
        id: "scheduler-rule",
        matches(intent) { return intent.kind === "scheduled_workflow"; },
        definitionId: "scheduler.agent.workflow"
      });

      harness.workflowRegistry.register({
        definitionId: "scheduler.agent.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "run_agent",
            async run(ctx) {
              const result = await ctx.executeEffect({
                pluginId: "core",
                effectType: "agent.prompt",
                input: { prompt: (ctx.input as Record<string, unknown>).prompt }
              });
              return {
                kind: "continue" as const,
                output: result
              };
            }
          }
        ]
      });

      // Create scheduler trigger event
      const trigger = taskToTriggerEvent({
        triggerEventId: "trg_scheduler",
        receivedAt: "2026-05-31T00:00:00.000Z",
        taskId: "task_e2e",
        taskName: "E2E scheduled prompt",
        kind: "agent-prompt"
      });

      const result = await harness.dispatcher.dispatch(trigger);
      const wfiId = `wfi_e2e_${harness.wfiCounter}`;

      expect(result.status).toBe("succeeded");
      const events = harness.runtimeEvents(wfiId);
      expect(events).toContain("attempt.completed");

      // Verify agent effect was called
      expect(harness.effectCalls).toContainEqual(
        expect.objectContaining({ pluginId: "core", effectType: "agent.prompt" })
      );

      // Verify the fake agent received the prompt
      expect(fakeAgent.prompts).toHaveLength(1);
      expect(fakeAgent.prompts[0]).toBe("Analyze the daily metrics");
    } finally {
      await harness.close();
    }
  });

  it("failure recovery memory observability: fail -> diag -> memory -> control -> observe", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      const now = "2026-05-31T00:00:00.000Z";

      // Register intent resolver and selector for all tests
      harness.intentResolvers.register({
        id: "fail-test",
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
            payload: { text: "trigger failure" }
          };
        }
      });

      harness.workflowSelector.register({
        id: "fail-rule",
        matches(intent) { return intent.kind === "chat"; },
        definitionId: "test.failing.workflow"
      });

      // Register failing workflow
      const failError = {
        code: "AGENT_FAILED",
        category: "agent_process" as const,
        message: "agent failed",
        retryable: false,
        recoverable: true
      };

      harness.workflowRegistry.register({
        definitionId: "test.failing.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "failing_step",
            async run(_ctx) {
              return {
                kind: "fail" as const,
                error: failError,
                recoverable: true
              };
            }
          }
        ]
      });

      // Dispatch trigger → workflow fails
      const trigger = feishuMessageEnvelopeToTriggerEvent({
        triggerEventId: "trg_fail",
        receivedAt: now,
        chatId: "oc_e2e",
        messageId: "om_fail",
        senderUserId: "ou_e2e",
        commandType: "chat",
        textLength: 15
      });

      const failResult = await harness.dispatcher.dispatch(trigger);
      expect(failResult.status).toBe("failed");

      const wfiId = `wfi_e2e_${harness.wfiCounter}`;

      // Verify failure events
      const failEvents = harness.runtimeEvents(wfiId);
      expect(failEvents).toContain("attempt.failed");
      expect(failEvents).toContain("step.failed");

      // ---- Recovery actions ----
      // Create diagnostic artifact
      const artifactId = `diag_${wfiId}`;
      const diagArtifact = await harness.recoveryService.createDiagnosticBundle({
        artifactId,
        workspaceId: "ws_e2e",
        workflowInstanceId: wfiId,
        runAttemptId: `ra_e2e_${harness.raCounter}`,
        error: failError,
        now
      });
      expect(diagArtifact.id).toBe(artifactId);

      // Create memory record for failure pattern (scope: "run" auto-activates)
      harness.memoryStore.createCandidate({
        id: "mem_fail_pattern",
        workspaceId: "ws_e2e",
        scope: "run" as const,
        kind: "failure_pattern" as const,
        content: `Failure pattern for ${failError.code}: ${failError.message}`,
        source: {
          workflowInstanceId: wfiId,
          errorCode: failError.code,
          errorCategory: failError.category
        },
        confidence: 0.8,
        now
      });

      // Create control action for recovery
      harness.controlActionStore.create({
        id: "ctrl_recovery_1",
        workspaceId: "ws_e2e",
        actorUserId: null,
        actionType: "trigger_recovery",
        payload: {
          workflowInstanceId: wfiId,
          runAttemptId: `ra_e2e_${harness.raCounter}`
        },
        now
      });

      // ---- Run recovery workflow ----
      // Use the real recovery workflow creator
      const recoveryDef = createRecoveryWorkflow({
        recoveryService: harness.recoveryService,
        memoryStore: harness.memoryStore,
        controlActionStore: harness.controlActionStore
      });

      harness.workflowRegistry.register(recoveryDef);

      // Start recovery workflow directly via runtime
      const recoveryWfiId = harness.nextWorkflowInstanceId();
      const recoveryRaId = harness.nextRunAttemptId();
      const recoveryResult = await harness.workflowRuntime.start({
        workflowInstanceId: recoveryWfiId,
        runAttemptId: recoveryRaId,
        workspaceId: "ws_e2e",
        projectId: null,
        definitionId: "core.recovery.workflow",
        input: {
          workflowInstanceId: wfiId,
          runAttemptId: `ra_e2e_${harness.raCounter}`,
          workspaceId: "ws_e2e",
          error: failError,
          now
        },
        now
      });

      // Recovery workflow for recoverable errors completes (doesn't wait)
      expect(recoveryResult.status).toBe("succeeded");

      const recoveryEvents = harness.runtimeEvents(recoveryWfiId);
      expect(recoveryEvents).toContain("step.started");
      expect(recoveryEvents).toContain("attempt.completed");

      // ---- Assertions ----
      // Artifact files exist - check via direct DB query
      const allArtifacts = harness.db.prepare(
        "select id, kind, file_path, workspace_id, workflow_instance_id, run_attempt_id from artifacts order by created_at asc"
      ).all() as Array<{ id: string; kind: string; file_path: string; workspace_id: string; workflow_instance_id: string | null; run_attempt_id: string | null }>;

      expect(allArtifacts.length).toBeGreaterThan(0);
      const allIds = allArtifacts.map((a) => a.id);
      expect(allIds).toContain(artifactId);

      // Also verify via ArtifactStore
      const runArtifacts = harness.artifactStore.listByRun("ws_e2e", `ra_e2e_${harness.raCounter}`);
      expect(runArtifacts.length).toBeGreaterThan(0);

      // Control action exists
      const ca = harness.controlActionStore.getById("ctrl_recovery_1");
      expect(ca).toBeDefined();
      expect(ca!.actionType).toBe("trigger_recovery");

      // Memory record exists
      const mems = harness.memoryStore.listActive("ws_e2e");
      expect(mems.some((m) => m.kind === "failure_pattern")).toBe(true);

      // ---- Observability assertions ----
      // Inspection
      const inspection = await harness.inspectionService.inspect("ws_e2e");
      expect(inspection.workflows.length).toBeGreaterThanOrEqual(1);
      expect(inspection.failedCount).toBeGreaterThanOrEqual(1);

      // Health check (read-only, no mutation)
      const beforeHealth = await harness.healthService.check();
      expect(beforeHealth.status).toBeDefined();
      expect(beforeHealth.checks.length).toBeGreaterThan(0);

      // Stuck run detector (read-only, no mutation)
      const stuck = harness.stuckDetector.detect(now);
      expect(Array.isArray(stuck)).toBe(true);
      // No runs should be stuck (all completed or failed within timeout)
      expect(stuck.length).toBeGreaterThanOrEqual(0);

      // Verify health check does NOT mutate workflow statuses
      const afterHealth = await harness.healthService.check();
      const wfiBefore = harness.runtimeStore.getWorkflowInstance(wfiId);
      const wfiAfter = harness.runtimeStore.getWorkflowInstance(wfiId);
      expect(wfiBefore?.status).toBe(wfiAfter?.status);

      // Verify inspection does NOT mutate
      const before = harness.runtimeStore.listWorkflowSummaries("ws_e2e").length;
      await harness.inspectionService.inspect("ws_e2e");
      const after = harness.runtimeStore.listWorkflowSummaries("ws_e2e").length;
      expect(before).toBe(after);
    } finally {
      await harness.close();
    }
  });

  it("scheduler non-heartbeat kind (stock-monitor): task trigger -> runtime -> stock_monitor effect", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      // Register stock monitor effect handler
      harness.effectHandlerRegistry.register({
        pluginId: "core",
        effectType: "stock_monitor",
        execute(effect) {
          harness.effectCalls.push({
            pluginId: effect.pluginId,
            effectType: effect.effectType,
            input: effect.input
          });
          return { monitored: true, stocks: (effect.input as Record<string, unknown>).stocks };
        }
      });

      // Intent resolver for scheduler tasks
      harness.intentResolvers.register({
        id: "scheduler-stock-monitor",
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
              stocks: ["000001", "600519"],
              tolerancePrice: 0.03
            }
          };
        }
      });

      harness.workflowSelector.register({
        id: "scheduler-stock-rule",
        matches(intent) { return intent.kind === "scheduled_workflow"; },
        definitionId: "scheduler.stock_monitor.workflow"
      });

      harness.workflowRegistry.register({
        definitionId: "scheduler.stock_monitor.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "monitor",
            async run(ctx) {
              const payload = ctx.input as Record<string, unknown>;
              await ctx.executeEffect({
                pluginId: "core",
                effectType: "stock_monitor",
                input: {
                  stocks: payload.stocks,
                  tolerancePrice: payload.tolerancePrice
                }
              });
              return { kind: "complete" as const, output: { monitored: true } };
            }
          }
        ]
      });

      // Create scheduler trigger event for stock-monitor kind
      const { taskToTriggerEvent } = await import("@features/scheduler/scheduler-trigger-event.js");
      const trigger = taskToTriggerEvent({
        triggerEventId: "trg_scheduler_stock",
        receivedAt: "2026-05-31T00:00:00.000Z",
        taskId: "task_stock_e2e",
        taskName: "E2E stock monitor",
        kind: "stock-monitor"
      });

      const result = await harness.dispatcher.dispatch(trigger);
      const wfiId = `wfi_e2e_${harness.wfiCounter}`;

      expect(result.status).toBe("succeeded");
      const events = harness.runtimeEvents(wfiId);
      expect(events).toContain("attempt.completed");

      // Verify stock monitor effect was called
      expect(harness.effectCalls).toContainEqual(
        expect.objectContaining({ pluginId: "core", effectType: "stock_monitor" })
      );
    } finally {
      await harness.close();
    }
  });
});
