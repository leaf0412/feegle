import { existsSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import { z } from "zod";
import { ChatHistoryStore } from "@integrations/agent/chat-history-store.js";
import { ProviderStore } from "@integrations/agent/provider-store.js";
import { SessionRecordSchema, SessionStore } from "@integrations/agent/session-store.js";
import type { ConfigStoreProviderWriter } from "../../app/config-store.js";
import type { RuntimeDb } from "../../app/runtime-db.js";
import { ArtifactService } from "@core/artifacts/artifact-service.js";
import { ArtifactStore } from "@core/artifacts/artifact-store.js";
import { PermissionService } from "@core/security/permission-service.js";
import { PolicyService } from "@core/security/policy-service.js";
import { ControlActionProcessor } from "@core/control/control-action-processor.js";
import { ControlActionStore } from "@core/control/control-action-store.js";
import { IdentityResolver } from "@core/ingress/identity-resolver.js";
import { IngressDispatcher, type PluginDefaultWorkspaceResolver } from "@core/ingress/ingress-dispatcher.js";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { PermissionPolicy } from "@core/ingress/permission-policy.js";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import { WorkspaceResolver } from "@core/ingress/workspace-resolver.js";
import { WorkspaceStore } from "@resources/workspace/workspace-store.js";
import { MemoryService } from "@core/memory/memory-service.js";
import { MemoryStore } from "@core/memory/memory-store.js";
import { RuntimeInspectionService } from "@core/operations/runtime-inspection-service.js";
import { RecoveryService } from "@core/recovery/recovery-service.js";
import { AliasStore } from "@platform/commands/alias-store.js";
import { ChatBindingStore } from "@resources/repositories/chat-binding-store.js";
import { RepositoryRecordSchema, RepositoryStore } from "@resources/repositories/repository-store.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { RuntimeEffectExecutor } from "@core/runtime/runtime-effect-executor.js";
import { RuntimeStore } from "@core/runtime/runtime-store.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { WorkflowRuntime } from "@core/runtime/workflow-runtime.js";
import { DedupStore } from "@features/scheduler/dedup-store.js";
import { RunsLog } from "@features/scheduler/runs-log.js";
import { TaskRegistry } from "@features/scheduler/task-registry.js";
import { TaskStore } from "@features/scheduler/task-store.js";
import type { Task } from "@features/scheduler/task.js";
import { StockStore } from "@integrations/stock/stock-store.js";

import type { PluginProvision } from "../feegle-plugin.js";

export interface StoresPhaseDeps {
  feegleHome: string;
  seedTasks: Task[];
  provisions: PluginProvision[];
}

export function storesPhase(deps: StoresPhaseDeps): BootPhase {
  return {
    name: "stores",
    run: async (ctx: BootContext) => {
      // Sessions live in SQLite (table `sessions`). First boot after upgrade:
      // import the legacy ~/.feegle/sessions.json then unlink it.
      const runtimeDb = ctx.require("runtimeDb");
      const runtimeStore = new RuntimeStore(runtimeDb);
      const workflowRegistry = new WorkflowRegistry();
      const intentResolvers = new IntentResolverRegistry();
      const workflowSelector = new WorkflowSelector();
      const effectHandlers = new EffectHandlerRegistry();
      const artifactStore = new ArtifactStore(runtimeDb);
      ctx.provide("runtimeStore", runtimeStore);
      ctx.provide("workflowRegistry", workflowRegistry);
      ctx.provide("intentResolvers", intentResolvers);
      ctx.provide("workflowSelector", workflowSelector);
      const workspaceStore = new WorkspaceStore(runtimeDb);
      ctx.provide("identityResolver", new IdentityResolver(workspaceStore));
      ctx.provide("workspaceResolver", new WorkspaceResolver(workspaceStore));
      ctx.provide("permissionPolicy", new PermissionPolicy(workspaceStore));
      ctx.provide("effectHandlers", effectHandlers);
      const effectExecutor = new RuntimeEffectExecutor(runtimeStore, effectHandlers);
      ctx.provide("effectExecutor", effectExecutor);
      ctx.provide("workflowRuntime", new WorkflowRuntime(runtimeStore, workflowRegistry, effectExecutor));
      ctx.provide("artifactStore", artifactStore);
      const permissionService = new PermissionService(workspaceStore);
      const policyService = new PolicyService(
        (wsId, userId) => workspaceStore.getMembership(wsId, userId) !== undefined
      );
      ctx.provide("permissionService", permissionService);
      ctx.provide("policyService", policyService);
      ctx.provide("artifactService", new ArtifactService(
        artifactStore,
        join(deps.feegleHome, "artifacts"),
        permissionService,
        policyService
      ));
      const memoryStore = new MemoryStore(runtimeDb);
      ctx.provide("memoryStore", memoryStore);
      ctx.provide("memoryService", new MemoryService(memoryStore));
      ctx.provide("runtimeInspectionService", new RuntimeInspectionService(runtimeStore));
      ctx.provide("recoveryService", new RecoveryService(
        ctx.require("artifactService"),
        runtimeStore,
        artifactStore,
        memoryStore
      ));
      const controlActionStore = new ControlActionStore(runtimeDb);
      ctx.provide("controlActionStore", controlActionStore);
      ctx.provide(
        "controlActionProcessor",
        new ControlActionProcessor(controlActionStore, {}, {
          emit: (input) =>
            runtimeStore.appendRuntimeEvent({
              id: input.id,
              workspaceId: input.workspaceId,
              workflowInstanceId: input.workflowInstanceId,
              runAttemptId: input.runAttemptId,
              stepStateId: input.stepStateId,
              effectExecutionId: input.effectExecutionId,
              category: input.category,
              type: input.type,
              payload: input.payload,
              now: input.now
            })
        })
      );

      // Construct the single production IngressDispatcher so every platform
      // runtime receives the same ingress pipeline from boot.
      const defaultWorkspaceId = ctx.require("configStore").get().defaultWorkspace;
      const pluginDefaultWorkspace: PluginDefaultWorkspaceResolver = {
        resolveDefaultWorkspace: (_pluginId: string) =>
          typeof defaultWorkspaceId === "string" && defaultWorkspaceId.length > 0
            ? defaultWorkspaceId
            : undefined
      };
      const ingressDispatcher = new IngressDispatcher({
        identityResolver: ctx.require("identityResolver"),
        workspaceResolver: ctx.require("workspaceResolver"),
        permissionPolicy: ctx.require("permissionPolicy"),
        intentResolvers,
        workflowSelector,
        workflowRuntime: ctx.require("workflowRuntime"),
        eventSink: {
          emit: (input) =>
            runtimeStore.appendRuntimeEvent({
              id: input.id,
              workspaceId: input.workspaceId,
              workflowInstanceId: input.workflowInstanceId,
              runAttemptId: input.runAttemptId,
              stepStateId: input.stepStateId,
              effectExecutionId: input.effectExecutionId,
              category: input.category,
              type: input.type,
              payload: input.payload,
              now: input.now
            })
        },
        pluginDefaultWorkspace,
        idFactory: {
          workflowInstanceId: () => `wfi_${randomId()}`,
          runAttemptId: () => `ra_${randomId()}`
        },
        clock: {
          nowIso: () => new Date().toISOString()
        }
      });
      ctx.provide("runtimeIngress", ingressDispatcher);

      await migrateLegacySessionsJson(deps.feegleHome, runtimeDb);
      ctx.provide("sessionStore", new SessionStore(runtimeDb));
      ctx.provide("chatHistory", new ChatHistoryStore());
      ctx.provide("aliasStore", await AliasStore.load(deps.feegleHome));

      // Repositories live in SQLite (table `repositories` + `repository_id_counter`).
      // First boot after upgrade: import the legacy ~/.feegle/repositories.json
      // (rows AND the nextId counter) then unlink it.
      await migrateLegacyRepositoriesJson(deps.feegleHome, runtimeDb);
      ctx.provide("repositoryStore", new RepositoryStore(runtimeDb));

      // Chat bindings live in SQLite (chat_bindings + chat_binding_repositories).
      // First boot after upgrade: import the legacy JSON then unlink it.
      await migrateLegacyChatBindingsJson(deps.feegleHome, runtimeDb);
      ctx.provide("chatBindingStore", new ChatBindingStore(runtimeDb));

      ctx.provide("stockStore", await StockStore.load(deps.feegleHome));

      // Dedup marks live in SQLite (table `dedup_keys`). First boot after upgrade:
      // import the legacy ~/.feegle/dedup.json then unlink it.
      await migrateLegacyDedupJson(deps.feegleHome, runtimeDb);
      ctx.provide("dedupStore", new DedupStore(runtimeDb));
      ctx.provide("runsLog", await RunsLog.open(deps.feegleHome));

      // Tasks live in SQLite (table `tasks`). First boot after upgrade:
      // import the legacy ~/.feegle/task-store.json then unlink it.
      await migrateLegacyTaskStoreJson(deps.feegleHome, runtimeDb);
      const taskStore = new TaskStore(runtimeDb);
      await taskStore.ensureSeed(deps.seedTasks);
      ctx.provide("taskStore", taskStore);
      ctx.provide("taskRegistry", new TaskRegistry(taskStore));

      // Provider config has a single source of truth: config.jsonc agent.providers.
      // Old installs may still have ~/.feegle/providers.json — migrate it then delete.
      const configStore = ctx.require("configStore");
      await migrateLegacyProvidersJson(deps.feegleHome, configStore);
      ctx.provide("providerStore", ProviderStore.fromConfig(configStore));

      // workspaces.json is a leftover from the removed named-workspace feature.
      // Nothing reads it. Delete it unconditionally — no migration target needed.
      deleteOrphanWorkspacesJson(deps.feegleHome);

      // Run stores-phase provisions so plugins can wire into registries
      for (const provision of deps.provisions.filter((p) => p.phase === "stores")) {
        await provision.run(ctx);
      }
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

/**
 * One-shot migration of `~/.feegle/sessions.json` into SQLite (table `sessions`).
 *  - File absent → no-op (first-run or already migrated).
 *  - File present + DB already populated → partial-rollback. Move it aside to .bak
 *    rather than merging — no silent overwrite of in-flight session state.
 *  - File present + DB empty → import every session inside a single transaction,
 *    then unlink the file.
 *  - Corrupt JSON → rename to .bak + throw (mirrors providers.json / chat-bindings.json
 *    failure-handling): no silent degradation. Operator sees the error + the .bak
 *    path; next boot becomes a clean no-op.
 */
const SessionsFileMigratorSchema = z.object({
  schemaVersion: z.literal(1),
  sessions: z.array(SessionRecordSchema)
});

export async function migrateLegacySessionsJson(home: string, db: RuntimeDb): Promise<void> {
  const filePath = join(home, "sessions.json");
  if (!existsSync(filePath)) {
    return;
  }

  let parsed: { schemaVersion: 1; sessions: Array<z.infer<typeof SessionRecordSchema>> };
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    parsed = SessionsFileMigratorSchema.parse(raw);
  } catch (parseError) {
    const bak = `${filePath}.bak.${Date.now()}`;
    renameSync(filePath, bak);
    const cause = parseError instanceof Error ? parseError.message : String(parseError);
    const msg = `corrupt sessions.json — renamed to ${bak}; boot aborted. cause: ${cause}`;
    console.error(`feegle: ${msg}`);
    throw new Error(msg);
  }

  const existing = db.prepare(`select count(*) as n from sessions`).get() as { n: number };
  if (existing.n > 0) {
    const bak = `${filePath}.bak.${Date.now()}`;
    renameSync(filePath, bak);
    console.warn(
      `feegle: sessions already populated in SQLite; moved sessions.json → ${bak} (no merge)`
    );
    return;
  }

  const insertSession = db.prepare(
    `insert into sessions(session_key, name, agent_kind, acp_session_id, quiet, created_at, last_active_at, status)
       values (@session_key, @name, @agent_kind, @acp_session_id, @quiet, @created_at, @last_active_at, @status)`
  );
  const tx = db.transaction(() => {
    for (const session of parsed.sessions) {
      insertSession.run({
        session_key: session.sessionKey,
        name: session.name ?? null,
        agent_kind: session.agentKind ?? null,
        acp_session_id: session.acpSessionId ?? null,
        quiet: session.quiet ? 1 : 0,
        created_at: session.createdAt,
        last_active_at: session.lastActiveAt,
        status: session.status
      });
    }
  });
  tx();

  unlinkSync(filePath);
  console.info(`feegle: migrated sessions.json (${parsed.sessions.length} sessions) into SQLite`);
}

/**
 * One-shot migration of `~/.feegle/task-store.json` into SQLite (table `tasks`).
 *  - File absent → no-op (first-run or already migrated).
 *  - File present + DB already populated → partial-rollback. Move it aside to .bak
 *    rather than merging — no silent overwrite of existing task state.
 *  - File present + DB empty → import every task inside a single transaction,
 *    then unlink the file.
 *  - Corrupt JSON → rename to .bak + throw (mirrors the established failure-handling
 *    pattern): no silent degradation. Operator sees the error + the .bak path; next
 *    boot becomes a clean no-op.
 */
const TaskLastRunMigratorSchema = z.object({
  at: z.string(),
  status: z.enum(["ok", "silent", "noop", "skipped", "failed"]),
  durationMs: z.number().nonnegative(),
  note: z.string().optional()
});

const TaskMigratorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  params: z.record(z.unknown()),
  cron: z.string().min(1),
  timezone: z.string().min(1),
  activeHours: z.array(z.string().min(1)).nullable(),
  target: z
    .object({
      platform: z.string().min(1),
      chatId: z.string().min(1)
    })
    .nullable(),
  enabled: z.boolean(),
  source: z.enum(["seed", "domain", "user"]),
  errorPolicy: z.enum(["always", "on-change", "silent"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastRun: TaskLastRunMigratorSchema.nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  lastErrorNotifiedAt: z.string().nullable()
});

const TaskStoreFileMigratorSchema = z.object({
  schemaVersion: z.literal(1),
  tasks: z.array(TaskMigratorSchema)
});

export async function migrateLegacyTaskStoreJson(home: string, db: RuntimeDb): Promise<void> {
  const filePath = join(home, "task-store.json");
  if (!existsSync(filePath)) {
    return;
  }

  let parsed: z.infer<typeof TaskStoreFileMigratorSchema>;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    parsed = TaskStoreFileMigratorSchema.parse(raw);
  } catch (parseError) {
    const bak = `${filePath}.bak.${Date.now()}`;
    renameSync(filePath, bak);
    const cause = parseError instanceof Error ? parseError.message : String(parseError);
    const msg = `corrupt task-store.json — renamed to ${bak}; boot aborted. cause: ${cause}`;
    console.error(`feegle: ${msg}`);
    throw new Error(msg);
  }

  const existing = db.prepare(`select count(*) as n from tasks`).get() as { n: number };
  if (existing.n > 0) {
    const bak = `${filePath}.bak.${Date.now()}`;
    renameSync(filePath, bak);
    console.warn(
      `feegle: tasks already populated in SQLite; moved task-store.json → ${bak} (no merge)`
    );
    return;
  }

  const insertTask = db.prepare(
    `insert into tasks(id, name, kind, cron, timezone, enabled, source, error_policy,
                       consecutive_failures, last_error_notified_at,
                       params_json, active_hours_json, target_json, last_run_json,
                       created_at, updated_at)
       values (@id, @name, @kind, @cron, @timezone, @enabled, @source, @error_policy,
               @consecutive_failures, @last_error_notified_at,
               @params_json, @active_hours_json, @target_json, @last_run_json,
               @created_at, @updated_at)`
  );

  const tx = db.transaction(() => {
    for (const task of parsed.tasks) {
      insertTask.run({
        id: task.id,
        name: task.name,
        kind: task.kind,
        cron: task.cron,
        timezone: task.timezone,
        enabled: task.enabled ? 1 : 0,
        source: task.source,
        error_policy: task.errorPolicy,
        consecutive_failures: task.consecutiveFailures,
        last_error_notified_at: task.lastErrorNotifiedAt,
        params_json: JSON.stringify(task.params),
        active_hours_json: task.activeHours !== null ? JSON.stringify(task.activeHours) : null,
        target_json: task.target !== null ? JSON.stringify(task.target) : null,
        last_run_json: task.lastRun !== null ? JSON.stringify(task.lastRun) : null,
        created_at: task.createdAt,
        updated_at: task.updatedAt
      });
    }
  });
  tx();

  unlinkSync(filePath);
  console.info(`feegle: migrated task-store.json (${parsed.tasks.length} tasks) into SQLite`);
}

/**
 * One-shot migration of `~/.feegle/dedup.json` into SQLite (table `dedup_keys`).
 *  - File absent → no-op (first-run or already migrated).
 *  - File present + DB already populated → partial-rollback. Move it aside to .bak
 *    rather than merging — no silent overwrite of existing dedup state.
 *  - File present + DB empty → import every mark inside a single transaction,
 *    then unlink the file.
 *  - Corrupt JSON → rename to .bak + throw (mirrors the established failure-handling
 *    pattern): no silent degradation. Operator sees the error + the .bak path; next
 *    boot becomes a clean no-op.
 */
const DedupFileMigratorSchema = z.object({
  schemaVersion: z.literal(1),
  date: z.string(),
  marks: z.record(z.array(z.string()))
});

export async function migrateLegacyDedupJson(home: string, db: RuntimeDb): Promise<void> {
  const filePath = join(home, "dedup.json");
  if (!existsSync(filePath)) {
    return;
  }

  let parsed: z.infer<typeof DedupFileMigratorSchema>;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    parsed = DedupFileMigratorSchema.parse(raw);
  } catch (parseError) {
    const bak = `${filePath}.bak.${Date.now()}`;
    renameSync(filePath, bak);
    const cause = parseError instanceof Error ? parseError.message : String(parseError);
    const msg = `corrupt dedup.json — renamed to ${bak}; boot aborted. cause: ${cause}`;
    console.error(`feegle: ${msg}`);
    throw new Error(msg);
  }

  const existing = db.prepare(`select count(*) as n from dedup_keys`).get() as { n: number };
  if (existing.n > 0) {
    const bak = `${filePath}.bak.${Date.now()}`;
    renameSync(filePath, bak);
    console.warn(
      `feegle: dedup_keys already populated in SQLite; moved dedup.json → ${bak} (no merge)`
    );
    return;
  }

  // Only migrate marks that belong to a non-empty date; an empty date means the store
  // was initialised but never used — nothing to import.
  if (!parsed.date) {
    unlinkSync(filePath);
    console.info(`feegle: dedup.json had no active date; skipped import, file unlinked`);
    return;
  }

  const insertMark = db.prepare(
    `insert or ignore into dedup_keys(task_id, condition_key, date_in_tz) values (?, ?, ?)`
  );

  let markCount = 0;
  const tx = db.transaction(() => {
    for (const [taskId, conditionKeys] of Object.entries(parsed.marks)) {
      for (const conditionKey of conditionKeys) {
        insertMark.run(taskId, conditionKey, parsed.date);
        markCount++;
      }
    }
  });
  tx();

  unlinkSync(filePath);
  console.info(`feegle: migrated dedup.json (${markCount} marks for date ${parsed.date}) into SQLite`);
}

/**
 * One-shot migration of `~/.feegle/repositories.json` into SQLite (table
 * `repositories` + `repository_id_counter`).
 *  - File absent → no-op (first-run or already migrated).
 *  - File present + DB already populated → partial-rollback. Move it aside to .bak
 *    rather than merging — no silent overwrite of existing repositories.
 *  - File present + DB empty → import every repository AND restore the nextId
 *    counter inside a single transaction, then unlink the file. Restoring the
 *    counter is essential: a reset-to-1 counter would mint `repo_1` again and
 *    collide with a migrated row.
 *  - Corrupt JSON → rename to .bak + throw (mirrors the established failure-handling
 *    pattern): no silent degradation. Operator sees the error + the .bak path; next
 *    boot becomes a clean no-op.
 */
const RepositoriesFileMigratorSchema = z.object({
  schemaVersion: z.literal(1),
  nextId: z.number().int().nonnegative(),
  repositories: z.array(RepositoryRecordSchema)
});

export async function migrateLegacyRepositoriesJson(home: string, db: RuntimeDb): Promise<void> {
  const filePath = join(home, "repositories.json");
  if (!existsSync(filePath)) {
    return;
  }

  let parsed: z.infer<typeof RepositoriesFileMigratorSchema>;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    parsed = RepositoriesFileMigratorSchema.parse(raw);
  } catch (parseError) {
    const bak = `${filePath}.bak.${Date.now()}`;
    renameSync(filePath, bak);
    const cause = parseError instanceof Error ? parseError.message : String(parseError);
    const msg = `corrupt repositories.json — renamed to ${bak}; boot aborted. cause: ${cause}`;
    console.error(`feegle: ${msg}`);
    throw new Error(msg);
  }

  const existing = db.prepare(`select count(*) as n from repositories`).get() as { n: number };
  if (existing.n > 0) {
    const bak = `${filePath}.bak.${Date.now()}`;
    renameSync(filePath, bak);
    console.warn(
      `feegle: repositories already populated in SQLite; moved repositories.json → ${bak} (no merge)`
    );
    return;
  }

  const insertRepo = db.prepare(
    `insert into repositories(id, name, remote_url, default_base_branch, created_at, updated_at)
       values (@id, @name, @remote_url, @default_base_branch, @created_at, @updated_at)`
  );
  // Restore the counter to the legacy nextId so post-migration add() does not
  // collide with migrated ids. `insert or replace` overwrites the lazily-seeded
  // (id=1, next_id=1) row that RepositoryStore's constructor would otherwise create.
  const setCounter = db.prepare(
    `insert or replace into repository_id_counter(id, next_id) values (1, ?)`
  );
  const tx = db.transaction(() => {
    for (const repository of parsed.repositories) {
      insertRepo.run({
        id: repository.id,
        name: repository.name,
        remote_url: repository.remoteUrl,
        default_base_branch: repository.defaultBaseBranch,
        created_at: repository.createdAt,
        updated_at: repository.updatedAt
      });
    }
    setCounter.run(parsed.nextId);
  });
  tx();

  unlinkSync(filePath);
  console.info(
    `feegle: migrated repositories.json (${parsed.repositories.length} repositories, nextId ${parsed.nextId}) into SQLite`
  );
}

/**
 * One-shot cleanup. `~/.feegle/workspaces.json` is a leftover from the
 * named-workspace feature that was removed. No migration target exists —
 * the data is meaningless. Delete it when found; no-op when absent.
 */
export function deleteOrphanWorkspacesJson(home: string): void {
  const filePath = join(home, "workspaces.json");
  if (existsSync(filePath)) {
    unlinkSync(filePath);
    console.info("feegle: removed orphan workspaces.json (named-workspace feature was removed)");
  }
}

function randomId(): string {
  return randomBytes(12).toString("base64url");
}
