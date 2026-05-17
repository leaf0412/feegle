# Feegle

Feegle is a phase-one Feishu agent gateway. It currently provides the local domain workflow, Git/repository helpers, offline prototype generation primitives, an Agent CLI abstraction, and a Feishu long-connection adapter.

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
export FEEGLE_AGENT_COMMAND="codex"
export FEEGLE_AGENT_CWD="/path/to/workspace"
export FEEGLE_AGENT_SANDBOX="workspace-write"
export FEEGLE_AGENT_APPROVAL_POLICY="never"
export FEEGLE_AGENT_TIMEOUT_MS="300000"
```

Do not commit real secrets. Keep them in your shell, local process manager, or a local `.env` file that is not committed.

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

By default, the agent command is:

```bash
codex --ask-for-approval never exec --cd "$FEEGLE_AGENT_CWD" --sandbox workspace-write --output-last-message /tmp/feegle-last-message.txt -
```

Example command:

```text
/repo select web api
```

Expected behavior: the bot replies in Feishu that it received the selected repositories.

```json
{"source":"message","chatId":"oc_xxx","messageId":"om_xxx","command":{"type":"repo_select","repositoryIds":["web","api"]}}
```

If a Feishu interactive card sends this value:

```json
{"action":"push_repository","requirementId":"req_1","repositoryId":"web"}
```

the adapter parses it into:

```json
{"type":"push_repository","requirementId":"req_1","repositoryId":"web"}
```

## Current Feishu Conversation Model

The project includes Feishu card builders inspired by CC-Connect:

- Shared update cards use `update_multi: true`
- Workflow progress cards can be patched in place
- Requirement status cards can show multiple repositories
- Push buttons are scoped per repository and emit parseable action values

The OpenAPI client supports:

- `sendText(chatId, text)`
- `sendInteractiveCard(chatId, card)`
- `updateInteractiveCard(messageId, card)`

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
- `src/feishu` - Feishu command parsing, long connection runtime, OpenAPI client, and card builders
- `tests` - Vitest coverage for the current boundaries
