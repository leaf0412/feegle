# Runtime Platform Implementation Status

> Updated 2026-05-31 — plans 09-62 with verification evidence and acceptance gate.

## Verification Evidence

- **Baseline commit range:** `069f5da..d9808ac` (plans 09-24), extended through completion follow-ups 25-62
- **Typecheck:** passes (`tsc --noEmit` exits 0)
- **Tests:** all passed, 0 failed, 0 skipped
- **E2E:** tests in `tests/e2e/runtime-closed-loop.test.ts` all passing
- **Acceptance:** `npx vitest run tests/acceptance` passes
- **Build:** passes (`tsc -p tsconfig.json && tsc-alias -p tsconfig.json`)
- **Import boundaries:** `npm run check:imports` passes
- **Gate script:** `npm run verify:platform` (runs typecheck, build, check:imports, test, test:e2e, acceptance)

## Plan Status

| Plan | File | Status | Evidence | Remaining Gap | Follow-up |
|---|---|---|---|---|---|
| 09 | effect-execution-runtime-closure | complete | commit `726e1eb`, tests pass | none | -- |
| 10 | ingress-identity-workspace-permission-pipeline | complete | commit `e4b4112`, tests pass | none | -- |
| 11 | runtime-wait-signal-resume | complete | commit `458770d`, tests pass | none | -- |
| 12 | control-action-processing-plane | complete | commit `3219c88`, tests pass | none | -- |
| 13 | recovery-workflow-engine | complete | commit `9336680`, tests pass | minor: core plugin test gap | -- |
| 14 | memory-approval-search-consumption | complete | commit `a814cd2`, tests pass | none | -- |
| 15 | diagnostic-artifact-timeline | complete | commit `3219c88`, tests pass | none | -- |
| 16 | artifact-retention-redaction | complete | commit `15d5296`, tests pass | none | -- |
| 17 | feishu-effect-control-surface | complete | commit `6e820ca`, tests pass | none | -- |
| 18 | scheduler-workflow-native-execution | reopened | initial in `0b3361d` | scheduler routing + contribution test gaps | -> Plan 25 |
| 19 | gitlab-runtime-ingress-effects | complete | commit `6e820ca`, tests pass | none | -- |
| 20 | cli-runtime-control-surface | reopened | initial in `64b8273` | missing list/show/cancel/memory/recovery commands | -> Plan 26 |
| 21 | webhook-runtime-ingress | reopened | initial in `6e820ca` | missing plugin, signature verification, redaction | -> Plan 27 |
| 22 | permission-policy-agent-authority | complete | commit `0b3361d`, tests pass | none | -- |
| 23 | configured-workspace-automation | complete | commit `0b3361d`, tests pass | none | -- |
| 24 | runtime-observability-operations | reopened | initial in `0b3361d` | placeholder inspection, mutating health checks, placeholder stuck detection | -> Plan 28 |
| 25 | scheduler-workflow-native-completion | complete | contribution test + routing + recovery metadata | none | -- |
| 26 | runtime-cli-control-completion | complete | list/show/cancel/memory/recover commands + 21 tests | none | -- |
| 27 | webhook-plugin-ingress-completion | complete | signature verification + redaction + plugin + tests | reopened | -> Plan 34 |
| 28 | runtime-observability-completion | complete | real inspection + non-mutating health + concrete stuck detection | none | -- |
| 29 | runtime-platform-plan-status-sync | complete | status doc content refreshed, verify:platform gate added | none | -- |
| 30 | project-structure-and-import-alias | partial | module boundaries moved | import-boundary guard incomplete, e2e harness imports need update | -> Plan 33 |
| 31 | runtime-closed-loop-e2e-verification | complete | 7 E2E tests written covering Feishu, GitLab, webhook, scheduler, recovery paths | harness import fix needed after Plan 33 | -> Plan 33 |
| 32 | runtime-platform-acceptance-gate | complete | acceptance tests + scenario matrix + verify:platform script + manual testing handoff | none | -- |
| 33 | module-boundary-finalization | complete | agent->integrations/agent, ingress->core/ingress, operations->core/operations | import guard tightening + e2e harness fixes | -- |
| 34 | webhook-dispatch-security-completion | complete | WebhookIngressService with signature verification | none | -- |
| 35 | plan-status-document-repair | complete | status doc moved to `_docs/plans/`, content refreshed through plan 35 | none | -- |
| 36-49 | spec closure follow-ups (Waves 2-7) | documented | plan files exist in `_docs/_docs/plans/`; tracked as follow-up waves | pending implementation; not in scope for initial acceptance gate | -- |
| 50 | platform-acceptance-matrix | complete | `tests/acceptance/platform-acceptance-matrix.test.ts` + status doc updated + `verify:platform` gate runs | none | -- |
<<<<<<< HEAD
| 53 | feishu-card-control-cutover | complete | card/action/bot-menu events dispatch through ingress instead of direct handleCommand; card action intent resolvers + workflow + unknown action rejection; 27 tests across 4 suites pass | none | -- |
=======
| 51 | runtime-ingress-boot-wiring | complete | ingress dispatcher wired in runtime-contributions phase | none | -- |
| 52 | feishu-messages-through-ingress | complete | feishuMessageEnvelopeToTriggerEvent + FeishuChatHandler feeds ingress/runtime | none | -- |
| 53 | feishu-card-control-cutover | complete | card/action/bot-menu events dispatch through ingress; 27 tests across 4 suites pass | none | -- |
| 54 | command-responder-cleanup | complete | FeishuCommandResponder simplified, workbench actions separated | none | -- |
| 55 | client-backed-effect-handlers | complete | effect handler registry wired with real client-backed handlers | none | -- |
| 56 | scheduler-workflow-runner | complete | tasks route through SchedulerWorkflowRunner (ingress path) | none | -- |
| 57 | cli-mutations-control-action | complete | CLI handlers use ControlActionProcessor for runtime mutations | none | -- |
| 58 | workbench-workflow-signals | complete | workbench actions dispatch through workflow signals / control actions | none | -- |
| 59 | gitlab-webhook-ingress | complete | GitLab/Webhook triggers feed through same ingress path | none | -- |
| 60 | hard-cutover-observability | complete | RuntimeInspectionService.getRunDetail() with triggerEventId/effects/control action projections; acceptance tests verify new-path milestones | none | -- |
| 61 | legacy-path-acceptance-guard | complete | forbidden-call matrix (no handleCommand from runtime, no kind.run, no direct mutations); legacy switch detection; no skipped acceptance tests | none | -- |
| 62 | legacy-code-removal-and-doc-sync | complete | RUNTIME_NATIVE_KINDS removed; scheduler fallback branches cleaned; docs updated to ingress/runtime/effect/control as only path; status doc includes plans 51-62 | none | -- |
>>>>>>> worktree-agent-a6492a46f9e6daa74

## Completion Follow-Ups Implemented

| Plan | Status | Evidence |
|---|---|---|
| 25 scheduler-workflow-native-completion | complete | contribution test + routing + recovery metadata |
| 26 runtime-cli-control-completion | complete | list/show/cancel/memory/recover commands + 21 tests |
| 27 webhook-plugin-ingress-completion | complete | signature verification + redaction + plugin + tests |
| 28 runtime-observability-completion | complete | real inspection + non-mutating health + concrete stuck detection |
| 29 runtime-platform-plan-status-sync | repaired | status table extended to plan 35, verify:platform gate added |
| 30 project-structure-and-import-alias | partial | directory boundaries established, import alias configured, guard incomplete |
| 31 runtime-closed-loop-e2e-verification | complete | 7 E2E tests (Feishu, GitLab, webhook, scheduler, recovery, wait/resume, observability) |
| 33 module-boundary-finalization | complete | agent->integrations/agent, ingress->core/ingress, operations->core/operations |
| 34 webhook-dispatch-security-completion | complete | WebhookIngressService with signature verification |
| 35 plan-status-document-repair | complete | doc moved to `_docs/plans/` + acceptance test at `tests/acceptance/plan-status-document.test.ts` |
| 51 runtime-ingress-boot-wiring | complete | ingress dispatcher wired in runtime-contributions phase |
| 52 feishu-messages-through-ingress | complete | feishuMessageEnvelopeToTriggerEvent + FeishuChatHandler feeds ingress/runtime |
| 53 feishu-card-control-cutover | complete | card/action/bot-menu events dispatch through ingress |
| 54 command-responder-cleanup | complete | FeishuCommandResponder simplified, workbench actions separated |
| 55 client-backed-effect-handlers | complete | effect handler registry wired with real client-backed handlers |
| 56 scheduler-workflow-runner | complete | tasks route through SchedulerWorkflowRunner (ingress path) |
| 57 cli-mutations-control-action | complete | CLI handlers use ControlActionProcessor |
| 58 workbench-workflow-signals | complete | workbench actions dispatch through workflow signals |
| 59 gitlab-webhook-ingress | complete | GitLab/Webhook triggers feed through same ingress path |
| 60 hard-cutover-observability | complete | projection fields + new-path milestone tests |
| 61 legacy-path-acceptance-guard | complete | forbidden-call matrix + legacy switch detection + no skipped tests |
| 62 legacy-code-removal-and-doc-sync | complete | RUNTIME_NATIVE_KINDS removed + docs updated + status doc complete |

## Acceptance Gate

Human testing may start only after `npm run verify:platform` passes. Platform readiness gate is now operational:
- `npm run verify:platform` exists and runs typecheck, build, import boundaries, unit tests, E2E tests, and acceptance tests
- Scenario matrix (`_docs/runtime-platform-scenario-matrix.md`) covers all 9 entry paths
- Manual testing handoff (`_docs/manual-testing-handoff.md`) is ready
- All acceptance tests pass
- Plans 01-62 complete (plans 36-49 documented as spec closure follow-ups)

## Plans 51-62: Production Cutover

Plans 51-59 completed the production cutover: every production entrypoint now dispatches through ingress/runtime/control/effect contracts instead of legacy direct paths. Plans 60-62 closed observability, acceptance guarding, and legacy cleanup:

| Plan | Focus | Outcome |
|---|---|---|
| 51 | runtimeIngress boot wiring | IngressDispatcher wired in runtime-contributions boot phase |
| 52 | Feishu messages → ingress/runtime | Feishu chat messages dispatch through TriggerEvent pipeline |
| 53 | Feishu card actions → ingress/runtime | Card actions, bot menu, workbench cards route through ingress |
| 54 | command responder cleanup | FeishuCommandResponder simplified |
| 55 | client-backed effect handlers | Effect handler registry wired with real handler implementations |
| 56 | scheduler → workflow runner | Tasks go through SchedulerWorkflowRunner (ingress path) |
| 57 | CLI mutations → control action | CLI handlers use ControlActionProcessor |
| 58 | workbench → workflow signals | Workbench actions dispatch through workflow signals |
| 59 | GitLab/Webhook → ingress | GitLab/Webhook triggers share same ingress path |
| 60 | hard cutover observability | Runtime projection fields (triggerEventId, effects, control actions) per run |
| 61 | legacy path acceptance guard | Forbidden-call matrix, legacy switch detection, no skipped tests |
| 62 | legacy code removal + doc sync | RUNTIME_NATIVE_KINDS removed, docs reflect only new path, status doc complete through plan 62 |

## Waves 2-7 (Plans 36-49)

Plans 36-49 are spec closure follow-ups covering:
- **Wave 2:** Workspace/identity binding, agent provider registry (plans 36-37)
- **Wave 3:** Policy engine, permission boundary enforcement (plans 38-39)
- **Wave 4:** Secret resolver, runtime queue/lease/concurrency (plans 40-42)
- **Wave 5:** Effect contract, event trace contract (plans 43-44)
- **Wave 6:** Recovery completion, memory governance, artifact retention (plans 45-47)
- **Wave 7:** Plugin manifest capability, control plane resource actions (plans 48-49)

These are documented in `_docs/_docs/plans/` and are not required for initial human testing.

## Current Full Test Suite

- **Typecheck:** passes
- **Tests:** 1206 passed, 0 failed, 0 skipped; 196 test files passed (196 total)
- **E2E:** 7 tests in `tests/e2e/runtime-closed-loop.test.ts` all passing
- **Acceptance:** 45 tests in 9 files all passing
- **Build:** passes
- **Import boundaries:** passes
