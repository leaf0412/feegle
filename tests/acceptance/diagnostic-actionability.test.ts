import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createRuntimeClosedLoopHarness } from "@tests/e2e/runtime-closed-loop-harness.js";
import { feishuMessageEnvelopeToTriggerEvent } from "@integrations/feishu/feishu-trigger-event-adapter.js";

describe("diagnostic actionability", () => {
  it("diagnostic artifact contains actionable evidence and no secrets", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      const now = "2026-05-31T00:00:00.000Z";

      // Register intent resolver and selector
      harness.intentResolvers.register({
        id: "diag-intent",
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
            payload: { text: "trigger diagnostic test" }
          };
        }
      });

      harness.workflowSelector.register({
        id: "diag-rule",
        matches(intent) { return intent.kind === "chat"; },
        definitionId: "test.diag.workflow"
      });

      // Register a failing workflow with detailed error
      const diagError = {
        code: "AGENT_TIMEOUT",
        category: "agent_process" as const,
        message: "agent timed out after 30s",
        retryable: true,
        recoverable: true
      };

      harness.workflowRegistry.register({
        definitionId: "test.diag.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "timeout_step",
            async run(_ctx) {
              return {
                kind: "fail" as const,
                error: diagError,
                recoverable: true
              };
            }
          }
        ]
      });

      // Dispatch trigger
      const trigger = feishuMessageEnvelopeToTriggerEvent({
        triggerEventId: "trg_diag",
        receivedAt: now,
        chatId: "oc_e2e",
        messageId: "om_diag",
        senderUserId: "ou_e2e",
        commandType: "chat",
        textLength: 8
      });

      const failResult = await harness.dispatcher.dispatch(trigger);
      expect(failResult.status).toBe("failed");

      const wfiId = `wfi_e2e_${harness.wfiCounter}`;
      const raId = `ra_e2e_${harness.raCounter}`;

      // Create diagnostic bundle
      const artifactId = `diag_${wfiId}`;
      const diagRecord = await harness.recoveryService.createDiagnosticBundle({
        artifactId,
        workspaceId: "ws_e2e",
        workflowInstanceId: wfiId,
        runAttemptId: raId,
        error: diagError,
        now
      });

      expect(diagRecord.id).toBe(artifactId);
      expect(diagRecord.kind).toBe("diagnostic_bundle");

      // Read the written artifact JSON from disk
      const bundleJson = await readFile(diagRecord.filePath, "utf8");
      const bundle = JSON.parse(bundleJson) as Record<string, unknown>;

      // Assert required fields are present
      expect(bundle.target).toBeDefined();
      const target = bundle.target as Record<string, unknown>;
      expect(target.workflowInstanceId).toBe(wfiId);
      expect(target.runAttemptId).toBe(raId);

      expect(bundle.error).toBeDefined();
      const error = bundle.error as Record<string, unknown>;
      expect(error.code).toBe("AGENT_TIMEOUT");
      expect(error.message).toBe("agent timed out after 30s");

      expect(bundle.timeline).toBeDefined();
      expect(Array.isArray(bundle.timeline)).toBe(true);

      expect(bundle.environmentSummary).toBeDefined();
      const env = bundle.environmentSummary as Record<string, unknown>;
      expect(env.nodeVersion).toBeDefined();
      expect(typeof env.nodeVersion).toBe("string");

      expect(bundle.statusSnapshot).toBeDefined();

      // Assert related fields exist
      expect(bundle.relatedArtifacts).toBeDefined();
      expect(Array.isArray(bundle.relatedArtifacts)).toBe(true);
      expect(bundle.relatedMemory).toBeDefined();
      expect(Array.isArray(bundle.relatedMemory)).toBe(true);
      expect(bundle.failedEffects).toBeDefined();
      expect(Array.isArray(bundle.failedEffects)).toBe(true);

      // Assert no secret patterns leak
      const bundleStr = JSON.stringify(bundle);
      expect(bundleStr).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
      expect(bundleStr).not.toContain("secret-token");
      expect(bundleStr).not.toMatch(/api[_-]?key[=:]\s*\S{8,}/i);
      expect(bundleStr).not.toMatch(/password[=:]\s*\S{1,}/i);
    } finally {
      await harness.close();
    }
  });
});
