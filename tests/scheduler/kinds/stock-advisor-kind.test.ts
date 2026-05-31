import { describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../../src/agent/agent-provider-registry.js";
import { StockAdvisorKind } from "@features/scheduler/kinds/stock-advisor-kind.js";
import { createTaskContext, makeAgent, makeTask, quote } from "./kind-test-helpers.js";

describe("StockAdvisorKind", () => {
  it("builds portfolio context, runs an agent, and sends advice", async () => {
    const texts: string[] = [];
    const agents = new AgentProviderRegistry().register({
      kind: "codex",
      displayName: "Codex",
      buildAgent: () => makeAgent("持有")
    });
    const kind = new StockAdvisorKind({
      stockStore: {
        listPortfolio: () => [{ stockCode: "sh600519", shares: 100, costPrice: 1600, stopLoss: 1500, updatedAt: "now" }]
      },
      quote: { query: async () => [quote({ current: 1700 })] },
      agents
    });

    await expect(
      kind.run(
        createTaskContext({
          task: makeTask({ kind: "stock-advisor", target: { platform: "feishu", chatId: "oc_1" } }),
          notify: { sendText: async (_target, text) => { texts.push(text); }, sendCard: async () => {} }
        }),
        kind.parseParams({ provider: "codex", occasion: "open" })
      )
    ).resolves.toEqual({ outcome: "sent" });

    expect(texts).toEqual(["持有"]);
  });

  it("noops when there is no portfolio to advise on", async () => {
    const agents = new AgentProviderRegistry();
    const kind = new StockAdvisorKind({
      stockStore: { listPortfolio: () => [] },
      quote: { query: async () => [] },
      agents
    });

    await expect(kind.run(createTaskContext({ task: makeTask({ kind: "stock-advisor" }) }), kind.parseParams({}))).resolves.toEqual({
      outcome: "noop",
      note: "no portfolio"
    });
  });
});
