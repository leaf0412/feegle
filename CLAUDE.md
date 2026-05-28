# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Feegle — a phase-one agent gateway with a Feishu long-connection adapter. Receives Feishu messages/card callbacks, parses them into slash commands or natural-language chat (routed to a local Agent CLI), and runs cron-based scheduled tasks (heartbeat, stock monitoring, agent prompts).

## Security: Sensitive Files

**.env and .env.* files contain secrets. When reading them, only output the variable names/keys — never output values. Mask all values as `****`.** If you need to know what environment variables the project uses, prefer looking at the source code (e.g. `src/feishu/feishu-entry-config.ts` or `src/boot/phases/providers-phase.ts`).

IMPORTANT: When dispatching subagents (`task` tool), the redact-output hook may not fire on subagent tool outputs. Ensure subagent prompts explicitly instruct them to mask or not return secret values, and verify subagent results for leaked tokens before surfacing them.

**Subagent instruction template**: When asking a subagent to inspect `.env` files or any config that may contain secrets, always append:
> If you read `.env` or any file containing secrets, only return the **keys/variable names** — never return their values. Mask any token/password/key you encounter as `****`.

## Commands

```bash
npm test                          # all tests (vitest)
npx vitest run tests/<path>       # single test file
npm run typecheck                 # tsc --noEmit
npm run build                     # tsc compile → dist/
npm run start:feishu              # build + start long-connection adapter
```

## Architecture

**Platform abstraction layer** (`src/platform/`): shared contracts for cards, actions, messages, sessions, and progress. Feishu (`src/feishu/`) is the current adapter implementing these contracts. Future adapters (e.g. WeChat Work) should implement the same platform interfaces.

**Module plug-in system**: four extension points, all following the pattern `build<X>Registry({ modules })` → boot → `freeze()`:

| Extension point | Default modules | Inject via `FeegleAppDeps` |
|---|---|---|
| Slash commands | `platform/commands/default-slash-command-modules.ts` | `slashCommandModules` |
| Handler kinds (cron) | `scheduler/default-handler-kind-modules.ts` | `handlerKindModules` |
| Quote clients | `stock/default-quote-client-modules.ts` | `quoteClientModules` |
| Notification adapters | `app/build-notification-broker.ts` | `notificationAdapterModules` |

**Boot sequence** (`FeegleApp.start`): lockfile → config store → runtime DB (SQLite via better-sqlite3 at `~/.feegle/feegle.db`) → load all stores → build registries → start scheduler → build slash command registry → wire `FeishuCommandResponder` → start Feishu long-connection runtime.

**FeishuCommandResponder** (`src/feishu/feishu-command-responder.ts`): central dispatcher. Routes slash commands through `SlashCommandRegistry`, natural-language text through `FeishuChatHandler`, and workbench card actions to `DirectorySetupService` / `PlanArtifactService` / `PlanExecutionService`.

**Scheduler** (`src/scheduler/`): cron-based task system. Each task has a `kind` that maps to a `HandlerKind`. Kinds live in `scheduler/kinds/`. Task persistence is via `TaskStore` → `task-store.json`.

**Workbench** (`src/workbench/`): three services — `DirectorySetupService` (chat → workspace directory binding), `PlanArtifactService` (markdown plans + Feishu cloud doc creation), `PlanExecutionService` (approve → git clone → branch → agent-driven implementation → push).

**Agent CLI abstraction** (`src/agent/`): feegle is an [ACP](https://agentclientprotocol.com) client. Every provider record routes through a single `AcpAgentAdapter` that spawns the configured `command` and speaks JSON-RPC over stdio via `@agentclientprotocol/sdk`'s `ClientSideConnection`. `kind` is a free-form user label; there is no hardcoded per-CLI adapter. Any ACP-compliant agent (claude-agent-acp, codex-acp, gemini, qwen, kimi, claude-agent-acp-with-env for cc-deepseek-style forks) plugs in via `~/.feegle/config.jsonc` alone. ACP `session/update` notifications translate 1:1 onto feegle's `AgentProgressUpdate` (agent_message_chunk → final answer text, agent_thought_chunk → thinking, tool_call → tool_use, tool_call_update → tool_result); session resume goes through ACP's `loadSession` when the agent advertises that capability.

## Key Conventions

- **FEATURE_MAP.md** is the cross-reference for finding all files belonging to a feature (kind + command + schema spread across directories). Read it before tracing a feature.
- **ADR 0001** established the `build<X>Registry({ modules })` + `freeze()` pattern all registries follow.
- **Slash command definitions** use `defineSlashCommand()` from `platform/slash-command-catalog.ts`. Each command group is a module (e.g. `cron-command-module.ts`).
- **Handler kinds** implement the `HandlerKind` interface (`scheduler/handler-kind.ts`).
- No feature-cohesive organization yet — kinds and commands for the same feature live in different directories (see FEATURE_MAP.md review notes for the rationale).
