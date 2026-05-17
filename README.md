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
export FEISHU_BOT_OPEN_ID="ou_xxx"
export FEISHU_ENABLE_INTERACTIVE_CARDS="true"
export FEISHU_ALLOW_FROM="*"
export FEISHU_ALLOW_CHAT="*"
export FEISHU_GROUP_ONLY="false"
export FEISHU_GROUP_REPLY_ALL="false"
export FEISHU_SHARE_SESSION_IN_CHANNEL="false"
export FEISHU_THREAD_ISOLATION="false"
export FEISHU_REPLY_TO_TRIGGER="true"
export FEISHU_PROGRESS_STYLE="legacy"
export FEISHU_REACTION_EMOJI="OnIt"
export FEISHU_DONE_EMOJI="none"
export FEEGLE_AGENT_KIND="codex"
export FEEGLE_AGENT_COMMAND="codex"
export FEEGLE_AGENT_CWD="/path/to/workspace"
export FEEGLE_AGENT_SANDBOX="workspace-write"
export FEEGLE_AGENT_APPROVAL_POLICY="never"
export FEEGLE_AGENT_TIMEOUT_MS="300000"
```

Do not commit real secrets. Keep them in your shell, local process manager, or a local `.env` file that is not committed.

Feishu routing options:

- `FEISHU_ALLOW_FROM` and `FEISHU_ALLOW_CHAT` accept `*` or comma-separated open ids/chat ids.
- `FEISHU_GROUP_ONLY=true` ignores p2p messages.
- Group messages are still forwarded to handlers for recording, but the bot only responds when the message mentions the bot open id configured by `FEISHU_BOT_OPEN_ID`.
- `FEISHU_GROUP_REPLY_ALL` is kept for compatibility with older deployments, but group replies still require a bot mention.
- `FEISHU_SHARE_SESSION_IN_CHANNEL=true` uses one shared session key per group chat.
- `FEISHU_THREAD_ISOLATION=true` isolates sessions by root/thread message id.
- `FEISHU_PROGRESS_STYLE` accepts `legacy`, `compact`, or `card`.
- Set `FEISHU_REACTION_EMOJI=none` or `FEISHU_DONE_EMOJI=none` to disable those emoji hooks when a caller wires them in.

## Run The Feishu Adapter

Build first:

```bash
npm run build
```

Start the long-connection process:

```bash
npm run start:feishu
```

When the connection is active, send a message in the Feishu group. Deterministic commands are handled by code. Natural-language requirement messages are sent to the configured Agent CLI, and the agent result is sent back to the same Feishu chat.

By default, `FEEGLE_AGENT_KIND` is `codex`, and the agent command is:

```bash
codex exec --cd "$FEEGLE_AGENT_CWD" --sandbox workspace-write --output-last-message /tmp/feegle-last-message.txt -
```

To send natural-language messages to Claude Code instead:

```bash
export FEEGLE_AGENT_KIND="claude_code"
export FEEGLE_AGENT_COMMAND="claude"
```

The Claude Code runner uses headless stream JSON mode:

```bash
claude -p --output-format stream-json --input-format stream-json --verbose
```

If an agent creates a local file that should be sent back to Feishu, it should include one marker line per file in its final response:

```text
feegle:file:/absolute/path/to/file.zip
```

Feegle removes those marker lines from the text reply, uploads each existing local file to Feishu, and sends it to the same chat as a file message.

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

The project includes platform-neutral cards rendered by the Feishu adapter:

- Shared update cards use `update_multi: true`
- Workflow progress snapshots can be rendered as Feishu cards and patched in place
- Requirement status cards can show multiple repositories
- Review buttons emit shared `act:/prototype approve ...`, `act:/plan confirm ...`, and `act:/requirement cancel ...` values
- Push buttons are scoped per repository and emit `act:/push repo <repositoryId>` values

The OpenAPI client supports:

- `sendText(chatId, text)`
- `sendInteractiveCard(chatId, card)`
- `sendFile(chatId, filePath)`
- `updateInteractiveCard(messageId, card)`
- `updateProgress(messageId, progressSnapshot)`

Shared contracts live under `src/platform`. Feishu-specific event shapes, card rendering, OpenAPI calls, and long-connection runtime code live under `src/feishu`. Future adapters such as enterprise WeChat should implement their own renderer/client/runtime while reusing the platform card, action, message, session, and progress contracts.

## What Is Not Wired Yet

The runnable Feishu entrypoint does not yet execute the full product workflow. It does not yet:

- Persist a Feishu group to repository bindings
- Clone repositories from a received Feishu command
- Create branches from suggested branch names
- Generate and upload prototype zip files to Feishu
- Drive the full TDD development workflow through the Agent CLI
- Push Git branches when the Feishu card button is clicked
- Report CI/browser verification back into Feishu

Those pieces exist as separate domain/service boundaries or planned workflow steps. The Feishu entrypoint currently sends natural-language requirements to the Agent CLI for planning, but it does not yet persist and advance the full multi-step workflow.

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
