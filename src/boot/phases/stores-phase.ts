import { existsSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import { ChatHistoryStore } from "../../agent/chat-history-store.js";
import { ProviderStore } from "../../agent/provider-store.js";
import { SessionStore } from "../../agent/session-store.js";
import type { ConfigStoreProviderWriter } from "../../app/config-store.js";
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

      // Provider config has a single source of truth: config.jsonc agent.providers.
      // Old installs may still have ~/.feegle/providers.json — migrate it then delete.
      const configStore = ctx.require("configStore");
      await migrateLegacyProvidersJson(deps.feegleHome, configStore);
      ctx.provide("providerStore", ProviderStore.fromConfig(configStore));
    }
  };
}

/**
 * One-shot migration. If `~/.feegle/providers.json` exists:
 *  - if config.jsonc already has agent.providers entries, the legacy file is moved aside (.bak)
 *    rather than discarded — operator may want to inspect it.
 *  - otherwise its records are written into config.jsonc via ConfigStore.setAgent* (surgical
 *    JSONC edits, comments preserved) and the legacy file is unlinked.
 */
export async function migrateLegacyProvidersJson(home: string, configStore: ConfigStoreProviderWriter): Promise<void> {
  const providersJsonPath = join(home, "providers.json");
  if (!existsSync(providersJsonPath)) {
    return;
  }
  const currentAgent = configStore.get().agent;
  const hasExistingProviders = currentAgent && Object.keys(currentAgent.providers ?? {}).length > 0;
  if (hasExistingProviders) {
    const bak = `${providersJsonPath}.bak.${Date.now()}`;
    renameSync(providersJsonPath, bak);
    console.warn(`feegle: config.jsonc already has agent providers; moved providers.json → ${bak}`);
    return;
  }
  let parsed: { providers?: unknown[]; activeKind?: string | null };
  try {
    parsed = JSON.parse(readFileSync(providersJsonPath, "utf8")) as typeof parsed;
  } catch (error) {
    const bak = `${providersJsonPath}.bak.${Date.now()}`;
    renameSync(providersJsonPath, bak);
    console.warn(
      `feegle: providers.json could not be parsed (${errorMessage(error)}); moved to ${bak}`
    );
    return;
  }
  const records = (parsed.providers ?? []) as Array<{ kind: string } & Record<string, unknown>>;
  for (const record of records) {
    const { kind, ...rest } = record;
    if (!kind) continue;
    await configStore.setAgentProvider(kind, rest as never);
  }
  if (typeof parsed.activeKind === "string" && parsed.activeKind.length > 0) {
    await configStore.setAgentDefault(parsed.activeKind);
  }
  unlinkSync(providersJsonPath);
  console.info(`feegle: migrated providers.json into config.jsonc`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
