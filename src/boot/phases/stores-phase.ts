import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import { ChatHistoryStore } from "../../agent/chat-history-store.js";
import { SessionStore } from "../../agent/session-store.js";
import { AliasStore } from "../../platform/commands/alias-store.js";
import { ChatBindingStore } from "../../repositories/chat-binding-store.js";
import { RepositoryStore } from "../../repositories/repository-store.js";
import { DedupStore } from "../../scheduler/dedup-store.js";
import { RunsLog } from "../../scheduler/runs-log.js";
import { TaskRegistry } from "../../scheduler/task-registry.js";
import { TaskStore } from "../../scheduler/task-store.js";
import type { Task } from "../../scheduler/task.js";
import { StockStore } from "../../stock/stock-store.js";

export interface StoresPhaseDeps {
  feegleHome: string;
  seedTasks: Task[];
}

export function storesPhase(deps: StoresPhaseDeps): BootPhase {
  return {
    name: "stores",
    run: async (ctx: BootContext) => {
      ctx.provide("sessionStore", await SessionStore.load(deps.feegleHome));
      ctx.provide("chatHistory", new ChatHistoryStore());
      ctx.provide("aliasStore", await AliasStore.load(deps.feegleHome));
      ctx.provide("repositoryStore", await RepositoryStore.load(deps.feegleHome));
      ctx.provide("chatBindingStore", await ChatBindingStore.load(deps.feegleHome));
      ctx.provide("stockStore", await StockStore.load(deps.feegleHome));
      ctx.provide("dedupStore", await DedupStore.load(deps.feegleHome));
      ctx.provide("runsLog", await RunsLog.open(deps.feegleHome));
      const taskStore = await TaskStore.load(deps.feegleHome);
      await taskStore.ensureSeed(deps.seedTasks);
      ctx.provide("taskStore", taskStore);
      ctx.provide("taskRegistry", new TaskRegistry(taskStore));
    }
  };
}
