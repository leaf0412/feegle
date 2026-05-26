# Plugin Platform Architecture for Feegle

Date: 2026-05-26
Status: draft
Author: yb + Claude

> Supersedes `2026-05-26-event-driven-boot-design.md`. That draft proposed a
> string-keyed pub/sub event bus with default-skip failure isolation. This
> design keeps the same goals (readable boot, observability, fewer files per
> feature, clean failure) but rejects the event bus (over-engineered for a
> deterministic sequential boot), keeps full compile-time type safety, drops the
> silent-degrade mechanism (no real consumer — YAGNI), and reframes the work as
> turning Feegle into a **first-party plugin platform**.

## Problem

`FeegleApp.start()` is a ~180-line sequential method that manually constructs
every subsystem and threads dependencies between them by position. Two concrete
costs:

1. **A feature is scattered across directories.** The "stock" feature spreads a
   quote client, three handler kinds, and a slash command group across
   `src/stock/`, `src/scheduler/kinds/`, and `src/platform/commands/`. There is
   no single place that says "this is the stock feature." `FEATURE_MAP.md` exists
   only to paper over this.
2. **Adding a feature touches the core.** Adding a handler kind that needs a new
   dependency means: implement it, widen the shared `HandlerKindRegistryDeps`
   bag, add a module entry, and construct + thread the dependency through
   `feegle-app.ts`. The plug-in registries (`buildXRegistry`) help, but the app
   still knows every module by name and every dependency by position.

The platform adapter is also hardcoded: `FeegleApp` knows Feishu by name —
`FeishuCommandResponder`, `FeishuChatHandler`, `FeishuUserDirectory`, the three
workbench services, and `runtimeFactory` are all wired inline in `start()`.

## Goal

Make a **feature** the unit of organization and extension. Adding a feature
(including a whole platform adapter) means writing one plugin and adding it to a
list — without editing the core boot code or any shared dependency type.

Concretely, four outcomes:

- **Readable boot** — the 180-line method becomes a short pipeline of named,
  focused phases.
- **Observability** — per-phase timing and status, logged on every boot.
- **Fewer files per feature** — a feature lives in one directory and registers
  itself; the core is untouched.
- **Clean failure** — any phase failure aborts the boot with a clear, specific
  error naming the phase. (No silent degradation — see Non-Goals.)

## Non-Goals

- **No silent degradation / no `optional` plugins.** The superseded draft had
  non-critical modules skip on failure while boot continued. Investigation shows
  **no module fails at registration today** — `new GitLabClient(token ?? "")`
  accepts an empty token and never throws at boot; kinds/clients/commands
  register synchronously without failable I/O. Token/network failures surface at
  task-run time through the existing scheduler failure-notification path
  (`failureTarget`). A boot-time degrade mechanism would have no consumer, so it
  is not built. If a future plugin genuinely does failable boot-time I/O that
  should degrade, add the mechanism then, with a real consumer.
- **No cross-platform-neutral abstraction of the responder.** Feishu becomes a
  plugin that owns its own (Feishu-specific) wiring. We do **not** abstract
  `FeishuCommandResponder` / `FeishuChatHandler` into platform-neutral
  interfaces — that would be abstraction-from-one-example. A second platform
  becomes possible by writing its own plugin, not by pre-building neutral
  contracts now.
- **No third-party / dynamically-loaded plugins.** All plugins are first-party
  TypeScript, statically composed into a list, compiled together. No manifest
  files, no runtime discovery, no sandboxing, no version negotiation.
- **No DI container.** Boot is linear; a dependency-graph solver is overkill.

## Core Concepts

The design has exactly three kinds of things:

| Concept | What it is | Who owns it |
|---|---|---|
| **Capability** | A typed service/value the rest of the system consumes (`configStore`, `stockStore`, `notify`, `quote`, `userDirectory`, `slashCommands`, …). Becomes available at some point during boot. | Provided by boot phases and by plugins. |
| **Extension point** | A registry that plugins contribute instances into (handler kinds, slash commands, quote clients, notification adapters, platform runtimes). | Owned by the host; built during a phase. |
| **Plugin** | A feature. Declares the capabilities it needs (typed), contributes to extension points, and optionally provides capabilities. | First-party, listed statically. |

A plugin author thinks in terms of "what my feature contributes" and "what
capabilities it needs." They do **not** think about phases — the host pulls each
contribution at the phase its extension point is built.

## Typed Capability Context

A single central interface catalogs every capability and its type. It grows
**only** when a genuinely new service is introduced — a rare, core-level change.

```ts
interface Capabilities {
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
  // commands
  repositories: InMemoryRepositoryRegistry;
  userDirectory: FeishuUserDirectory;   // provided by the Feishu plugin (see below)
  slashCommands: SlashCommandRegistry;
}
```

The context is a typed accumulator. `provide` registers a capability; `require`
fetches one (throwing at the boundary if not yet provided — a programmer error,
caught immediately in dev); `pick` returns a typed slice.

```ts
class BootContext {
  private readonly caps = new Map<keyof Capabilities, unknown>();

  provide<K extends keyof Capabilities>(key: K, value: Capabilities[K]): void {
    if (this.caps.has(key)) throw new Error(`capability already provided: ${key}`);
    this.caps.set(key, value);
  }
  require<K extends keyof Capabilities>(key: K): Capabilities[K] {
    const value = this.caps.get(key);
    if (value === undefined) throw new Error(`capability not ready: ${key}`);
    return value as Capabilities[K];
  }
  pick<K extends keyof Capabilities>(...keys: K[]): Pick<Capabilities, K> {
    return Object.fromEntries(keys.map((k) => [k, this.require(k)])) as Pick<Capabilities, K>;
  }
}

// Read-only view handed to module/plugin code.
type CapabilityContext = Pick<BootContext, "require" | "pick">;
```

`keyof Capabilities` means a mistyped key is a **compile error** and `pick`
returns the correct types. A new kind that needs `quote` + `stockStore` does
`ctx.pick("quote", "stockStore")` — fully typed, with **no edit to any central
type**, because those keys already exist.

## Module Interface Change: Context Instead of a Deps Bag

Investigation of the four existing module interfaces refined this:

- **`HandlerKindModule`** carries the acute pain — a fat `HandlerKindRegistryDeps`
  bag that every new kind widens, plus per-dependency threading in
  `feegle-app.ts`. **Its `register` signature changes to take the capability
  context.**
- **`SlashCommandModule`** keeps its typed `SlashCommandRegistryDeps` bag, but
  that bag is **constructed once from `ctx` in the commands phase** instead of in
  `feegle-app.ts`. Migrating eight stable command modules to `ctx` for uniformity
  would be churn with real risk for marginal benefit (adding a command usually
  reuses existing deps); the threading pain is removed without touching them.
- **`QuoteClientModule`** takes no deps (`register(registry)`) — nothing to
  change.
- **`NotificationAdapterModule`** needs only `feishuClient` (Feishu-specific, not
  a capability) — unchanged; it becomes a Feishu-plugin contribution.

So only `HandlerKindModule` changes signature:

```ts
// Before
interface HandlerKindModule {
  id: string;
  register(registry: HandlerKindRegistry, deps: HandlerKindRegistryDeps): void;
}

// After
interface HandlerKindModule {
  id: string;
  register(registry: HandlerKindRegistry, ctx: CapabilityContext): void;
}
```

A module pulls exactly what it needs:

```ts
register(registry, ctx) {
  const { quote, stockStore } = ctx.pick("quote", "stockStore");
  registry.register(new StockMonitorKind({ quote, stockStore }));
}
```

This deletes the two friction points: the shared `HandlerKindRegistryDeps` /
`SlashCommandRegistryDeps` bags no longer need widening, and `feegle-app.ts` no
longer constructs and threads each dependency. The flat-bag deps types are
removed.

## Plugin Interface

A plugin groups a feature's contributions. Most plugins are plain data — a list
of the modules they contribute. The `provides` hook is an escape hatch for
plugins that supply capabilities (used by the platform plugin); ordinary feature
plugins never use it and never name a phase.

```ts
interface FeeglePlugin {
  readonly id: string;
  readonly dependsOn?: readonly string[];   // other plugin ids; rare, for ordering

  // contributions to extension points — pulled when each point is built
  readonly handlerKinds?: readonly HandlerKindModule[];
  readonly slashCommands?: readonly SlashCommandModule[];
  readonly quoteClients?: readonly QuoteClientModule[];
  readonly notificationAdapters?: readonly NotificationAdapterModule[];
  readonly platformRuntimes?: readonly PlatformRuntimeModule[];

  // capability provisioning — escape hatch, mainly for the platform plugin
  readonly provides?: readonly PluginProvision[];
}

interface PluginProvision {
  readonly phase: BootPhaseName;            // when to run (e.g. "providers")
  run(ctx: BootContext): void | Promise<void>;
}
```

A feature plugin — all stock concerns in one place:

```ts
// plugins/stock/stock-plugin.ts
export const stockPlugin: FeeglePlugin = {
  id: "stock",
  quoteClients: [tencentQuoteClientModule],
  handlerKinds: [
    stockMonitorKindModule,
    stockPortfolioSnapshotKindModule,
    stockAdvisorKindModule,
  ],
  slashCommands: [stockCommandModule],
};
```

## New Extension Point: Platform Runtimes

A platform adapter contributes a `PlatformRuntimeModule` — a factory that, given
the capability context, builds and returns a `Startable` runtime. The runtime
phase starts every registered platform runtime.

```ts
interface PlatformRuntimeModule {
  readonly id: string;
  create(ctx: CapabilityContext): Startable;
}
```

This is the only genuinely new extension point. It is justified by a stated need
("接平台 = 接插件"), so reserving it now is intentional, not speculative.

## Feishu as a Plugin

Feishu stops being hardcoded in `FeegleApp`. It becomes a plugin constructed from
its Feishu-specific deps (which remain injectable for tests):

```ts
// plugins/feishu/feishu-plugin.ts
export function createFeishuPlugin(deps: {
  feishuClient: FeishuClientPort;
  cloudDoc: FeishuCloudDocClientPort;
  runtimeFactory: (handler: FeishuCommandHandler) => Startable;
  ownerEmails: ReadonlySet<string>;
}): FeeglePlugin {
  return {
    id: "feishu",
    // userDirectory is Feishu-specific but consumed by the neutral command
    // registry, so the plugin provides it before the commands phase runs.
    provides: [
      {
        phase: "providers",
        run: (ctx) => ctx.provide("userDirectory", new FeishuUserDirectory(deps.feishuClient)),
      },
    ],
    // The runtime contribution owns the rest of the Feishu wiring: it builds the
    // chat handler, workbench services, and command responder from capabilities,
    // then returns the long-connection runtime.
    platformRuntimes: [
      {
        id: "feishu-long-connection",
        create: (ctx) => {
          const { slashCommands, configStore, taskRegistry, userDirectory, agents,
                  sessionStore, chatHistory, workspaceStore, chatBindingStore,
                  chatWorkspaceStore, pendingInteractionStore, planArtifactStore } =
            ctx.pick(/* the keys the responder/handler/workbench need */);
          const chatHandler = new FeishuChatHandler({ /* … */ });
          const workbench = new DirectorySetupService({ /* … */ });
          const planArtifacts = new PlanArtifactService({ /* … */ });
          const planExecution = new PlanExecutionService({ /* … */ });
          const responder = new FeishuCommandResponder(deps.feishuClient, {
            registry: slashCommands, chatHandler, configStore, taskRegistry,
            userDirectory, workbench: { /* the same closures as today */ },
          });
          return deps.runtimeFactory(responder);
        },
      },
    ],
  };
}
```

The gnarly responder closures (today `feegle-app.ts:217–268`) move here, isolated
in the Feishu plugin and split to respect the 50-line / 600-line caps. `FeegleApp`
no longer references any Feishu type.

Note: `userDirectory`'s capability type stays `FeishuUserDirectory` — we are not
chasing neutrality. Today `src/platform/slash-command-module.ts` already imports
`FeishuUserDirectory` directly, so this coupling is pre-existing; we relocate it,
we do not deepen it.

## Boot Phases and the Runner

Seven phases provide capabilities and build extension points in order. The phase
names are the only thing `FeegleApp` knows.

| Phase | Provides | Builds extension point |
|---|---|---|
| `infra` | lockfile, `configStore`, `runtimeDb`, 3 runtime-backed stores | — |
| `stores` | 10 persistent stores, `taskRegistry` (+ seed) | — |
| `providers` | `agents`, `gitlab`, `gitlabFollowStore`, `gitService`, `notify`, `quote` | quote clients; notification adapters (consumed when building `notify`); plugin `provides`(`providers`) runs here (→ `userDirectory`) |
| `kinds` | `kinds` | handler kinds |
| `scheduler` | `scheduler` (started) | — |
| `commands` | `repositories`, `slashCommands` | slash commands |
| `runtime` | `runtime` | platform runtimes (built + started) |

Each phase is a small named unit. The runner wraps every phase with timing,
status logging, and **default-fatal** error handling:

```ts
interface BootPhase {
  readonly name: BootPhaseName;
  run(ctx: BootContext): Promise<void>;
}

async function runBoot(phases: readonly BootPhase[], ctx: BootContext): Promise<BootReport> {
  const results: PhaseResult[] = [];
  for (const phase of phases) {
    const startedAt = performance.now();
    try {
      await phase.run(ctx);
      const durationMs = Math.round(performance.now() - startedAt);
      results.push({ phase: phase.name, status: "ok", durationMs });
      console.log(`[boot] ${phase.name} ✓ ${durationMs}ms`);
    } catch (error) {
      results.push({ phase: phase.name, status: "failed", error: String(error) });
      console.error(`[boot] ${phase.name} ✗ ${error}`);
      throw new BootAbortError(phase.name, error, results);
    }
  }
  return { phases: results };
}
```

A representative successful boot log:

```
[boot] infra      ✓ 14ms
[boot] stores     ✓ 22ms
[boot] providers  ✓ 9ms
[boot] kinds      ✓ 2ms
[boot] scheduler  ✓ 4ms
[boot] commands   ✓ 6ms
[boot] runtime    ✓ 31ms
[boot] ready in 88ms
```

## How `FeegleApp.start()` Collapses

```ts
async start(): Promise<void> {
  const ctx = new BootContext();
  const plugins = this.deps.plugins ?? defaultPlugins(this.deps);
  const contributions = collectContributions(plugins);          // flatten by extension point
  const phases = buildBootPhases({ deps: this.deps, plugins, contributions });
  this.report = await runBoot(phases, ctx);
  this.runtime = ctx.require("runtime");
}
```

`collectContributions` flattens every plugin's per-point arrays into the existing
module lists, which the phases feed to the existing `buildXRegistry` functions
(now passing `ctx` instead of a deps bag):

```ts
function collectContributions(plugins: readonly FeeglePlugin[]) {
  return {
    handlerKinds:         plugins.flatMap((p) => p.handlerKinds ?? []),
    slashCommands:        plugins.flatMap((p) => p.slashCommands ?? []),
    quoteClients:         plugins.flatMap((p) => p.quoteClients ?? []),
    notificationAdapters: plugins.flatMap((p) => p.notificationAdapters ?? []),
    platformRuntimes:     plugins.flatMap((p) => p.platformRuntimes ?? []),
  };
}
```

The actual wiring lives in focused phase modules (`boot/phases/infra-phase.ts`,
`stores-phase.ts`, …), each small and single-purpose.

## Adding a Feature: Before vs After

Adding a scheduled-task feature "weather":

| | Before | After |
|---|---|---|
| Implement the kind | `scheduler/kinds/weather-kind.ts` | `plugins/weather/weather-kind.ts` |
| Module wrapper | edit shared `HandlerKindRegistryDeps`, add module entry | `plugins/weather/weather-kind-module.ts` (`ctx.pick(...)`) |
| Register the feature | edit `default-handler-kind-modules.ts` | `plugins/weather/weather-plugin.ts` |
| Wire dependencies | construct + thread through `feegle-app.ts` | none — `ctx.pick` |
| Add to system | — | add `weatherPlugin` to the default plugin list |
| **Core files touched** | `handler-kind-module.ts`, `default-handler-kind-modules.ts`, `feegle-app.ts` | **none** |

Only if the feature needs a capability that does not yet exist (e.g. a new
`weatherApiClient`) does the core change — by adding the key to `Capabilities`
and providing it in a phase. That is a genuine new-capability change and is
appropriately core-level.

## Impact Summary

| | Before | After |
|---|---|---|
| `FeegleApp.start()` | ~180-line manual wiring | short pipeline: build phases → `runBoot` |
| Feature organization | scattered across 3+ directories | one plugin = one directory |
| Adding a kind | 3 core files touched | 0 core files touched |
| Dependency wiring | manual, threaded by position | `ctx.pick`, typed, self-served |
| `FeegleApp` knows Feishu? | yes, by name | no |
| New platform adapter | edit `feegle-app.ts` + new files | new plugin file only |
| Boot failure | one long method, unclear locus | per-phase, default-fatal, named in `BootAbortError` |
| Boot observability | none | per-phase timing + status log |
| Type safety | compile-time (flat deps bags) | compile-time (`keyof Capabilities`) |

## Testing Strategy

- **Unit:** `BootContext` (`provide` double-provide throws; `require` missing
  throws; `pick` returns typed slice). The phase runner (records ok/failed
  results; aborts on first failure with `BootAbortError` naming the phase).
  `collectContributions` (flattens plugins per extension point).
- **Per-module:** each migrated module's `register` builds its instance from a
  fake `CapabilityContext` — verifying it pulls the right capabilities, not just
  that it runs.
- **Integration:** boot the full default plugin set against fakes
  (`feishuClient`, etc.); assert the `BootReport` has all seven phases `ok` and
  the runtime started. A deliberately-throwing phase aborts boot and the error
  names that phase.
- Existing scheduler/registry tests continue to pass after the signature change
  (deps bag → `ctx`), proving behavior is preserved.

## Migration Order

1. Introduce `BootContext` + `CapabilityContext` + the phase runner (no behavior
   change yet; `FeegleApp` still calls them in sequence).
2. Extract the seven phases as modules, each providing its capabilities.
3. Change `HandlerKindModule.register` to take `ctx`; migrate the six kind
   modules to `ctx.pick`; delete `HandlerKindRegistryDeps`. Construct the slash
   command deps bag from `ctx` in the commands phase (slash modules unchanged).
4. Introduce `FeeglePlugin` + `collectContributions`; regroup existing default
   modules into feature plugins.
5. Introduce the `PlatformRuntimeModule` extension point; extract
   `createFeishuPlugin` and move the responder/chat-handler/workbench wiring into
   it; remove Feishu construction (and Feishu imports) from `FeegleApp`.
6. Final `FeegleApp.start()` collapse + boot report wiring.
```
