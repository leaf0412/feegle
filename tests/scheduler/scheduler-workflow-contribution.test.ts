import { describe, expect, it } from "vitest";
import { schedulerWorkflowContribution } from "../../src/features/scheduler/scheduler-workflow-contribution.js";
import { RuntimeContributionContext } from "../../src/core/runtime/runtime-contribution-context.js";
import { WorkflowRegistry } from "../../src/core/runtime/workflow-registry.js";
import { EffectHandlerRegistry } from "../../src/core/runtime/effect-handler-registry.js";
import { IntentResolverRegistry } from "../../src/ingress/intent-resolver-registry.js";
import { WorkflowSelector } from "../../src/ingress/workflow-selector.js";

describe("schedulerWorkflowContribution", () => {
  it("registers heartbeat and agent_prompt workflows with correct metadata, and an agent_prompt effect handler", async () => {
    const workflows = new WorkflowRegistry();
    const effectHandlers = new EffectHandlerRegistry();
    const intentResolvers = new IntentResolverRegistry();
    const workflowSelector = new WorkflowSelector();

    const ctx = new RuntimeContributionContext({
      workflows,
      intentResolvers,
      workflowSelector,
      effectHandlers,
    });

    await schedulerWorkflowContribution().register(ctx);

    // Heartbeat workflow
    const heartbeatDef = workflows.require("scheduler.heartbeat.workflow");
    expect(heartbeatDef).toBeDefined();
    expect(heartbeatDef.definitionId).toBe("scheduler.heartbeat.workflow");
    expect(heartbeatDef.version).toBe(1);
    expect(heartbeatDef.concurrencyPolicy).toBe("skip_if_running");
    expect(heartbeatDef.steps).toHaveLength(1);
    expect(heartbeatDef.steps[0].stepId).toBe("heartbeat");

    // Agent prompt workflow
    const agentPromptDef = workflows.require("scheduler.agent_prompt.workflow");
    expect(agentPromptDef).toBeDefined();
    expect(agentPromptDef.definitionId).toBe("scheduler.agent_prompt.workflow");
    expect(agentPromptDef.version).toBe(1);
    expect(agentPromptDef.concurrencyPolicy).toBe("skip_if_running");
    expect(agentPromptDef.steps).toHaveLength(1);
    expect(agentPromptDef.steps[0].stepId).toBe("run_prompt");

    // Effect handler
    expect(effectHandlers.has("core", "agent_prompt")).toBe(true);
    const result = await effectHandlers.execute({
      effectId: "eff_1",
      pluginId: "core",
      effectType: "agent_prompt",
      input: { prompt: "hello" },
    });
    expect(result).toEqual({ executed: true, prompt: "hello" });
  });
});
