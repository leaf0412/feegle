# Feegle

Feegle is a phase-one agent gateway. It currently provides the local domain workflow, Git/repository helpers, offline prototype generation primitives, an Agent CLI abstraction, shared platform contracts, and a Feishu long-connection adapter.

The current runnable entrypoint is the Feishu long-connection adapter. It can receive Feishu text messages and interactive card callbacks, parse them into internal commands, and print the parsed command envelope. The full product workflow orchestration is intentionally not wired into the entrypoint yet.

## Requirements

- Node.js 22 or newer
- npm
- A Feishu custom app with bot capability enabled
- The bot added to the target Feishu group

## Install

```bash
npm install
```

## Verify Locally

```bash
npm test
npm run typecheck
npm run build
```

## Feishu App Configuration

In the Feishu developer console, configure the app for long connection mode.

Required app capabilities:

- Bot capability enabled
- Event subscription enabled
- Long connection enabled

Subscribe to these events:

- `im.message.receive_v1`
- `card.action.trigger`

The first event lets the bot receive group text commands. The second event lets the bot receive interactive card button clicks, such as the future per-repository push button.

Add the bot to the Feishu group before testing. For group messages, make sure the app has the required message receive permission for your tenant configuration.

## Environment Variables

Set these values in your shell before starting the Feishu adapter:

```bash
export FEISHU_APP_ID="cli_xxx"
export FEISHU_APP_SECRET="xxx"
```

Optional values:

```bash
export FEISHU_VERIFICATION_TOKEN="xxx"
export FEISHU_ENCRYPT_KEY="xxx"
export FEISHU_ENABLE_INTERACTIVE_CARDS="true"
export FEISHU_ALLOW_FROM="*"
export FEISHU_ALLOW_CHAT="*"
export FEISHU_GROUP_ONLY="false"
export FEISHU_GROUP_REPLY_ALL="false"
export FEISHU_SHARE_SESSION_IN_CHANNEL="false"
export FEISHU_THREAD_ISOLATION="false"
export FEISHU_REPLY_TO_TRIGGER="true"
export FEISHU_PROGRESS_STYLE="legacy"
export FEEGLE_HOME="$HOME/.feegle"
export FEEGLE_OWNER_EMAILS="alice@example.com"
```

Do not commit real secrets. Keep them in your shell, local process manager, or a local `.env` file that is not committed.

Feishu routing options:

- `FEISHU_ALLOW_FROM` and `FEISHU_ALLOW_CHAT` accept `*` or comma-separated open ids/chat ids.
- `FEISHU_GROUP_ONLY=true` ignores p2p messages.
- Group messages are still forwarded to handlers for recording, but the bot only responds when the message mentions the bot identity resolved from `FEISHU_APP_ID` and `FEISHU_APP_SECRET`.
- `FEISHU_GROUP_REPLY_ALL` is kept for compatibility with older deployments, but group replies still require a bot mention.
- `FEISHU_SHARE_SESSION_IN_CHANNEL=true` uses one shared session key per group chat.
- `FEISHU_THREAD_ISOLATION=true` isolates sessions by root/thread message id.
- `FEISHU_PROGRESS_STYLE` accepts `legacy`, `compact`, or `card`.
- `FEEGLE_HOME` overrides the scheduler persistence directory; default is `~/.feegle`.
- `FEEGLE_OWNER_EMAILS` is required for cron/stock commands. Values are comma-separated emails (e.g. `alice@example.com,bob@example.com`). At dispatch time the bot resolves the sender's email via the Feishu contact API and matches against this set — make sure the app has `contact:user.email` scope and that owner emails are filled in the Feishu directory.

## Local Agent Workbench Configuration

Feegle reads operator config from `~/.feegle/config.jsonc` first. If that file does not exist, it falls back to `~/.feegle/config.json`. JSONC supports comments and trailing commas, which makes local agent setup easier to maintain.

Example:

```jsonc
{
  "schemaVersion": 1,
  "failureTarget": null,
  "agent": {
    "default": "codex",
    "providers": {
      "codex": {
        "command": "codex",
        "sandbox": "workspace-write",
        "approvalPolicy": "on-request"
      },
      "claude": {
        "command": "claude",
        "sandbox": "workspace-write"
      }
    }
  },
  "workspaces": {
    "feegle": "/Users/yb/Desktop/code/personal/feegle"
  }
}
```

`agent.default` selects the provider activated at startup. `agent.providers` defines local CLI providers such as Codex, Claude, or another compatible command. `workspaces` is only a set of shortcuts shown in Feishu cards; it is not a whitelist. A user can still type a directory manually in the group setup card.

The legacy `/provider register` and `/provider use` commands still work when no `agent` config is present.

## Scheduler And Stock Commands

Feegle persists scheduler state under `~/.feegle` unless `FEEGLE_HOME` is set:

```text
config.json
task-store.json
stock-store.json
dedup.json
runs.log.jsonl
.locks/feegle.lock
```

Bind the failure notification group before enabling tasks:

```text
/error_target set
/error_target show
/error_target clear
```

Owner-only scheduler commands:

```text
/cron list
/cron show <id>
/cron add <kind> <cron> [k=v...]
/cron edit <id> [k=v...]
/cron remove <id>
/cron pause <id>
/cron resume <id>
/cron run-now <id> [--force]
/cron set-target <id> [chatId]
/cron history <id> [--last N]
```

Stock commands:

```text
/bind_stocks <codes>
/unbind_stocks <codes>
/stocks [codes]
/portfolio set <code> cost=<price> shares=<n> [stopLoss=<price>]
/portfolio list
/portfolio clear <code>
/portfolio unset <code> <stopLoss|thresholds>
```

Owner-only agent provider commands:

```text
/provider list
/provider register <kind> cwd=<path> [command=<cli>] [sandbox=read-only|workspace-write|danger-full-access] [approvalPolicy=untrusted|on-request|never] [timeoutMs=<ms>]
/provider unregister <kind>
/provider use <kind>
```

`<kind>` 取值：`codex` 或 `claude_code`。第一次启用流程：

```text
/provider register codex cwd=/Users/yb/work
/provider use codex
```

之后即可对 bot 发自然语言对话。`/provider register` 默认不激活，必须显式 `use`。要改字段（例如换 cwd），先 `unregister` 再 `register`。

Live quote smoke test is opt-in:

```bash
RUN_LIVE_QUOTE_TEST=1 npx vitest run tests/live
```

## Run The Feishu Adapter

Build first:

```bash
npm run build
```

Start the long-connection process:

```bash
npm run start:feishu
```

When the connection is active, send a message in the Feishu group. Deterministic slash commands are handled by code. Non-slash text is treated as ordinary chat and is sent to the active local Agent CLI once the group has a working directory binding. Unknown slash commands are acknowledged with an unknown-command reply.

Example command:

```text
/repo select web api
```

Expected behavior: the bot replies in Feishu that it received the selected repositories.

```json
{"source":"message","chatId":"oc_xxx","messageId":"om_xxx","command":{"type":"repo_select","repositoryIds":["web","api"]}}
```

Feishu interactive cards now prefer platform action values:

```json
{"action":"act:/push repo web","session_key":"feishu:oc_xxx:channel"}
```

The adapter parses that into a shared platform action:

```json
{"type":"platform_action","action":{"kind":"act","command":"/push","args":"repo web","raw":"act:/push repo web"},"sessionKey":"feishu:oc_xxx:channel"}
```

Action prefixes are shared by future platform adapters:

- `nav:/...` renders or navigates to another card state.
- `act:/...` performs a side effect such as push, approve, cancel, or confirm.
- `cmd:/...` re-enters the deterministic command path.

Legacy Feishu card values are still accepted during migration. If a Feishu interactive card sends this value:

```json
{"action":"push_repository","requirementId":"req_1","repositoryId":"web"}
```

the adapter parses it into:

```json
{"type":"push_repository","requirementId":"req_1","repositoryId":"web"}
```

## Current Feishu Conversation Model

The project includes platform-neutral cards rendered by the Feishu adapter, plus Feishu-native workbench cards for forms:

- Shared update cards use `update_multi: true`
- Workflow progress snapshots can be rendered as Feishu cards and patched in place
- Requirement status cards can show multiple repositories
- Review buttons emit shared `act:/prototype approve ...`, `act:/plan confirm ...`, and `act:/requirement cancel ...` values
- Push buttons are scoped per repository and emit `act:/push repo <repositoryId>` values
- Directory setup cards collect an agent provider, a configured workspace shortcut, or a manually typed local path
- Plan review cards link to a Feishu cloud document for the full plan and keep local markdown backups for audit

Group workspace bindings are stored in the local runtime SQLite database under `~/.feegle/feegle.db`. If a group sends natural-language text before a directory is bound, Feegle replies with a directory setup card instead of invoking the agent. After the card is submitted, Feegle validates that the selected or typed path is a readable directory, saves it for that group, and resumes the original message.

Long implementation plans are written under:

```text
~/.feegle/artifacts/plans/<plan_id>/plan-v<N>.md
```

Feegle creates a Feishu cloud document with the same content, stores its `doc_token` and `doc_url` in the runtime SQLite database, and sends a compact confirmation card with an `打开云文档` button. If the user requests changes, the revision form collects multiline feedback, writes a new local version such as `plan-v2.md`, creates a fresh cloud document, and posts a new review card. Earlier local files and cloud-doc links remain available for version history.

This flow requires these Feishu scopes:

- `docx:document:create`, `docx:document.block:convert`, `docx:document:write_only`, `docx:document:readonly` for creating the document and importing markdown blocks.
- `space:document:delete` for future cleanup paths that delete stale generated docs.

The tenant must allow newly created app docs to be organization-visible by default so reviewers can open the doc URL without an extra sharing API call.

The OpenAPI client supports:

- `sendText(chatId, text)`
- `sendInteractiveCard(chatId, card)`
- `sendFile(chatId, filePath)`
- `updateInteractiveCard(messageId, card)`
- `updateProgress(messageId, progressSnapshot)`

Shared contracts live under `src/platform`. Feishu-specific event shapes, card rendering, OpenAPI calls, and long-connection runtime code live under `src/feishu`. Runtime workbench state and artifact services live under `src/workbench`. Future adapters such as enterprise WeChat should implement their own renderer/client/runtime while reusing the platform card, action, message, session, and progress contracts where those abstractions fit.

## What Is Not Wired Yet

The runnable Feishu entrypoint does not yet execute the full product workflow. It does not yet:

- Persist a Feishu group to repository bindings
- Clone repositories from a received Feishu command
- Create branches from suggested branch names
- Generate and upload prototype zip files to Feishu
- Drive the full TDD development workflow through the Agent CLI
- Push Git branches when the Feishu card button is clicked
- Report CI/browser verification back into Feishu

Those pieces exist as separate domain/service boundaries or planned workflow steps. Natural-language chat is wired to the active local Agent CLI, but the full product workflow actions still need explicit slash commands or workbench callbacks before they are wired into the runtime.

## Useful Commands

```bash
npm test
npm run typecheck
npm run build
npm run start:feishu
```

## Project Structure

- `src/domain` - requirement and repository domain models/status transitions
- `src/repositories` - repository registry boundary
- `src/git` - Git workflow service
- `src/workspace` - deterministic local workspace paths
- `src/prototype` - offline Vite prototype source and zip generation
- `src/agent` - Agent CLI abstraction
- `src/platform` - platform-neutral message, session, card, action, and progress contracts
- `src/feishu` - Feishu command parsing, long connection runtime, OpenAPI client, and card renderers
- `tests` - Vitest coverage for the current boundaries
