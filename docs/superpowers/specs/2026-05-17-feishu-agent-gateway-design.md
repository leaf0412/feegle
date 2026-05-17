# Feishu Agent Gateway Phase 1 Design

## Task Understanding

Build the first phase of a Feishu-driven Agent Gateway that turns a group requirement discussion into a controlled local development workflow. Phase 1 prioritizes a working end-to-end flow over roles, GitLab integration, MR creation, and complex CI orchestration.

## Scope

Phase 1 includes:

- A bot-level repository registry.
- One active requirement context per Feishu group.
- One requirement context may select multiple repositories.
- Local clone and workspace management per requirement and repository.
- Requirement collection and branch-name suggestions.
- Explicit local branch creation before downstream work can continue.
- Requirement files written into each selected repository branch.
- A Vite-built offline prototype zip that opens by double-clicking `index.html`.
- Development plan generation.
- An Agent CLI abstraction that can support Codex or Claude Code adapters.
- TDD-oriented development runs with one commit per feature slice.
- A Feishu card action that explicitly triggers `git push`.

Phase 1 excludes:

- Role and permission checks.
- GitLab or lejuhub API integration.
- Automatic MR creation.
- Automatic push before user action.
- Multiple simultaneous active requirements in the same Feishu group.
- Full CI orchestration.
- Remote preview hosting.

## Domain Model

### Repository Registry

The bot owns a registry of repositories. A requirement selects one or more repositories from that registry.

Fields:

- `id`
- `name`
- `remoteUrl`
- `defaultBaseBranch`
- `createdAt`
- `updatedAt`

### Requirement Context

A Feishu group has at most one active requirement context in phase 1.

Fields:

- `id`
- `chatId`
- `title`
- `status`
- `requirementText`
- `prototypeZipPath`
- `planPath`
- `createdAt`
- `updatedAt`

### Requirement Repository

This joins one requirement to one selected repository. Each selected repository has its own local working copy and branch.

Fields:

- `id`
- `requirementId`
- `repositoryId`
- `localPath`
- `baseBranch`
- `suggestedBranch`
- `activeBranch`
- `branchStatus`
- `pushStatus`
- `createdAt`
- `updatedAt`

### Agent Run

Every long-running Agent action is tracked.

Fields:

- `id`
- `requirementId`
- `kind`
- `status`
- `prompt`
- `stdout`
- `stderr`
- `exitCode`
- `startedAt`
- `finishedAt`

### Requirement Commit

Each feature-slice commit is recorded per repository.

Fields:

- `id`
- `requirementId`
- `repositoryId`
- `commitHash`
- `commitMessage`
- `stepTitle`
- `createdAt`
- `pushedAt`

## State Machine

Allowed states:

```txt
created
repo_selected
requirement_received
branch_suggested
branch_created
requirement_materialized
prototype_generated
prototype_reviewing
plan_generated
plan_confirmed
dev_running
committed
push_ready
pushed
closed
```

Core guards:

- Repositories must be selected before accepting branch creation.
- Branch names must be suggested before local branches are created.
- All selected repositories must have local branches before requirement files are written.
- Requirement files must be written before prototype generation.
- Prototype generation must finish before development plan generation.
- The plan must be confirmed before Agent development starts.
- Commits must exist before the push card is enabled.
- `git push` only runs after an explicit Feishu card action.

## Command Flow

### Repository Registry

Phase 1 can use commands or a local config-backed API. Permissions are intentionally out of scope.

```txt
/repo add <name> <remote_url> <default_base_branch>
/repo list
/repo remove <repo_id>
```

### Requirement Flow

```txt
/requirement start <title>
/repo select <repo_id> [repo_id...]
/requirement <text>
/branch suggest
/branch create
/prototype
/plan
/plan confirm
/dev-run
```

Push is triggered by a Feishu card button rather than a chat command.

## Workspace Layout

All local workspaces are grouped by Feishu group and requirement.

```txt
.feegle-workspaces/
  <chat_id>/
    <requirement_id>/
      repos/
        <repository_id>/
          working-copy/
      artifacts/
        prototype/
        prototype.zip
        plan.md
```

Inside every selected repository branch, requirement material is written to:

```txt
.agent-requirements/
  <requirement_id>/
    requirement.md
    plan.md
    test-log.md
```

## Offline Prototype

The prototype is requirement-level, not repository-level.

Generation rules:

- Use Vite as the build tool.
- Configure Vite with `base: './'`.
- Avoid server APIs; use in-memory mock data.
- Avoid history routing; use single-page state transitions or hash routing.
- Build static output.
- Create a zip that contains `index.html`, assets, and a short `README.txt`.
- The user must be able to unzip and double-click `index.html` without running a service.

## Agent CLI Abstraction

The gateway talks to Agent tools through an interface.

```txt
AgentCli
  generatePrototype(context)
  generatePlan(context)
  runDevelopmentTask(context, repository, task)
```

Initial adapters:

- `CodexAgentAdapter`
- `ClaudeCodeAgentAdapter`

Only one adapter needs to be active in phase 1. The abstraction exists so the gateway does not encode provider-specific command behavior into workflow services.

## Development Run

Development follows TDD by feature slice:

1. Generate or load a confirmed plan.
2. For each feature task, ask the Agent adapter to write a failing test first.
3. Run the targeted test and confirm it fails for the expected reason.
4. Implement the smallest code change to pass.
5. Run targeted verification.
6. Commit only the files for that feature slice.
7. Record commit metadata.

The gateway does not push automatically. It enables push only when selected repositories have commits.

## Feishu Responses

Phase 1 Feishu responses should include:

- Current requirement state.
- Selected repositories and branches.
- Prototype zip attachment.
- Plan summary.
- Commit list grouped by repository.
- A push card button per repository and an optional "push all" action.

## Failure Handling

Failures are surfaced directly. The gateway must not silently continue after:

- Clone failure.
- Branch creation failure.
- Prototype build failure.
- Zip creation failure.
- Agent command failure.
- Test failure during development.
- Commit failure.
- Push failure.

The state remains at the last completed step, and `/status` shows the failed run.

## Acceptance Criteria

- A requirement can select multiple registered repositories.
- Each selected repository is cloned into the requirement workspace.
- Branch suggestions are generated without creating remote branches.
- Local branches are created only after explicit user action.
- Requirement files are written into every selected repository branch.
- A prototype zip can be opened locally through `index.html`.
- A development plan can be generated and confirmed.
- Agent development can create feature-slice commits.
- Push does not happen until the Feishu card action is triggered.
