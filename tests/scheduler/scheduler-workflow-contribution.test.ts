import { describe, expect, it } from "vitest";
import { schedulerWorkflowContribution } from "@features/scheduler/scheduler-workflow-contribution.js";
import { RuntimeContributionContext } from "@core/runtime/runtime-contribution-context.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";

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

  it("registers stock monitor workflow and effect handler", async () => {
    const workflows = new WorkflowRegistry();
    const effectHandlers = new EffectHandlerRegistry();
    const ctx = new RuntimeContributionContext({
      workflows,
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers,
    });

    await schedulerWorkflowContribution().register(ctx);

    const def = workflows.require("scheduler.stock_monitor.workflow");
    expect(def.definitionId).toBe("scheduler.stock_monitor.workflow");
    expect(def.steps).toHaveLength(1);
    expect(def.steps[0].stepId).toBe("monitor");

    expect(effectHandlers.has("core", "stock_monitor")).toBe(true);
    const execResult = await effectHandlers.execute({
      effectId: "eff_stock",
      pluginId: "core",
      effectType: "stock_monitor",
      input: { stocks: ["000001"], tolerancePrice: 0.02 }
    });
    expect(execResult).toEqual({ monitored: true, stocks: ["000001"] });
  });

  it("registers stock portfolio snapshot workflow and effect handler", async () => {
    const workflows = new WorkflowRegistry();
    const effectHandlers = new EffectHandlerRegistry();
    const ctx = new RuntimeContributionContext({
      workflows,
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers,
    });

    await schedulerWorkflowContribution().register(ctx);

    const def = workflows.require("scheduler.stock_portfolio_snapshot.workflow");
    expect(def.definitionId).toBe("scheduler.stock_portfolio_snapshot.workflow");
    expect(def.steps).toHaveLength(1);
    expect(def.steps[0].stepId).toBe("snapshot");

    expect(effectHandlers.has("core", "stock_portfolio_snapshot")).toBe(true);
  });

  it("registers stock advisor workflow and effect handler", async () => {
    const workflows = new WorkflowRegistry();
    const effectHandlers = new EffectHandlerRegistry();
    const ctx = new RuntimeContributionContext({
      workflows,
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers,
    });

    await schedulerWorkflowContribution().register(ctx);

    const def = workflows.require("scheduler.stock_advisor.workflow");
    expect(def.definitionId).toBe("scheduler.stock_advisor.workflow");
    expect(def.steps).toHaveLength(1);
    expect(def.steps[0].stepId).toBe("advise");

    expect(effectHandlers.has("core", "stock_advisor")).toBe(true);
  });

  it("registers gitlab follow workflow and effect handler", async () => {
    const workflows = new WorkflowRegistry();
    const effectHandlers = new EffectHandlerRegistry();
    const ctx = new RuntimeContributionContext({
      workflows,
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers,
    });

    await schedulerWorkflowContribution().register(ctx);

    const def = workflows.require("scheduler.gitlab_follow.workflow");
    expect(def.definitionId).toBe("scheduler.gitlab_follow.workflow");
    expect(def.steps).toHaveLength(1);
    expect(def.steps[0].stepId).toBe("follow");

    expect(effectHandlers.has("core", "gitlab_follow")).toBe(true);
  });
});
