import type { HandlerKindModule } from "./handler-kind-module.js";
import { AgentPromptKind } from "./kinds/agent-prompt-kind.js";
import { GitLabFollowKind } from "./kinds/gitlab-follow-kind.js";
import { HeartbeatKind } from "./kinds/heartbeat-kind.js";
import { StockAdvisorKind } from "./kinds/stock-advisor-kind.js";
import { StockMonitorKind } from "./kinds/stock-monitor-kind.js";
import { StockPortfolioSnapshotKind } from "./kinds/stock-portfolio-snapshot-kind.js";

const defaultModuleFactories = [
  heartbeatKindModule,
  stockMonitorKindModule,
  stockPortfolioSnapshotKindModule,
  stockAdvisorKindModule,
  agentPromptKindModule,
  gitlabFollowKindModule
];

export function defaultHandlerKindModules(): HandlerKindModule[] {
  return defaultModuleFactories.map((createModule) => createModule());
}

export function heartbeatKindModule(): HandlerKindModule {
  return {
    id: "heartbeat",
    register: (registry, ctx) => {
      const { taskRegistry } = ctx.pick("taskRegistry");
      registry.register(new HeartbeatKind({ taskRegistry }));
    }
  };
}

export function stockMonitorKindModule(): HandlerKindModule {
  return {
    id: "stock-monitor",
    register: (registry, ctx) => {
      const { stockStore, quote } = ctx.pick("stockStore", "quote");
      registry.register(new StockMonitorKind({ stockStore, quote }));
    }
  };
}

export function stockPortfolioSnapshotKindModule(): HandlerKindModule {
  return {
    id: "stock-portfolio-snapshot",
    register: (registry, ctx) => {
      const { stockStore, quote } = ctx.pick("stockStore", "quote");
      registry.register(new StockPortfolioSnapshotKind({ stockStore, quote }));
    }
  };
}

export function stockAdvisorKindModule(): HandlerKindModule {
  return {
    id: "stock-advisor",
    register: (registry, ctx) => {
      const { stockStore, quote, agents } = ctx.pick("stockStore", "quote", "agents");
      registry.register(new StockAdvisorKind({ stockStore, quote, agents }));
    }
  };
}

export function agentPromptKindModule(): HandlerKindModule {
  return {
    id: "agent-prompt",
    register: (registry, ctx) => {
      const { agents } = ctx.pick("agents");
      registry.register(new AgentPromptKind({ agents }));
    }
  };
}

export function gitlabFollowKindModule(): HandlerKindModule {
  return {
    id: "gitlab-follow",
    register: (registry, ctx) => {
      const { gitlab, gitlabFollowStore, gitService, agents, configStore } = ctx.pick(
        "gitlab",
        "gitlabFollowStore",
        "gitService",
        "agents",
        "configStore"
      );
      const gl = configStore.get().gitlab;
      registry.register(
        new GitLabFollowKind({
          gitlab,
          store: gitlabFollowStore,
          agents,
          git: gitService,
          config: gl ? { token: gl.token, host: gl.host, workspaceRoot: gl.workspace } : null
        })
      );
    }
  };
}
