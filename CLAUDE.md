# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Feegle is heading from a Feishu agent gateway toward a **workspace-first agent automation platform**: a plugin-driven, observable, recoverable workflow runtime that turns external triggers (Feishu, cron, GitLab, CLI, webhook) into durable workflow progress.

Two layers coexist in the tree today, and the distinction matters for every change:

- **Live path (shipping):** Feishu long-connection adapter → `FeishuCommandResponder` → slash commands / natural-language chat (routed to an ACP agent) / workbench card actions, plus cron-scheduled tasks (heartbeat, stock monitoring, agent prompts, gitlab-follow). This is what actually runs.
- **Runtime scaffolding (in progress):** the `runtime` / `ingress` / `control` / `effect` / `recovery` / `memory` / `diagnostics` / `artifacts` modules implement the target framework from `_docs/specs/2026-05-30-agent-automation-platform-architecture-design.md`. They are assembled phase-by-phase, unit-tested, and partly wired at boot — but **not yet on the live request path** (see "Runtime layer status" below). Do not assume a TriggerEvent flows through the runtime in production.

## Security: Sensitive Files

**.env and .env.* files contain secrets. When reading them, only output the variable names/keys — never output values. Mask all values as `****`.** If you need to know what environment variables the project uses, prefer looking at the source code (e.g. `src/app/config-store.ts` or `src/boot/phases/providers-phase.ts`).

IMPORTANT: When dispatching subagents (`task` tool), the redact-output hook may not fire on subagent tool outputs. Ensure subagent prompts explicitly instruct them to mask or not return secret values, and verify subagent results for leaked tokens before surfacing them.

**Subagent instruction template**: When asking a subagent to inspect `.env` files or any config that may contain secrets, always append:
> If you read `.env` or any file containing secrets, only return the **keys/variable names** — never return their values. Mask any token/password/key you encounter as `****`.

## Commands

```bash
npm test                          # all tests (vitest, --passWithNoTests)
npx vitest run tests/<path>       # single test file
npm run typecheck                 # tsc --noEmit
npm run build                     # tsc compile → dist/
npm run start:feishu              # build + start long-connection adapter
                                  #   (dist/src/feishu/feishu-long-connection-entry.js)
```

## Architecture

**Platform abstraction layer** (`src/platform/`): shared contracts for cards, actions, messages, sessions, progress, slash commands. Feishu (`src/feishu/`) is the current adapter; future adapters (e.g. WeChat Work) implement the same interfaces.

**Plugin model** (`src/boot/feegle-plugin.ts`, `src/plugins/`): a `FeeglePlugin` is a boot-time contribution collector — an `id`, optional `dependsOn`, and contribution arrays. `collectContributions()` flattens every plugin's arrays into one `Contributions` bundle the boot phases consume. Contribution fields:

| Field | Wired into |
|---|---|
| `handlerKinds` | `HandlerKindRegistry` (cron task kinds) |
| `slashCommands` | `SlashCommandRegistry` |
| `quoteClients` | `QuoteClientRegistry` (stock data sources) |
| `notificationAdapters` | `NotificationBroker` (outbound channels) |
| `platformRuntimes` | long-running platform adapters (`Startable`) |
| `runtimeContributions` | runtime registries (workflows / intent resolvers / selectors / effect handlers) |
| `provides` | escape hatch: run boot work at a chosen phase to `ctx.provide(...)` a capability |

Four plugins ship by default (`src/boot/default-plugins.ts`): **core** (heartbeat + agentPrompt kinds, all default slash commands), **stock** (quote clients + stockMonitor/stockAdvisor/stockPortfolioSnapshot kinds), **gitlab-follow** (gitlabFollow kind), **feishu** (feishu-long-connection platform runtime + a `FeishuUserDirectory` provision + a runtime contribution).

**Boot sequence** (`src/boot/build-boot-phases.ts`, run by `run-boot.ts`): an 8-phase linear pipeline over a typed capability accumulator (`BootContext`: `provide` / `require` / `pick`). Phase order is implicit (no dependency graph):

1. **infra** — lockfile, `ConfigStore`, open SQLite DB (`~/.feegle/feegle.db`, WAL), `PlanArtifactStore`
2. **stores** — instantiate all stores (sessions, chat history, tasks, repositories, dedup, runs-log, **runtime store**, **workflow registry**, **intent resolvers**, **workflow selector**, **effect handler registry**, …) and one-shot-migrate legacy JSON into SQLite
3. **providers** — `AgentProviderRegistry`, `GitLabClient`, `GitLabFollowStore`, `GitService`, `NotificationBroker`, `QuoteClient`; run plugin `provides` for this phase
4. **kinds** — build `HandlerKindRegistry` from contributions
5. **scheduler** — instantiate + start `TaskScheduler` (note: `runtimeObserver: undefined` — observer not yet wired)
6. **commands** — `InMemoryRepositoryRegistry`, build `SlashCommandRegistry`
7. **runtime-contributions** — call each `runtimeContributions[].register(ctx)` to populate the runtime registries
8. **runtime** — `runtimeStore.markRunningAttemptsInterrupted()`, then `create()` + `start()` each platform runtime (throws if none); the Feishu runtime is `primary`

**FeishuCommandResponder** (`src/feishu/feishu-command-responder.ts`): the live central dispatcher. Routes slash commands through `SlashCommandRegistry`, natural-language text through `FeishuChatHandler` (resolves active ACP provider → opens preview card → streams agent progress → finalizes), and workbench card actions to `DirectorySetupService` / `PlanArtifactService` / `PlanExecutionService`.

**Requirement domain** (`src/domain/`, `src/requirements/`): `RequirementContext` (chat-scoped work unit) + `RequirementRepository` / `AgentRun` / `RequirementCommit`, driven by a strict 15-state machine in `domain/status.ts` (`created → repo_selected → requirement_received → branch_suggested → branch_created → requirement_materialized → prototype_generated → prototype_reviewing → plan_generated → plan_confirmed → dev_running → committed → push_ready → pushed → closed`; any state → `closed`; `assertTransition()` guards). `RequirementService` orchestrates this **in-memory** (not persisted). In the architecture spec this quartet is the *seed* of the target WorkflowInstance / RunAttempt / StepState / Artifact model.

**Workbench** (`src/workbench/`): `DirectorySetupService` (chat → workspace directory binding), `PlanArtifactService` (markdown plans + Feishu cloud doc, multi-version in `plan_artifacts`), `PlanExecutionService` (approve → git worktree → agent-driven iteration → commit → push, with progress cards).

**Scheduler** (`src/scheduler/`): cron task system. Each `tasks`-row has a `kind` mapping to a `HandlerKind` (`handler-kind.ts`); kinds live in `scheduler/kinds/` (heartbeat, agent-prompt, stock-monitor, stock-advisor, stock-portfolio-snapshot, gitlab-follow). Outcomes append to `RunsLog` (`~/.feegle/runs.log.jsonl`). Daily dedup via `dedup_keys`. Repeated-failure escalation lives in the scheduler (`UndeliveredFailureCounter`, failure/recovery cards).

**Agent CLI abstraction** (`src/agent/`): feegle is an [ACP](https://agentclientprotocol.com) client. Every provider record routes through a single `AcpAgentAdapter` that spawns the configured `command` and speaks JSON-RPC over stdio via `@agentclientprotocol/sdk`'s `ClientSideConnection`. `kind` is a free-form user label; there is no hardcoded per-CLI adapter. Providers come **solely** from the `agent` section of `~/.feegle/config.jsonc` (via `ProviderStore` over `ConfigStore`; no `providers.json`). There is no default provider — `AgentProviderRegistry` fails fast if none is active. ACP `session/update` notifications translate 1:1 onto feegle's `AgentProgressUpdate` (agent_message_chunk → final answer, agent_thought_chunk → thinking, tool_call → tool_use, tool_call_update → tool_result); session resume goes through ACP's `loadSession` when advertised.

### Runtime layer status (read before touching `runtime`/`ingress`/`control`/`recovery`/`memory`)

The target framework is specced in `_docs/specs/2026-05-30-agent-automation-platform-architecture-design.md`; domain terms are in `CONTEXT.md`. What is built **today**:

- **Ingress** (`src/ingress/`): `TriggerEvent` → `IntentResolverRegistry` → `WorkflowSelector` → `WorkflowRuntime`, via `IngressDispatcher`. The structure is complete, **but `IngressDispatcher` is never constructed in the live boot path** — only in tests. Feishu/scheduler adapters that would feed it (`feishu-trigger-event-adapter`, `scheduler-runtime-observer`) exist but are not attached.
- **Runtime** (`src/runtime/`): `WorkflowRuntime.start()` runs a **linear, synchronous** step sequence and persists `RunAttempt` / `StepState` / `EffectExecution` / `RuntimeEvent` through `RuntimeStore` (SQLite). `markRunningAttemptsInterrupted()` *is* called at boot. No concurrency control, no resume-from-`waiting`, no live effect execution yet.
- **Effects** (`src/runtime/effect-executor.ts`, `effect-handler-registry.ts`): registry keyed by `pluginId:effectType` — **no handlers registered yet**.
- **Control / Recovery / Memory / Artifacts / Diagnostics**: persistence stores and bundle/record shapes exist (`control_actions`, `memory_records`, `artifact_records`, `DiagnosticBundle`) but are **write-only / not yet driven** — no approval workflow, no recovery loop, no retrieval.

When extending this layer, treat the spec as the destination and the current code as scaffolding — wire the next slice, don't assume prior slices are live.

## Key Conventions

- **`_docs/specs/2026-05-30-agent-automation-platform-architecture-design.md`** is the target architecture (with an honest `host`/`seed`/`shadow` mapping from current code). **`CONTEXT.md`** is the domain glossary (Workspace, Project, Conversation, WorkflowInstance, RunAttempt, StepState, RuntimeEvent, MemoryRecord). Read both before working on the runtime layer. (Note: `FEATURE_MAP.md` was removed and is no longer the cross-reference.)
- **ADR 0001** established the `build<X>Registry({ modules })` + `freeze()` pattern the slash/kind/quote/notification registries follow.
- **Slash command definitions** use `defineSlashCommand()` from `platform/slash-command-catalog.ts`; each command group is a `SlashCommandModule` (`src/platform/commands/`).
- **Handler kinds** implement the `HandlerKind` interface (`scheduler/handler-kind.ts`).
- **"Workspace" is overloaded**: `src/workspace/workspace-manager.ts` (`WorkspaceManager`) is only a filesystem **path helper** (`requirementRoot` / `repositoryWorkingCopy` / `artifactPath`); it is **not** the target ownership-boundary Workspace from the spec/CONTEXT.md. Don't conflate them.
- **Boot extension** goes through a plugin contribution, not direct wiring — add to a plugin's contribution arrays or write a `provides` provision; let the phases consume it.
