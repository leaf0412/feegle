# Plugin Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Feegle's 180-line `FeegleApp.start()` into a typed plugin platform: a feature (including a platform adapter) is one plugin in one directory, added without editing core boot code.

**Architecture:** A typed `BootContext` accumulates capabilities through seven named boot phases run by a default-fatal runner with per-phase timing. Plugins (`FeeglePlugin`) group a feature's contributions to extension points (handler kinds, slash commands, quote clients, notification adapters, platform runtimes) and optionally provide capabilities. `FeegleApp` knows only the phase pipeline; Feishu becomes a plugin that owns its own wiring.

**Tech Stack:** TypeScript (NodeNext ESM, `.js` import specifiers), vitest, better-sqlite3.

**Spec:** `docs/superpowers/specs/2026-05-26-plugin-platform-design.md`

**Conventions for every task below:**
- Run a single test file with `npx vitest run <path>`; run the whole suite with `npm test`; typecheck with `npm run typecheck`.
- Imports use `.js` specifiers even for `.ts` sources (NodeNext).
- Branch for this work: `yb/refactor/plugin_platform_boot` (created in Stage 0). Each task ends in a per-file `git add` + commit (no `git add .`). Commit type per the repo convention (`refactor`/`feat`/`test`).
- "Verify the app still boots" means `npm run typecheck && npm test` both green — there is no headless boot harness yet; the integration test built in Task 6.3 is the boot smoke test.

---

## File Structure

**New — boot core (`src/boot/`):**
- `capabilities.ts` — the `Capabilities` catalog interface
- `boot-context.ts` — `BootContext` class + `CapabilityContext` type
- `boot-phase.ts` — `BootPhaseName`, `BootPhase`, `PhaseResult`, `BootReport`, `BootAbortError`
- `run-boot.ts` — `runBoot(phases, ctx)`
- `feegle-plugin.ts` — `FeeglePlugin`, `PluginProvision`, `PlatformRuntimeModule`, `Contributions`, `collectContributions(plugins)`
- `build-boot-phases.ts` — assembles the ordered `BootPhase[]`
- `default-plugins.ts` — the default `FeeglePlugin[]`
- `phases/infra-phase.ts`, `phases/stores-phase.ts`, `phases/providers-phase.ts`, `phases/kinds-phase.ts`, `phases/scheduler-phase.ts`, `phases/commands-phase.ts`, `phases/runtime-phase.ts`

**New — plugins (`src/plugins/`):**
- `stock/stock-plugin.ts`
- `gitlab-follow/gitlab-follow-plugin.ts`
- `core/core-plugin.ts`
- `feishu/feishu-plugin.ts`

**New — tests (`tests/boot/`):**
- `boot-context.test.ts`, `run-boot.test.ts`, `collect-contributions.test.ts`, `boot-integration.test.ts`

**Modified:**
- `src/scheduler/handler-kind-module.ts` — `register(registry, ctx)`; delete `HandlerKindRegistryDeps`
- `src/scheduler/build-handler-kind-registry.ts` — take `ctx` + explicit modules, drop auto-defaults
- `src/scheduler/default-handler-kind-modules.ts` — migrate the 6 modules to `ctx.pick`
- `src/stock/build-quote-client-registry.ts` — drop auto-defaults (modules come from plugins)
- `src/app/build-notification-broker.ts` — drop auto-defaults (adapters come from plugins)
- `src/platform/build-slash-command-registry.ts` — keep, called by commands phase
- `src/app/feegle-app.ts` — collapse `start()` to build phases + `runBoot`
- `tests/scheduler/build-handler-kind-registry.test.ts` — update to `ctx`

---

## Stage 0 — Branch

### Task 0.1: Create the working branch

**Files:** none

- [ ] **Step 1: Create and switch to the branch**

Run:
```bash
git checkout -b yb/refactor/plugin_platform_boot
```
Expected: `Switched to a new branch 'yb/refactor/plugin_platform_boot'`

(Note: the working tree already contains unrelated uncommitted changes from prior work. Do **not** `git add .`. Stage only the files each task names.)

---

## Stage 1 — Boot core infrastructure (no behavior change)

Builds `Capabilities`, `BootContext`, the phase runner, and the plugin/contribution types. Nothing wires into `FeegleApp` yet.

### Task 1.1: Capabilities catalog

**Files:**
- Create: `src/boot/capabilities.ts`

- [ ] **Step 1: Write the capabilities interface**

```ts
import type { AgentProviderRegistry } from "../agent/agent-provider-registry.js";
import type { ChatHistoryStore } from "../agent/chat-history-store.js";
import type { SessionStore } from "../agent/session-store.js";
import type { ConfigStorePort } from "../app/config-store.js";
import type { NotificationBroker } from "../app/notification-broker.js";
import type { RuntimeDb } from "../app/runtime-db.js";
import type { GitService } from "../git/git-service.js";
import type { GitLabClient } from "../gitlab/gitlab-client.js";
import type { GitLabFollowStore } from "../gitlab/gitlab-follow-store.js";
import type { FeishuUserDirectory } from "../feishu/feishu-user-directory.js";
import type { AliasStore } from "../platform/commands/alias-store.js";
import type { SlashCommandRegistry } from "../platform/slash-command-handler.js";
import type { ChatBindingStore } from "../repositories/chat-binding-store.js";
import type { InMemoryRepositoryRegistry } from "../repositories/repository-registry.js";
import type { RepositoryStore } from "../repositories/repository-store.js";
import type { WorkspaceStore } from "../repositories/workspace-store.js";
import type { DedupStore } from "../scheduler/dedup-store.js";
import type { HandlerKindRegistry } from "../scheduler/handler-kind-registry.js";
import type { RunsLog } from "../scheduler/runs-log.js";
import type { TaskRegistry } from "../scheduler/task-registry.js";
import type { TaskScheduler } from "../scheduler/task-scheduler.js";
import type { TaskStore } from "../scheduler/task-store.js";
import type { QuoteClient } from "../stock/stock-quote-port.js";
import type { StockStore } from "../stock/stock-store.js";
import type { ChatWorkspaceStore } from "../workbench/chat-workspace-store.js";
import type { PendingInteractionStore } from "../workbench/pending-interaction-store.js";
import type { PlanArtifactStore } from "../workbench/plan-artifact-store.js";

/**
 * The catalog of every capability the host can provide during boot. Grows only
 * when a genuinely new service is introduced — a rare, core-level change.
 */
export interface Capabilities {
  // infra
  configStore: ConfigStorePort;
  runtimeDb: RuntimeDb;
  chatWorkspaceStore: ChatWorkspaceStore;
  pendingInteractionStore: PendingInteractionStore;
  planArtifactStore: PlanArtifactStore;
  // stores
  sessionStore: SessionStore;
  chatHistory: ChatHistoryStore;
  aliasStore: AliasStore;
  repositoryStore: RepositoryStore;
  workspaceStore: WorkspaceStore;
  chatBindingStore: ChatBindingStore;
  stockStore: StockStore;
  dedupStore: DedupStore;
  runsLog: RunsLog;
  taskStore: TaskStore;
  taskRegistry: TaskRegistry;
  // providers
  agents: AgentProviderRegistry;
  gitlab: GitLabClient;
  gitlabFollowStore: GitLabFollowStore;
  gitService: GitService;
  notify: NotificationBroker;
  quote: QuoteClient;
  // kinds / scheduler
  kinds: HandlerKindRegistry;
  scheduler: TaskScheduler;
  // commands (userDirectory provided by the Feishu plugin)
  repositories: InMemoryRepositoryRegistry;
  userDirectory: FeishuUserDirectory;
  slashCommands: SlashCommandRegistry;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no value code yet, only a type). If any import path is wrong, fix it against the real export — these are all existing modules.

- [ ] **Step 3: Commit**

```bash
git add src/boot/capabilities.ts
git commit -m "refactor: add boot capability catalog interface"
```

### Task 1.2: BootContext

**Files:**
- Create: `src/boot/boot-context.ts`
- Test: `tests/boot/boot-context.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { BootContext } from "../../src/boot/boot-context.js";

describe("BootContext", () => {
  it("returns the provided value as a typed capability", () => {
    const ctx = new BootContext();
    ctx.provide("workspaceRootForTest" as never, "value" as never);
    expect(ctx.require("workspaceRootForTest" as never)).toBe("value");
  });

  it("throws when requiring a capability that was never provided", () => {
    const ctx = new BootContext();
    expect(() => ctx.require("quote")).toThrow(/capability not ready: quote/);
  });

  it("throws when the same capability is provided twice", () => {
    const ctx = new BootContext();
    ctx.provide("workspaceRootForTest" as never, 1 as never);
    expect(() => ctx.provide("workspaceRootForTest" as never, 2 as never)).toThrow(
      /capability already provided: workspaceRootForTest/
    );
  });

  it("pick returns a slice with every requested key", () => {
    const ctx = new BootContext();
    ctx.provide("a" as never, 1 as never);
    ctx.provide("b" as never, 2 as never);
    expect(ctx.pick("a" as never, "b" as never)).toEqual({ a: 1, b: 2 });
  });
});
```

(The `as never` casts let the test use synthetic keys without depending on real capability construction; production code uses real `keyof Capabilities` keys and stays fully typed.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/boot/boot-context.test.ts`
Expected: FAIL — cannot find module `boot-context.js`.

- [ ] **Step 3: Implement BootContext**

```ts
import type { Capabilities } from "./capabilities.js";

export class BootContext {
  private readonly caps = new Map<keyof Capabilities, unknown>();

  provide<K extends keyof Capabilities>(key: K, value: Capabilities[K]): void {
    if (this.caps.has(key)) {
      throw new Error(`capability already provided: ${String(key)}`);
    }
    this.caps.set(key, value);
  }

  require<K extends keyof Capabilities>(key: K): Capabilities[K] {
    if (!this.caps.has(key)) {
      throw new Error(`capability not ready: ${String(key)}`);
    }
    return this.caps.get(key) as Capabilities[K];
  }

  pick<K extends keyof Capabilities>(...keys: K[]): Pick<Capabilities, K> {
    const slice = {} as Pick<Capabilities, K>;
    for (const key of keys) {
      slice[key] = this.require(key);
    }
    return slice;
  }
}

/** Read-only view handed to module/plugin code. */
export type CapabilityContext = Pick<BootContext, "require" | "pick">;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/boot/boot-context.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/boot/boot-context.ts tests/boot/boot-context.test.ts
git commit -m "refactor: add typed BootContext capability accumulator"
```

### Task 1.3: Phase types + runner

**Files:**
- Create: `src/boot/boot-phase.ts`
- Create: `src/boot/run-boot.ts`
- Test: `tests/boot/run-boot.test.ts`

- [ ] **Step 1: Write the phase types**

`src/boot/boot-phase.ts`:
```ts
import type { BootContext } from "./boot-context.js";

export type BootPhaseName =
  | "infra"
  | "stores"
  | "providers"
  | "kinds"
  | "scheduler"
  | "commands"
  | "runtime";

export interface BootPhase {
  readonly name: BootPhaseName;
  run(ctx: BootContext): Promise<void>;
}

export interface PhaseResult {
  phase: BootPhaseName;
  status: "ok" | "failed";
  durationMs: number;
  error?: string;
}

export interface BootReport {
  phases: PhaseResult[];
  totalMs: number;
}

export class BootAbortError extends Error {
  constructor(
    readonly phase: BootPhaseName,
    readonly cause: unknown,
    readonly report: PhaseResult[]
  ) {
    super(`boot aborted in phase "${phase}": ${String(cause)}`);
    this.name = "BootAbortError";
  }
}
```

- [ ] **Step 2: Write the failing runner test**

`tests/boot/run-boot.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { BootContext } from "../../src/boot/boot-context.js";
import type { BootPhase } from "../../src/boot/boot-phase.js";
import { BootAbortError } from "../../src/boot/boot-phase.js";
import { runBoot } from "../../src/boot/run-boot.js";

function phase(name: BootPhase["name"], run: () => Promise<void>): BootPhase {
  return { name, run };
}

describe("runBoot", () => {
  it("runs phases in order and reports each as ok", async () => {
    const order: string[] = [];
    const report = await runBoot(
      [
        phase("infra", async () => void order.push("infra")),
        phase("stores", async () => void order.push("stores"))
      ],
      new BootContext()
    );
    expect(order).toEqual(["infra", "stores"]);
    expect(report.phases.map((p) => p.status)).toEqual(["ok", "ok"]);
  });

  it("aborts on the first failing phase and names it", async () => {
    const order: string[] = [];
    await expect(
      runBoot(
        [
          phase("infra", async () => void order.push("infra")),
          phase("stores", async () => {
            throw new Error("db locked");
          }),
          phase("providers", async () => void order.push("providers"))
        ],
        new BootContext()
      )
    ).rejects.toMatchObject({ name: "BootAbortError", phase: "stores" });
    expect(order).toEqual(["infra"]); // providers never ran
  });

  it("records the failed phase in the abort error report", async () => {
    try {
      await runBoot(
        [phase("infra", async () => { throw new Error("boom"); })],
        new BootContext()
      );
      throw new Error("expected runBoot to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BootAbortError);
      const abort = error as BootAbortError;
      expect(abort.report.at(-1)).toMatchObject({ phase: "infra", status: "failed" });
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/boot/run-boot.test.ts`
Expected: FAIL — cannot find module `run-boot.js`.

- [ ] **Step 4: Implement the runner**

`src/boot/run-boot.ts`:
```ts
import type { BootContext } from "./boot-context.js";
import { BootAbortError, type BootPhase, type BootReport, type PhaseResult } from "./boot-phase.js";

export async function runBoot(phases: readonly BootPhase[], ctx: BootContext): Promise<BootReport> {
  const results: PhaseResult[] = [];
  const bootStartedAt = performance.now();
  for (const phase of phases) {
    const startedAt = performance.now();
    try {
      await phase.run(ctx);
      const durationMs = Math.round(performance.now() - startedAt);
      results.push({ phase: phase.name, status: "ok", durationMs });
      console.log(`[boot] ${phase.name} ✓ ${durationMs}ms`);
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      results.push({ phase: phase.name, status: "failed", durationMs, error: String(error) });
      console.error(`[boot] ${phase.name} ✗ ${error}`);
      throw new BootAbortError(phase.name, error, results);
    }
  }
  const totalMs = Math.round(performance.now() - bootStartedAt);
  console.log(`[boot] ready in ${totalMs}ms`);
  return { phases: results, totalMs };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/boot/run-boot.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/boot/boot-phase.ts src/boot/run-boot.ts tests/boot/run-boot.test.ts
git commit -m "refactor: add default-fatal boot phase runner with timing"
```

### Task 1.4: Plugin types + collectContributions

**Files:**
- Create: `src/boot/feegle-plugin.ts`
- Test: `tests/boot/collect-contributions.test.ts`

- [ ] **Step 1: Write the plugin types + collector**

`src/boot/feegle-plugin.ts`:
```ts
import type { Startable } from "../app/feegle-app.js";
import type { NotificationAdapterModule } from "../app/notification-adapter-module.js";
import type { SlashCommandModule } from "../platform/slash-command-module.js";
import type { HandlerKindModule } from "../scheduler/handler-kind-module.js";
import type { QuoteClientModule } from "../stock/quote-client-module.js";
import type { BootContext, CapabilityContext } from "./boot-context.js";
import type { BootPhaseName } from "./boot-phase.js";

/** A platform adapter contributes a runtime built from capabilities. */
export interface PlatformRuntimeModule {
  readonly id: string;
  create(ctx: CapabilityContext): Startable;
}

/** Escape hatch: a plugin that supplies a capability at a chosen phase. */
export interface PluginProvision {
  readonly phase: BootPhaseName;
  run(ctx: BootContext): void | Promise<void>;
}

/** A feature, grouping its contributions to extension points. */
export interface FeeglePlugin {
  readonly id: string;
  readonly dependsOn?: readonly string[];
  readonly handlerKinds?: readonly HandlerKindModule[];
  readonly slashCommands?: readonly SlashCommandModule[];
  readonly quoteClients?: readonly QuoteClientModule[];
  readonly notificationAdapters?: readonly NotificationAdapterModule[];
  readonly platformRuntimes?: readonly PlatformRuntimeModule[];
  readonly provides?: readonly PluginProvision[];
}

export interface Contributions {
  handlerKinds: HandlerKindModule[];
  slashCommands: SlashCommandModule[];
  quoteClients: QuoteClientModule[];
  notificationAdapters: NotificationAdapterModule[];
  platformRuntimes: PlatformRuntimeModule[];
  provisions: PluginProvision[];
}

export function collectContributions(plugins: readonly FeeglePlugin[]): Contributions {
  return {
    handlerKinds: plugins.flatMap((p) => [...(p.handlerKinds ?? [])]),
    slashCommands: plugins.flatMap((p) => [...(p.slashCommands ?? [])]),
    quoteClients: plugins.flatMap((p) => [...(p.quoteClients ?? [])]),
    notificationAdapters: plugins.flatMap((p) => [...(p.notificationAdapters ?? [])]),
    platformRuntimes: plugins.flatMap((p) => [...(p.platformRuntimes ?? [])]),
    provisions: plugins.flatMap((p) => [...(p.provides ?? [])])
  };
}
```

- [ ] **Step 2: Write the failing test**

`tests/boot/collect-contributions.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { collectContributions, type FeeglePlugin } from "../../src/boot/feegle-plugin.js";

describe("collectContributions", () => {
  it("flattens each plugin's contributions by extension point, preserving order", () => {
    const plugins: FeeglePlugin[] = [
      { id: "a", handlerKinds: [{ id: "k1", register: () => {} }] },
      {
        id: "b",
        handlerKinds: [{ id: "k2", register: () => {} }],
        quoteClients: [{ id: "q1", register: () => {} }]
      }
    ];
    const result = collectContributions(plugins);
    expect(result.handlerKinds.map((m) => m.id)).toEqual(["k1", "k2"]);
    expect(result.quoteClients.map((m) => m.id)).toEqual(["q1"]);
    expect(result.slashCommands).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails, then passes**

Run: `npx vitest run tests/boot/collect-contributions.test.ts`
Expected: first FAIL (module missing) if written before the source; here the source exists, so it should PASS. Confirm PASS (1 test).

Note: `HandlerKindModule.register` still has its OLD signature at this point — the empty `() => {}` matches both old and new signatures, so this compiles before and after Stage 3.

- [ ] **Step 4: Commit**

```bash
git add src/boot/feegle-plugin.ts tests/boot/collect-contributions.test.ts
git commit -m "refactor: add FeeglePlugin types and contribution collector"
```

---

## Stage 2 — Migrate HandlerKindModule to the capability context

### Task 2.1: Change the HandlerKindModule signature and builder

**Files:**
- Modify: `src/scheduler/handler-kind-module.ts`
- Modify: `src/scheduler/build-handler-kind-registry.ts`
- Modify: `src/scheduler/default-handler-kind-modules.ts`
- Modify: `tests/scheduler/build-handler-kind-registry.test.ts`

- [ ] **Step 1: Replace `handler-kind-module.ts` entirely**

```ts
import type { CapabilityContext } from "../boot/boot-context.js";
import type { HandlerKindRegistry } from "./handler-kind-registry.js";

export interface HandlerKindModule {
  readonly id: string;
  register(registry: HandlerKindRegistry, ctx: CapabilityContext): void;
}
```

(`HandlerKindRegistryDeps` is deleted. The kind modules read what they need from `ctx`.)

- [ ] **Step 2: Replace `build-handler-kind-registry.ts` entirely**

```ts
import type { CapabilityContext } from "../boot/boot-context.js";
import { HandlerKindRegistry } from "./handler-kind-registry.js";
import type { HandlerKindModule } from "./handler-kind-module.js";

export interface BuildHandlerKindRegistryOptions {
  ctx: CapabilityContext;
  modules: readonly HandlerKindModule[];
}

export function buildHandlerKindRegistry(options: BuildHandlerKindRegistryOptions): HandlerKindRegistry {
  const registry = new HandlerKindRegistry();
  for (const module of options.modules) {
    module.register(registry, options.ctx);
  }
  registry.freeze();
  return registry;
}
```

(Auto-included defaults are removed: modules now come entirely from plugins via the kinds phase. The defaults move into plugins in Stage 4.)

- [ ] **Step 3: Migrate the 6 modules in `default-handler-kind-modules.ts`**

Replace the body of each module's `register` to pull from `ctx`. Exact per-module transformation (the `ctx.pick` keys are derived from each module's current `deps.*` usage):

```ts
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
      const { gitlab, gitlabFollowStore, gitService, agents } = ctx.pick(
        "gitlab",
        "gitlabFollowStore",
        "gitService",
        "agents"
      );
      registry.register(
        new GitLabFollowKind({
          gitlab,
          store: gitlabFollowStore,
          agents,
          git: gitService,
          workspaceRoot: process.env["GITLAB_WORKSPACE"] ?? `${process.env["HOME"]}/.feegle/repos`
        })
      );
    }
  };
}
```

Notes:
- The factory functions are now `export`ed so plugins (Stage 4) can reference them.
- `workspaceRoot` was previously threaded as a dep; it is a pure env-derived value, so it is computed inline here (matching `feegle-app.ts:117`). It is NOT a capability.
- The old gitlab-follow `if (!deps.gitlab) { console.warn; return; }` guard is **dropped**: in production these capabilities are always provided (Stage 5 providers phase). A missing `GITLAB_TOKEN` yields an empty-token client that fails loudly at task-run time via the scheduler's failure path — per the spec's Non-Goals (no boot-time silent degrade).

- [ ] **Step 4: Update `build-handler-kind-registry.test.ts`**

Replace the file to drive the builder through a `BootContext`:
```ts
import { describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../src/agent/agent-provider-registry.js";
import { BootContext } from "../../src/boot/boot-context.js";
import { buildHandlerKindRegistry } from "../../src/scheduler/build-handler-kind-registry.js";
import type { HandlerKind } from "../../src/scheduler/handler-kind.js";
import { TaskRegistry } from "../../src/scheduler/task-registry.js";
import type { StockStore } from "../../src/stock/stock-store.js";

function contextWithCoreCaps(): BootContext {
  const ctx = new BootContext();
  ctx.provide("taskRegistry", new TaskRegistry({ list: () => [], upsert: async () => {}, remove: async () => {} }));
  ctx.provide("stockStore", {} as StockStore);
  ctx.provide("quote", { query: async () => [] });
  ctx.provide("agents", new AgentProviderRegistry());
  return ctx;
}

describe("buildHandlerKindRegistry", () => {
  it("lets a kind module add a kind that pulls its deps from the context", () => {
    const kind: HandlerKind<Record<string, never>> = {
      id: "external-kind",
      title: "External",
      description: "External kind",
      parseParams: () => ({}),
      describeParams: () => "none",
      run: async () => ({ outcome: "noop" })
    };
    const registry = buildHandlerKindRegistry({
      ctx: contextWithCoreCaps(),
      modules: [{ id: "external", register: (target) => target.register(kind) }]
    });
    expect(registry.get("external-kind")).toBe(kind);
  });

  it("rejects duplicate kind ids across modules so a scheduled task has a single implementation", () => {
    const kind: HandlerKind<Record<string, never>> = {
      id: "duplicate-kind",
      title: "Dup",
      description: "dup",
      parseParams: () => ({}),
      describeParams: () => "none",
      run: async () => ({ outcome: "noop" })
    };
    expect(() =>
      buildHandlerKindRegistry({
        ctx: contextWithCoreCaps(),
        modules: [
          { id: "first", register: (target) => target.register(kind) },
          { id: "second", register: (target) => target.register(kind) }
        ]
      })
    ).toThrow(/Duplicate kind/);
  });
});
```

- [ ] **Step 5: Typecheck — expect failures in `feegle-app.ts`**

Run: `npm run typecheck`
Expected: FAIL only in `src/app/feegle-app.ts` (it still calls `buildHandlerKindRegistry` with the old options shape). This is expected and fixed in the next step.

- [ ] **Step 6: Patch `feegle-app.ts` to the new builder call (temporary bridge)**

In `src/app/feegle-app.ts`, replace the `buildHandlerKindRegistry({...})` call (currently lines ~131-141) with a context-bridged call. Insert before it a local `BootContext` populated with the capabilities the kinds need, then call the new builder:

```ts
import { BootContext } from "../boot/boot-context.js";
import { defaultHandlerKindModules } from "../scheduler/default-handler-kind-modules.js";
// ...
const bootCtx = new BootContext();
bootCtx.provide("taskRegistry", taskRegistry);
bootCtx.provide("stockStore", stockStore);
bootCtx.provide("quote", quote);
bootCtx.provide("agents", agentProviders);
bootCtx.provide("gitlab", gitlabClient);
bootCtx.provide("gitlabFollowStore", gitlabFollowStore);
bootCtx.provide("gitService", gitService);
const kinds = buildHandlerKindRegistry({
  ctx: bootCtx,
  modules: [...defaultHandlerKindModules(), ...(this.deps.handlerKindModules ?? [])]
});
```

(This bridge is thrown away in Stage 6 when `start()` collapses. Its only job is to keep the app compiling and tests green between stages.)

- [ ] **Step 7: Run typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: PASS. The migrated kinds register identically; behavior is unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/scheduler/handler-kind-module.ts src/scheduler/build-handler-kind-registry.ts src/scheduler/default-handler-kind-modules.ts tests/scheduler/build-handler-kind-registry.test.ts src/app/feegle-app.ts
git commit -m "refactor: drive handler kinds from typed capability context"
```

---

## Stage 3 — Stop the quote/notification builders from auto-including defaults

Plugins become the single source of modules. The two builders that still auto-include defaults (`buildQuoteClientRegistry`, `buildNotificationBroker`) must take their modules explicitly. (`buildSlashCommandRegistry` already supports `defaults: false` and keeps working; `buildHandlerKindRegistry` was handled in Stage 2.)

### Task 3.1: Quote + notification builders take explicit modules

**Files:**
- Modify: `src/stock/build-quote-client-registry.ts`
- Modify: `src/app/build-notification-broker.ts`
- Modify: `src/app/feegle-app.ts`

- [ ] **Step 1: Update `build-quote-client-registry.ts`**

Keep `defaultQuoteClientModules()` exported (plugins reference it), but make the builder register only the modules it is given:
```ts
import { QuoteClientRegistry } from "./quote-client-registry.js";
import type { QuoteClientModule } from "./quote-client-module.js";

export interface BuildQuoteClientRegistryOptions {
  modules: readonly QuoteClientModule[];
}

export function buildQuoteClientRegistry(options: BuildQuoteClientRegistryOptions): QuoteClientRegistry {
  const registry = new QuoteClientRegistry();
  for (const module of options.modules) {
    module.register(registry);
  }
  registry.freeze();
  return registry;
}
```

- [ ] **Step 2: Update `build-notification-broker.ts`**

```ts
import { NotificationBroker } from "./notification-broker.js";
import type { NotificationAdapterDeps, NotificationAdapterModule } from "./notification-adapter-module.js";

export interface BuildNotificationBrokerOptions extends NotificationAdapterDeps {
  modules: readonly NotificationAdapterModule[];
}

export function buildNotificationBroker(options: BuildNotificationBrokerOptions): NotificationBroker {
  const broker = new NotificationBroker();
  for (const module of options.modules) {
    module.register(broker, options);
  }
  broker.freeze();
  return broker;
}
```

Keep the `feishuNotificationAdapterModule` factory but export it (the Feishu plugin references it in Stage 5):
```ts
export function feishuNotificationAdapterModule(): NotificationAdapterModule {
  return {
    id: "feishu",
    register: (broker, deps) => {
      broker.register("feishu", new FeishuNotificationAdapter(deps.feishuClient));
    }
  };
}
```

- [ ] **Step 3: Bridge the two call sites in `feegle-app.ts`**

The quote registry call (currently ~line 128) becomes:
```ts
import { buildQuoteClientRegistry } from "../stock/build-quote-client-registry.js";
import { defaultQuoteClientModules } from "../stock/default-quote-client-modules.js";
// ...
const quote = requiredQuoteClient(
  buildQuoteClientRegistry({
    modules: [...defaultQuoteClientModules(), ...(this.deps.quoteClientModules ?? [])]
  }).get(quoteClientId),
  quoteClientId
);
```

The notification broker call (currently ~line 121) becomes:
```ts
import { buildNotificationBroker, feishuNotificationAdapterModule } from "./build-notification-broker.js";
// ...
const notify = buildNotificationBroker({
  feishuClient: this.deps.feishuClient,
  modules: [feishuNotificationAdapterModule(), ...(this.deps.notificationAdapterModules ?? [])]
});
```

- [ ] **Step 4: Typecheck + suite**

Run: `npm run typecheck && npm test`
Expected: PASS. (If any other call site of these two builders exists, update it the same way; grep `buildQuoteClientRegistry\|buildNotificationBroker` across `src` and `tests` first.)

- [ ] **Step 5: Commit**

```bash
git add src/stock/build-quote-client-registry.ts src/app/build-notification-broker.ts src/app/feegle-app.ts
git commit -m "refactor: pass quote/notification modules explicitly to builders"
```

---

## Stage 4 — Define the default plugins

### Task 4.1: Feature plugins (stock, gitlab-follow, core)

**Files:**
- Create: `src/plugins/stock/stock-plugin.ts`
- Create: `src/plugins/gitlab-follow/gitlab-follow-plugin.ts`
- Create: `src/plugins/core/core-plugin.ts`

- [ ] **Step 1: Stock plugin**

```ts
import type { FeeglePlugin } from "../../boot/feegle-plugin.js";
import {
  stockAdvisorKindModule,
  stockMonitorKindModule,
  stockPortfolioSnapshotKindModule
} from "../../scheduler/default-handler-kind-modules.js";
import { defaultQuoteClientModules } from "../../stock/default-quote-client-modules.js";

export const stockPlugin: FeeglePlugin = {
  id: "stock",
  quoteClients: defaultQuoteClientModules(),
  handlerKinds: [stockMonitorKindModule(), stockPortfolioSnapshotKindModule(), stockAdvisorKindModule()]
};
```

(If `default-quote-client-modules.ts` exports individual factories, prefer importing the specific one; `defaultQuoteClientModules()` returning the full default set is acceptable since there is a single default quote client today.)

- [ ] **Step 2: GitLab-follow plugin**

```ts
import type { FeeglePlugin } from "../../boot/feegle-plugin.js";
import { gitlabFollowKindModule } from "../../scheduler/default-handler-kind-modules.js";

export const gitlabFollowPlugin: FeeglePlugin = {
  id: "gitlab-follow",
  handlerKinds: [gitlabFollowKindModule()]
};
```

- [ ] **Step 3: Core plugin**

```ts
import type { FeeglePlugin } from "../../boot/feegle-plugin.js";
import { agentPromptKindModule, heartbeatKindModule } from "../../scheduler/default-handler-kind-modules.js";
import { defaultSlashCommandModules } from "../../platform/commands/default-slash-command-modules.js";

export const corePlugin: FeeglePlugin = {
  id: "core",
  handlerKinds: [heartbeatKindModule(), agentPromptKindModule()],
  slashCommands: defaultSlashCommandModules()
};
```

(All eight default slash command modules stay grouped under `core` for now — they are cross-cutting system/setup/session/agent/repo/scheduler/provider/glsum commands. Splitting `glsum` out to the gitlab-follow plugin later is a one-line move and not required for this refactor.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (these are unreferenced data modules; they must still compile).

- [ ] **Step 5: Commit**

```bash
git add src/plugins/stock/stock-plugin.ts src/plugins/gitlab-follow/gitlab-follow-plugin.ts src/plugins/core/core-plugin.ts
git commit -m "feat: add stock, gitlab-follow, and core feature plugins"
```

---

## Stage 5 — Extract the seven phases and the Feishu plugin

This is the heart of the refactor: move the wiring out of `start()` into phase modules and the Feishu plugin. All code below is **moved** from `feegle-app.ts` (lines cited), not invented.

### Task 5.1: infra, stores, providers, kinds, scheduler phases

**Files:**
- Create: `src/boot/phases/infra-phase.ts`
- Create: `src/boot/phases/stores-phase.ts`
- Create: `src/boot/phases/providers-phase.ts`
- Create: `src/boot/phases/kinds-phase.ts`
- Create: `src/boot/phases/scheduler-phase.ts`

Each phase is a factory `(deps) => BootPhase` that provides its capabilities into `ctx`. `deps` is a subset of `FeegleAppDeps` (defined in Stage 6 as `BootPhaseDeps`); for now type the factory parameter against the fields it uses.

- [ ] **Step 1: infra-phase.ts** — moves `feegle-app.ts:92-97`

```ts
import { join } from "node:path";
import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import { ConfigStore, type ConfigStorePort } from "../../app/config-store.js";
import { acquireFeegleLock } from "../../app/feegle-lock.js";
import { openRuntimeDb } from "../../app/runtime-db.js";
import { ChatWorkspaceStore } from "../../workbench/chat-workspace-store.js";
import { PendingInteractionStore } from "../../workbench/pending-interaction-store.js";
import { PlanArtifactStore } from "../../workbench/plan-artifact-store.js";

export interface InfraPhaseDeps {
  feegleHome: string;
  acquireLock?: (feegleHome: string) => Promise<() => Promise<void>>;
  loadConfigStore?: (feegleHome: string) => Promise<ConfigStorePort>;
  onLockRelease(release: () => Promise<void>): void;
}

export function infraPhase(deps: InfraPhaseDeps): BootPhase {
  return {
    name: "infra",
    run: async (ctx: BootContext) => {
      deps.onLockRelease(await (deps.acquireLock ?? acquireFeegleLock)(deps.feegleHome));
      ctx.provide("configStore", await (deps.loadConfigStore ?? ConfigStore.load)(deps.feegleHome));
      const runtimeDb = openRuntimeDb(join(deps.feegleHome, "feegle.db"));
      ctx.provide("runtimeDb", runtimeDb);
      ctx.provide("chatWorkspaceStore", new ChatWorkspaceStore(runtimeDb));
      ctx.provide("pendingInteractionStore", new PendingInteractionStore(runtimeDb));
      ctx.provide("planArtifactStore", new PlanArtifactStore(runtimeDb));
    }
  };
}
```

(`onLockRelease`/`runtimeDb` handle: `FeegleApp` needs the lock-release closure and the db handle for `stop()`. The phase hands them back via `onLockRelease` and `ctx.require("runtimeDb")`.)

- [ ] **Step 2: stores-phase.ts** — moves `feegle-app.ts:100-116`

```ts
import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import { ChatHistoryStore } from "../../agent/chat-history-store.js";
import { SessionStore } from "../../agent/session-store.js";
import { AliasStore } from "../../platform/commands/alias-store.js";
import { ChatBindingStore } from "../../repositories/chat-binding-store.js";
import { RepositoryStore } from "../../repositories/repository-store.js";
import { WorkspaceStore } from "../../repositories/workspace-store.js";
import { DedupStore } from "../../scheduler/dedup-store.js";
import { RunsLog } from "../../scheduler/runs-log.js";
import { TaskRegistry } from "../../scheduler/task-registry.js";
import { TaskStore } from "../../scheduler/task-store.js";
import { StockStore } from "../../stock/stock-store.js";
import type { Task } from "../../scheduler/task.js";

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
      ctx.provide("workspaceStore", await WorkspaceStore.load(deps.feegleHome));
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
```

- [ ] **Step 3: providers-phase.ts** — moves `feegle-app.ts:106-130` (agents/gitlab/git/notify/quote) + runs plugin `provides` for this phase + builds the quote registry from contributions

```ts
import { join } from "node:path";
import { homedir } from "node:os";
import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import type { Contributions } from "../feegle-plugin.js";
import type { AgentProviderRegistry } from "../../agent/agent-provider-registry.js";
import { buildAgentProviderRegistry } from "../../agent/build-agent-provider-registry.js";
import { GitService } from "../../git/git-service.js";
import { GitLabClient } from "../../gitlab/gitlab-client.js";
import { GitLabFollowStore } from "../../gitlab/gitlab-follow-store.js";
import { buildNotificationBroker } from "../../app/build-notification-broker.js";
import { buildQuoteClientRegistry } from "../../stock/build-quote-client-registry.js";
import type { FeishuClientPort } from "../../feishu/feishu-client.js";

export interface ProvidersPhaseDeps {
  feegleHome: string;
  feishuClient: FeishuClientPort;
  quoteClientId: string;
  contributions: Contributions;
  resolveAgents(ctx: BootContext): Promise<AgentProviderRegistry>;
}

export function providersPhase(deps: ProvidersPhaseDeps): BootPhase {
  return {
    name: "providers",
    run: async (ctx: BootContext) => {
      ctx.provide("agents", await deps.resolveAgents(ctx));
      ctx.provide("gitlab", new GitLabClient(process.env["GITLAB_TOKEN"] ?? ""));
      ctx.provide("gitlabFollowStore", new GitLabFollowStore(ctx.require("runtimeDb")));
      ctx.provide("gitService", new GitService());
      ctx.provide(
        "notify",
        buildNotificationBroker({ feishuClient: deps.feishuClient, modules: deps.contributions.notificationAdapters })
      );
      const quoteRegistry = buildQuoteClientRegistry({ modules: deps.contributions.quoteClients });
      const quote = quoteRegistry.get(deps.quoteClientId);
      if (!quote) {
        throw new Error(`Quote client not registered: ${deps.quoteClientId}`);
      }
      ctx.provide("quote", quote);
      // plugins that supply capabilities in this phase (e.g. Feishu → userDirectory)
      for (const provision of deps.contributions.provisions.filter((p) => p.phase === "providers")) {
        await provision.run(ctx);
      }
    }
  };
}
```

(`resolveAgents` carries the `agentProviders ?? loadAgentProviders ?? buildAgentProviderRegistry` logic from `feegle-app.ts:106-110`, plus `requireAgentConfig` and the `EmptyProviderStoreReadView` — those two helpers move to Stage 6's `build-boot-phases.ts` or a small `src/boot/resolve-agents.ts`. The `gitlabWorkspaceRoot` env var stays inline in the gitlab-follow kind module, not here.)

- [ ] **Step 4: kinds-phase.ts** — replaces `feegle-app.ts:131-141`

```ts
import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import type { Contributions } from "../feegle-plugin.js";
import { buildHandlerKindRegistry } from "../../scheduler/build-handler-kind-registry.js";

export function kindsPhase(deps: { contributions: Contributions }): BootPhase {
  return {
    name: "kinds",
    run: async (ctx: BootContext) => {
      ctx.provide("kinds", buildHandlerKindRegistry({ ctx, modules: deps.contributions.handlerKinds }));
    }
  };
}
```

- [ ] **Step 5: scheduler-phase.ts** — moves `feegle-app.ts:143-158`

```ts
import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import type { HookManager } from "../../app/hooks.js";
import type { NotificationBroker } from "../../app/notification-broker.js";
import type { ConfigStorePort } from "../../app/config-store.js";
import type { Startable } from "../../app/feegle-app.js";
import { ConsoleJsonLogger } from "../../scheduler/logger.js";
import { TaskScheduler } from "../../scheduler/task-scheduler.js";
import { RuntimeHostInfoProvider } from "../../scheduler/util/host-info.js";
import { warnStartupGaps } from "../warn-startup-gaps.js";

export interface SchedulerPhaseDeps {
  ownerEmails: ReadonlySet<string>;
  hooks?: HookManager;
  createScheduler?: (deps: { notify: NotificationBroker; configStore: ConfigStorePort; hooks?: HookManager }) => Startable;
  onScheduler(scheduler: Startable): void;
}

export function schedulerPhase(deps: SchedulerPhaseDeps): BootPhase {
  return {
    name: "scheduler",
    run: async (ctx: BootContext) => {
      const { configStore, taskRegistry, kinds, dedupStore, runsLog, notify, agents } = ctx.pick(
        "configStore",
        "taskRegistry",
        "kinds",
        "dedupStore",
        "runsLog",
        "notify",
        "agents"
      );
      warnStartupGaps(configStore, taskRegistry, deps.ownerEmails);
      const scheduler =
        deps.createScheduler?.({ notify, configStore, hooks: deps.hooks }) ??
        new TaskScheduler({
          registry: taskRegistry,
          configStore,
          kinds,
          dedup: dedupStore,
          runsLog,
          notify,
          agents,
          host: new RuntimeHostInfoProvider(),
          clock: { now: () => new Date() },
          logger: new ConsoleJsonLogger(),
          hooks: deps.hooks
        });
      await scheduler.start();
      deps.hooks?.emit({ event: "scheduler.started" });
      ctx.provide("scheduler", scheduler as TaskScheduler);
      deps.onScheduler(scheduler);
    }
  };
}
```

(Move `warnStartupGaps` from `feegle-app.ts:346-354` into a new `src/boot/warn-startup-gaps.ts`, exported, unchanged.)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS for the new phase files in isolation. `feegle-app.ts` still uses its inline wiring (untouched this task) so the app still compiles. If a phase file references a not-yet-created helper (`warn-startup-gaps.ts`, `resolve-agents.ts`), create it now by moving the corresponding helper out of `feegle-app.ts` (keep a re-export in `feegle-app.ts` if it is still referenced there until Stage 6).

- [ ] **Step 7: Commit**

```bash
git add src/boot/phases/infra-phase.ts src/boot/phases/stores-phase.ts src/boot/phases/providers-phase.ts src/boot/phases/kinds-phase.ts src/boot/phases/scheduler-phase.ts src/boot/warn-startup-gaps.ts
git commit -m "refactor: extract infra/stores/providers/kinds/scheduler boot phases"
```

### Task 5.2: Feishu plugin + commands & runtime phases

**Files:**
- Create: `src/plugins/feishu/feishu-plugin.ts`
- Create: `src/boot/phases/commands-phase.ts`
- Create: `src/boot/phases/runtime-phase.ts`

- [ ] **Step 1: commands-phase.ts** — builds `repositories` + `slashCommands` from `ctx` (replaces `feegle-app.ts:160-183`)

```ts
import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import type { Contributions } from "../feegle-plugin.js";
import { InMemoryRepositoryRegistry } from "../../repositories/repository-registry.js";
import { buildSlashCommandRegistry } from "../../platform/build-slash-command-registry.js";
import type { TaskScheduler } from "../../scheduler/task-scheduler.js";

export function commandsPhase(deps: { feegleHome: string; ownerEmails: ReadonlySet<string>; contributions: Contributions }): BootPhase {
  return {
    name: "commands",
    run: async (ctx: BootContext) => {
      const repositories = new InMemoryRepositoryRegistry();
      ctx.provide("repositories", repositories);
      const c = ctx.pick(
        "userDirectory", "repositoryStore", "workspaceStore", "chatBindingStore",
        "taskRegistry", "configStore", "stockStore", "quote", "kinds", "scheduler",
        "runsLog", "agents", "sessionStore", "chatHistory", "aliasStore"
      );
      const registry = buildSlashCommandRegistry({
        feegleHome: deps.feegleHome,
        userDirectory: c.userDirectory,
        repositories,
        repositoryStore: c.repositoryStore,
        workspaceStore: c.workspaceStore,
        chatBindingStore: c.chatBindingStore,
        ownerEmails: deps.ownerEmails,
        taskRegistry: c.taskRegistry,
        configStore: c.configStore,
        stockStore: c.stockStore,
        quote: c.quote,
        kinds: c.kinds,
        scheduler: c.scheduler as TaskScheduler,
        runsLog: c.runsLog,
        providers: c.agents,
        sessionStore: c.sessionStore,
        chatHistory: c.chatHistory,
        aliasStore: c.aliasStore,
        modules: deps.contributions.slashCommands,
        defaults: false
      });
      ctx.provide("slashCommands", registry);
    }
  };
}
```

(`providerStore` was an `EmptyProviderStoreReadView` passed at `feegle-app.ts:178`; pass the same instance — construct it here or expose it as a capability. Keep behavior identical: build one `EmptyProviderStoreReadView` and pass it as `providerStore`. `defaults: false` because the slash modules now come from the core plugin's contributions.)

- [ ] **Step 2: feishu-plugin.ts** — moves `feegle-app.ts:161` (userDirectory) and `184-270` (chatHandler/workbench/responder/runtime)

```ts
import type { FeeglePlugin } from "../../boot/feegle-plugin.js";
import type { Startable } from "../../app/feegle-app.js";
import type { FeishuClientPort } from "../../feishu/feishu-client.js";
import type { FeishuCloudDocClientPort } from "../../feishu/feishu-cloud-doc-client.js";
import type { FeishuCommandHandler } from "../../feishu/feishu-long-connection-runtime.js";
import { FeishuUserDirectory } from "../../feishu/feishu-user-directory.js";
import { FeishuChatHandler } from "../../feishu/feishu-chat-handler.js";
import { FeishuCommandResponder, logFeishuCommandTrace } from "../../feishu/feishu-command-responder.js";
import { DirectorySetupService } from "../../workbench/directory-setup-service.js";
import { PlanArtifactService } from "../../workbench/plan-artifact-service.js";
import { PlanExecutionService } from "../../workbench/plan-execution-service.js";
import { GitService } from "../../git/git-service.js";
import {
  buildPlanExecutionRevisionCard,
  buildPlanRevisionRequestCard
} from "../../feishu/feishu-workbench-cards.js";

export interface FeishuPluginDeps {
  feishuClient: FeishuClientPort;
  cloudDoc: FeishuCloudDocClientPort;
  runtimeFactory: (handler: FeishuCommandHandler) => Startable;
}

export function createFeishuPlugin(deps: FeishuPluginDeps): FeeglePlugin {
  return {
    id: "feishu",
    provides: [
      {
        phase: "providers",
        run: (ctx) => ctx.provide("userDirectory", new FeishuUserDirectory(deps.feishuClient))
      }
    ],
    platformRuntimes: [
      {
        id: "feishu-long-connection",
        create: (ctx) => {
          const cap = ctx.pick(
            "configStore", "taskRegistry", "userDirectory", "slashCommands", "agents",
            "sessionStore", "chatHistory", "workspaceStore", "chatBindingStore",
            "chatWorkspaceStore", "pendingInteractionStore", "planArtifactStore"
          );
          const config = cap.configStore.get();
          const chatHandler = new FeishuChatHandler({
            client: deps.feishuClient,
            providers: cap.agents,
            history: cap.chatHistory,
            sessionStore: cap.sessionStore,
            workspaceStore: cap.workspaceStore,
            chatBindingStore: cap.chatBindingStore,
            chatWorkspaceStore: cap.chatWorkspaceStore,
            pendingInteractions: cap.pendingInteractionStore,
            configuredWorkspaces: config.workspaces
          });
          const workbench = new DirectorySetupService({
            chatWorkspaces: cap.chatWorkspaceStore,
            pendingInteractions: cap.pendingInteractionStore,
            chatHandler
          });
          const planArtifacts = new PlanArtifactService({
            feegleHome: process.env["FEEGLE_HOME"] ?? `${process.env["HOME"]}/.feegle`,
            client: deps.feishuClient,
            cloudDoc: deps.cloudDoc,
            store: cap.planArtifactStore
          });
          const planExecution = new PlanExecutionService({
            feegleHome: process.env["FEEGLE_HOME"] ?? `${process.env["HOME"]}/.feegle`,
            client: deps.feishuClient,
            store: cap.planArtifactStore,
            git: new GitService(),
            agent: cap.agents.resolveActiveAgent() ?? {
              runDevelopmentTask: async () => {
                throw new Error("no active agent provider configured for plan execution");
              }
            }
          });
          const responder = new FeishuCommandResponder(deps.feishuClient, {
            registry: cap.slashCommands,
            chatHandler,
            trace: logFeishuCommandTrace,
            configStore: cap.configStore,
            taskRegistry: cap.taskRegistry,
            userDirectory: cap.userDirectory,
            workbench: buildWorkbenchHandlers({ planArtifactStore: cap.planArtifactStore, agents: cap.agents, planArtifacts, planExecution, workbench })
          });
          return deps.runtimeFactory(responder);
        }
      }
    ]
  };
}
```

(`feegleHome` is needed by `PlanArtifactService`/`PlanExecutionService`. Rather than reading env, thread it through `FeishuPluginDeps` — add `feegleHome: string` to `FeishuPluginDeps` and use `deps.feegleHome` instead of the `process.env` fallbacks shown above. `buildWorkbenchHandlers` is a private helper in this file holding the workbench-handler object literal verbatim from `feegle-app.ts:224-267` — extract it to keep `create` under the 50-line cap.)

- [ ] **Step 3: Add the `buildWorkbenchHandlers` helper**

In `feishu-plugin.ts`, add a module-private function containing the exact workbench handler object from `feegle-app.ts:224-267` (the `handleDirectorySubmit` … `handlePlanReviseExecutionSubmit` closures), parameterized by `{ planArtifactStore, agents, planArtifacts, planExecution, workbench }`. Copy it verbatim — only the captured variable names change to the helper's parameters.

- [ ] **Step 4: runtime-phase.ts** — replaces `feegle-app.ts:269-270`

```ts
import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import type { Contributions } from "../feegle-plugin.js";
import type { Startable } from "../../app/feegle-app.js";

export function runtimePhase(deps: { contributions: Contributions; onRuntime(r: Startable): void }): BootPhase {
  return {
    name: "runtime",
    run: async (ctx: BootContext) => {
      const runtimes = deps.contributions.platformRuntimes.map((m) => m.create(ctx));
      for (const runtime of runtimes) {
        await runtime.start();
      }
      const primary = runtimes[0];
      if (!primary) {
        throw new Error("no platform runtime registered");
      }
      deps.onRuntime(primary);
    }
  };
}
```

(`runtime` is intentionally NOT a `Capabilities` key — it is tracked by `FeegleApp` via the `onRuntime` callback so `stop()` can reach it. The phase starts every registered runtime and hands the first one back. Stage 6 `start()` reads the runtime from this callback, not from `ctx`.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS for the new files in isolation; `feegle-app.ts` still has its old inline wiring and compiles. Resolve any import errors against real exports.

- [ ] **Step 6: Commit**

```bash
git add src/boot/phases/commands-phase.ts src/boot/phases/runtime-phase.ts src/plugins/feishu/feishu-plugin.ts
git commit -m "refactor: extract commands/runtime phases and Feishu platform plugin"
```

---

## Stage 6 — Collapse FeegleApp.start() and wire it end to end

### Task 6.1: default-plugins + build-boot-phases

**Files:**
- Create: `src/boot/default-plugins.ts`
- Create: `src/boot/build-boot-phases.ts`
- Create: `src/boot/resolve-agents.ts` (the agents-resolution helper moved from `feegle-app.ts`)

- [ ] **Step 1: resolve-agents.ts** — moves `feegle-app.ts:99,106-110,282-313`

```ts
import type { BootContext } from "./boot-context.js";
import type { AgentProviderRegistry } from "../agent/agent-provider-registry.js";
import { buildAgentProviderRegistry } from "../agent/build-agent-provider-registry.js";
import type { ConfigStorePort } from "../app/config-store.js";
import type { ProvidersFile, ProviderStorePort } from "../agent/provider-store.js";

export class EmptyProviderStoreReadView implements ProviderStorePort {
  snapshot(): Readonly<ProvidersFile> {
    return { schemaVersion: 1, providers: [], activeKind: null };
  }
  async setActive(_kind: ProvidersFile["activeKind"]): Promise<void> {}
  async upsert(): Promise<void> {
    throw new Error("provider register is disabled when agent providers are configured in config.jsonc");
  }
  async updateSettings(): Promise<never> {
    throw new Error("provider settings are disabled when agent providers are configured in config.jsonc");
  }
  async remove(): Promise<never> {
    throw new Error("provider unregister is disabled when agent providers are configured in config.jsonc");
  }
}

function requireAgentConfig(config: Readonly<ReturnType<ConfigStorePort["get"]>>) {
  if (!config.agent) {
    throw new Error("agent config is required. Add ~/.feegle/config.jsonc with agent.default and agent.providers.");
  }
  return config.agent;
}

export interface ResolveAgentsDeps {
  feegleHome: string;
  agentProviders?: AgentProviderRegistry;
  loadAgentProviders?: (feegleHome: string) => Promise<AgentProviderRegistry>;
}

export function makeResolveAgents(deps: ResolveAgentsDeps) {
  return async (ctx: BootContext): Promise<AgentProviderRegistry> => {
    if (deps.agentProviders) return deps.agentProviders;
    if (deps.loadAgentProviders) return deps.loadAgentProviders(deps.feegleHome);
    return buildAgentProviderRegistry({
      store: new EmptyProviderStoreReadView(),
      config: requireAgentConfig(ctx.require("configStore").get())
    });
  };
}
```

- [ ] **Step 2: default-plugins.ts**

```ts
import type { FeeglePlugin } from "./feegle-plugin.js";
import type { Startable } from "../app/feegle-app.js";
import type { FeishuClientPort } from "../feishu/feishu-client.js";
import type { FeishuCloudDocClientPort } from "../feishu/feishu-cloud-doc-client.js";
import type { FeishuCommandHandler } from "../feishu/feishu-long-connection-runtime.js";
import { corePlugin } from "../plugins/core/core-plugin.js";
import { stockPlugin } from "../plugins/stock/stock-plugin.js";
import { gitlabFollowPlugin } from "../plugins/gitlab-follow/gitlab-follow-plugin.js";
import { createFeishuPlugin } from "../plugins/feishu/feishu-plugin.js";

export interface DefaultPluginDeps {
  feegleHome: string;
  feishuClient: FeishuClientPort;
  cloudDoc: FeishuCloudDocClientPort;
  runtimeFactory: (handler: FeishuCommandHandler) => Startable;
}

export function defaultPlugins(deps: DefaultPluginDeps): FeeglePlugin[] {
  return [
    corePlugin,
    stockPlugin,
    gitlabFollowPlugin,
    createFeishuPlugin({
      feegleHome: deps.feegleHome,
      feishuClient: deps.feishuClient,
      cloudDoc: deps.cloudDoc,
      runtimeFactory: deps.runtimeFactory
    })
  ];
}
```

- [ ] **Step 3: build-boot-phases.ts** — assembles the ordered phase list

```ts
import type { BootContext } from "./boot-context.js";
import type { BootPhase } from "./boot-phase.js";
import type { Contributions } from "./feegle-plugin.js";
import { makeResolveAgents } from "./resolve-agents.js";
import { infraPhase } from "./phases/infra-phase.js";
import { storesPhase } from "./phases/stores-phase.js";
import { providersPhase } from "./phases/providers-phase.js";
import { kindsPhase } from "./phases/kinds-phase.js";
import { schedulerPhase } from "./phases/scheduler-phase.js";
import { commandsPhase } from "./phases/commands-phase.js";
import { runtimePhase } from "./phases/runtime-phase.js";
import type { FeegleAppDeps, Startable } from "../app/feegle-app.js";
import type { Task } from "../scheduler/task.js";

export interface BuildBootPhasesDeps {
  appDeps: FeegleAppDeps;
  contributions: Contributions;
  quoteClientId: string;
  seedTasks: Task[];
  onLockRelease(release: () => Promise<void>): void;
  onScheduler(scheduler: Startable): void;
  onRuntime(runtime: Startable): void;
}

export function buildBootPhases(deps: BuildBootPhasesDeps): BootPhase[] {
  const { appDeps } = deps;
  return [
    infraPhase({
      feegleHome: appDeps.feegleHome,
      acquireLock: appDeps.acquireLock,
      loadConfigStore: appDeps.loadConfigStore,
      onLockRelease: deps.onLockRelease
    }),
    storesPhase({ feegleHome: appDeps.feegleHome, seedTasks: deps.seedTasks }),
    providersPhase({
      feegleHome: appDeps.feegleHome,
      feishuClient: appDeps.feishuClient,
      quoteClientId: deps.quoteClientId,
      contributions: deps.contributions,
      resolveAgents: makeResolveAgents({
        feegleHome: appDeps.feegleHome,
        agentProviders: appDeps.agentProviders,
        loadAgentProviders: appDeps.loadAgentProviders
      })
    }),
    kindsPhase({ contributions: deps.contributions }),
    schedulerPhase({
      ownerEmails: appDeps.ownerEmails,
      hooks: appDeps.hooks,
      createScheduler: appDeps.createScheduler,
      onScheduler: deps.onScheduler
    }),
    commandsPhase({ feegleHome: appDeps.feegleHome, ownerEmails: appDeps.ownerEmails, contributions: deps.contributions }),
    runtimePhase({ contributions: deps.contributions, onRuntime: deps.onRuntime })
  ];
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS for new files; `feegle-app.ts` still compiles with its old body.

- [ ] **Step 5: Commit**

```bash
git add src/boot/default-plugins.ts src/boot/build-boot-phases.ts src/boot/resolve-agents.ts
git commit -m "refactor: assemble default plugins and boot phase pipeline"
```

### Task 6.2: Collapse FeegleApp.start()

**Files:**
- Modify: `src/app/feegle-app.ts`

- [ ] **Step 1: Rewrite `FeegleApp` to use the pipeline**

Replace the `start()` body and the now-unused private helpers. Keep `FeegleAppDeps`, `Startable`, and `defaultSeedTasks()` (move `defaultSeedTasks` to stay in this file or to `src/boot/default-seed-tasks.ts`). Add an optional `plugins?: readonly FeeglePlugin[]` to `FeegleAppDeps` for test injection. New shape:

```ts
import { BootContext } from "../boot/boot-context.js";
import { buildBootPhases } from "../boot/build-boot-phases.js";
import { collectContributions, type FeeglePlugin } from "../boot/feegle-plugin.js";
import { defaultPlugins } from "../boot/default-plugins.js";
import { runBoot } from "../boot/run-boot.js";
import type { BootReport } from "../boot/boot-phase.js";
import { defaultQuoteClientId } from "../stock/default-quote-client-modules.js";
// ... keep existing type-only imports used by FeegleAppDeps

export class FeegleApp {
  private lockfileRelease?: () => Promise<void>;
  private scheduler?: Startable;
  private runtime?: Startable;
  private runtimeDb?: RuntimeDb;
  private report?: BootReport;

  constructor(private readonly deps: FeegleAppDeps) {}

  async start(): Promise<void> {
    const ctx = new BootContext();
    const plugins =
      this.deps.plugins ??
      defaultPlugins({
        feegleHome: this.deps.feegleHome,
        feishuClient: this.deps.feishuClient,
        cloudDoc: this.deps.cloudDoc,
        runtimeFactory: this.deps.runtimeFactory
      });
    const contributions = collectContributions(plugins);
    const phases = buildBootPhases({
      appDeps: this.deps,
      contributions,
      quoteClientId: this.deps.quoteClientId ?? defaultQuoteClientId,
      seedTasks: defaultSeedTasks(),
      onLockRelease: (release) => { this.lockfileRelease = release; },
      onScheduler: (scheduler) => { this.scheduler = scheduler; },
      onRuntime: (runtime) => { this.runtime = runtime; }
    });
    this.report = await runBoot(phases, ctx);
    this.runtimeDb = ctx.require("runtimeDb");
  }

  bootReport(): BootReport | undefined {
    return this.report;
  }

  async stop(): Promise<void> {
    await this.runtime?.stop?.();
    await this.scheduler?.stop?.();
    this.runtimeDb?.close();
    this.deps.hooks?.emit({ event: "scheduler.stopped" });
    await this.lockfileRelease?.();
  }
}
```

Add to `FeegleAppDeps`:
```ts
  plugins?: readonly FeeglePlugin[];
```

Delete from this file (now in phases/helpers): the inline store/provider/kind/scheduler/command/runtime wiring, `EmptyProviderStoreReadView`, `requireAgentConfig`, `requiredQuoteClient`, `warnStartupGaps`. Keep `defaultSeedTasks`. Remove the corresponding now-unused imports.

Note on `hooks`: the old code stored `this.hooks = deps.hooks`; now read `this.deps.hooks` directly (the scheduler phase already receives it via `buildBootPhases`). Keep `slashCommandModules`/`handlerKindModules`/`quoteClientModules`/`notificationAdapterModules` on `FeegleAppDeps` for backward compatibility, but they are no longer consumed by the default path — mark them deprecated in a comment, or (preferred) fold any injected modules into an extra plugin appended to `plugins`. For this task, append a synthetic plugin when those fields are set:
```ts
const injected: FeeglePlugin = {
  id: "injected-modules",
  handlerKinds: this.deps.handlerKindModules ?? [],
  slashCommands: this.deps.slashCommandModules ?? [],
  quoteClients: this.deps.quoteClientModules ?? [],
  notificationAdapters: this.deps.notificationAdapterModules ?? []
};
```
and include it in `plugins` when any field is non-empty. This preserves the existing injection contract used by tests/entrypoints.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Fix any dangling import or unused-symbol error by removing the moved code/imports.

- [ ] **Step 3: Full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/feegle-app.ts
git commit -m "refactor: collapse FeegleApp.start into the boot phase pipeline"
```

### Task 6.3: Integration boot test

**Files:**
- Test: `tests/boot/boot-integration.test.ts`

- [ ] **Step 1: Write the integration test**

Boot `FeegleApp` against fakes and assert the report. Use the existing test fakes/patterns for `feishuClient`/`cloudDoc`/`runtimeFactory` (search `tests/` for an existing `FeegleApp` construction or a `FakeFeishuClient` to reuse; do not invent a new fake if one exists). Skeleton:

```ts
import { describe, expect, it } from "vitest";
import { FeegleApp } from "../../src/app/feegle-app.js";
// import existing fakes: fakeFeishuClient, fakeCloudDoc, a no-op runtime factory

describe("FeegleApp boot", () => {
  it("runs all seven phases to ok and starts the platform runtime", async () => {
    let started = false;
    const app = new FeegleApp({
      feegleHome: /* a tmp dir */ makeTmpFeegleHome(),
      ownerEmails: new Set<string>(),
      feishuClient: fakeFeishuClient(),
      cloudDoc: fakeCloudDoc(),
      agentProviders: new AgentProviderRegistry(),
      runtimeFactory: () => ({ start: async () => { started = true; }, stop: async () => {} })
    });
    await app.start();
    const report = app.bootReport();
    expect(report?.phases.map((p) => p.phase)).toEqual([
      "infra", "stores", "providers", "kinds", "scheduler", "commands", "runtime"
    ]);
    expect(report?.phases.every((p) => p.status === "ok")).toBe(true);
    expect(started).toBe(true);
    await app.stop();
  });

  it("aborts boot when a platform runtime fails to start, naming the runtime phase", async () => {
    const app = new FeegleApp({
      feegleHome: makeTmpFeegleHome(),
      ownerEmails: new Set<string>(),
      feishuClient: fakeFeishuClient(),
      cloudDoc: fakeCloudDoc(),
      agentProviders: new AgentProviderRegistry(),
      runtimeFactory: () => ({ start: async () => { throw new Error("connect failed"); } })
    });
    await expect(app.start()).rejects.toMatchObject({ name: "BootAbortError", phase: "runtime" });
  });
});
```

(`makeTmpFeegleHome` creates an isolated temp dir with `os.tmpdir()` + `mkdtempSync` so the SQLite db and JSON stores are throwaway. `agentProviders` is injected directly to skip config-file loading. If existing tests already construct `FeegleApp`, copy their fake setup verbatim.)

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/boot/boot-integration.test.ts`
Expected: PASS (2 tests). If the first boot throws on a missing capability (e.g. a phase consuming something not yet provided), the error names the exact key — fix the providing phase.

- [ ] **Step 3: Commit**

```bash
git add tests/boot/boot-integration.test.ts
git commit -m "test: add end-to-end boot pipeline integration test"
```

### Task 6.4: Final verification

- [ ] **Step 1: Whole suite + typecheck + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all PASS. The build proves the `dist/` entrypoint (`start:feishu`) still compiles against the new boot path.

- [ ] **Step 2: Confirm no dead references**

Run: `grep -rn "HandlerKindRegistryDeps\|EmptyProviderStoreReadView" src tests`
Expected: `HandlerKindRegistryDeps` — no matches. `EmptyProviderStoreReadView` — only in `src/boot/resolve-agents.ts`.

- [ ] **Step 3: Debug-log sweep (per repo convention)**

Run: `grep -rE '\[DEBUG-[a-z0-9-]+\]' src`
Expected: no matches.

- [ ] **Step 4: Commit any cleanup**, then stop for review. Do not push (push requires explicit instruction).

---

## Self-Review Notes (for the planner; remove before execution if desired)

- **Spec coverage:** Capabilities/BootContext (1.1–1.2) ✓; phase runner + default-fatal + timing (1.3) ✓; FeeglePlugin + collectContributions (1.4) ✓; HandlerKindModule→ctx + delete deps bag (2.1) ✓; builders take explicit modules so plugins are the source (3.1) ✓; feature plugins (4.1) ✓; seven phases (5.1–5.2, 6.1) ✓; platformRuntimes + Feishu plugin owning its wiring + userDirectory via `provides` (5.2) ✓; FeegleApp collapse + boot report (6.2) ✓; integration test incl. abort-on-failure (6.3) ✓; Non-Goal "no optional/degrade" honored (no `optional` field; gitlab guard dropped) ✓.
- **Known judgment call (flagged to user):** only `HandlerKindModule` migrates to `ctx`; slash command modules keep their typed deps bag, sourced from `ctx` in the commands phase. Recorded in the spec's "Module Interface Change" section.
- **Open item to resolve during execution:** confirm `default-quote-client-modules.ts` exports a single-client factory vs the full set; `stock-plugin.ts` should contribute exactly the quote client(s) it owns. Confirm whether any existing test constructs `FeegleApp` so 6.3 reuses real fakes rather than new ones.
```
