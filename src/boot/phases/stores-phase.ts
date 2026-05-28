import { existsSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import { ChatHistoryStore } from "../../agent/chat-history-store.js";
import { ProviderStore } from "../../agent/provider-store.js";
import { SessionStore } from "../../agent/session-store.js";
import type { ConfigStoreProviderWriter } from "../../app/config-store.js";
import type { RuntimeDb } from "../../app/runtime-db.js";
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

      // Chat bindings live in SQLite (chat_bindings + chat_binding_repositories).
      // First boot after upgrade: import the legacy JSON then unlink it.
      const runtimeDb = ctx.require("runtimeDb");
      await migrateLegacyChatBindingsJson(deps.feegleHome, runtimeDb);
      ctx.provide("chatBindingStore", new ChatBindingStore(runtimeDb));

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
  } catch (parseError) {
    // No silent degradation: rename so data is preserved AND throw so the operator sees the
    // failure. On the next boot the file is gone, migration becomes a no-op, and they can restart
    // cleanly after fixing or restoring the underlying input.
    const bak = `${providersJsonPath}.bak.${Date.now()}`;
    renameSync(providersJsonPath, bak);
    const cause = parseError instanceof Error ? parseError.message : String(parseError);
    const msg = `corrupt providers.json — renamed to ${bak}; boot aborted. cause: ${cause}`;
    console.error(`feegle: ${msg}`);
    throw new Error(msg);
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

/**
 * One-shot migration of `~/.feegle/chat-bindings.json` into SQLite.
 *  - File absent → no-op (first-run or already migrated).
 *  - File present + DB already populated → partial-rollback (likely a downgrade left a stale
 *    file behind). Move it aside to a .bak rather than merging — no silent overwrite.
 *  - File present + DB empty → import every binding inside a single transaction, then unlink.
 *  - Corrupt JSON → rename to .bak + throw (mirrors providers.json failure-handling): no silent
 *    degradation. The operator sees the error and the .bak path; next boot is a clean no-op.
 */
export async function migrateLegacyChatBindingsJson(home: string, db: RuntimeDb): Promise<void> {
  const filePath = join(home, "chat-bindings.json");
  if (!existsSync(filePath)) {
    return;
  }

  let parsed: { bindings?: unknown[] };
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8")) as typeof parsed;
  } catch (parseError) {
    const bak = `${filePath}.bak.${Date.now()}`;
    renameSync(filePath, bak);
    const cause = parseError instanceof Error ? parseError.message : String(parseError);
    const msg = `corrupt chat-bindings.json — renamed to ${bak}; boot aborted. cause: ${cause}`;
    console.error(`feegle: ${msg}`);
    throw new Error(msg);
  }

  const existing = db.prepare(`select count(*) as n from chat_bindings`).get() as { n: number };
  if (existing.n > 0) {
    const bak = `${filePath}.bak.${Date.now()}`;
    renameSync(filePath, bak);
    console.warn(
      `feegle: chat_bindings already populated in SQLite; moved chat-bindings.json → ${bak} (no merge)`
    );
    return;
  }

  const bindings = (parsed.bindings ?? []) as Array<{
    chatId: string;
    repositoryIds: string[];
    updatedAt: string;
  }>;
  const insertHeader = db.prepare(
    `insert into chat_bindings(scope_key, updated_at) values (?, ?)`
  );
  const insertRepo = db.prepare(
    `insert into chat_binding_repositories(scope_key, repository_id, ordinal) values (?, ?, ?)`
  );
  const tx = db.transaction(() => {
    for (const binding of bindings) {
      insertHeader.run(binding.chatId, binding.updatedAt);
      binding.repositoryIds.forEach((repositoryId, index) => {
        insertRepo.run(binding.chatId, repositoryId, index + 1);
      });
    }
  });
  tx();

  unlinkSync(filePath);
  console.info(`feegle: migrated chat-bindings.json (${bindings.length} bindings) into SQLite`);
}
