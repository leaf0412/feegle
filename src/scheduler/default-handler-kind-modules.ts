import type { HandlerKindModule } from "./handler-kind-module.js";
import { AgentPromptKind } from "./kinds/agent-prompt-kind.js";
import { HeartbeatKind } from "./kinds/heartbeat-kind.js";
import { StockAdvisorKind } from "./kinds/stock-advisor-kind.js";
import { StockMonitorKind } from "./kinds/stock-monitor-kind.js";
import { StockPortfolioSnapshotKind } from "./kinds/stock-portfolio-snapshot-kind.js";

const defaultModuleFactories = [
  heartbeatKindModule,
  stockMonitorKindModule,
  stockPortfolioSnapshotKindModule,
  stockAdvisorKindModule,
  agentPromptKindModule
];

export function defaultHandlerKindModules(): HandlerKindModule[] {
  return defaultModuleFactories.map((createModule) => createModule());
}

function heartbeatKindModule(): HandlerKindModule {
  return {
    id: "heartbeat",
    register: (registry, deps) => {
      registry.register(new HeartbeatKind({ taskRegistry: deps.taskRegistry }));
    }
  };
}

function stockMonitorKindModule(): HandlerKindModule {
  return {
    id: "stock-monitor",
    register: (registry, deps) => {
      registry.register(new StockMonitorKind({ stockStore: deps.stockStore, quote: deps.quote }));
    }
  };
}

function stockPortfolioSnapshotKindModule(): HandlerKindModule {
  return {
    id: "stock-portfolio-snapshot",
    register: (registry, deps) => {
      registry.register(new StockPortfolioSnapshotKind({ stockStore: deps.stockStore, quote: deps.quote }));
    }
  };
}

function stockAdvisorKindModule(): HandlerKindModule {
  return {
    id: "stock-advisor",
    register: (registry, deps) => {
      registry.register(new StockAdvisorKind({ stockStore: deps.stockStore, quote: deps.quote, agents: deps.agents }));
    }
  };
}

function agentPromptKindModule(): HandlerKindModule {
  return {
    id: "agent-prompt",
    register: (registry, deps) => {
      registry.register(new AgentPromptKind({ agents: deps.agents }));
    }
  };
}
