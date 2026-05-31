# Agent Team Execution Plan: Plans 25-30

## Strategy

Execute plans in dependency order across multiple phases. Each plan follows TDD (test-first) as the plan documents prescribe.

## Phase Layout

```
Phase 1 (Parallel):  25 (Scheduler)  |  27 (Webhook)  |  28 (Observability)
Phase 2:             26 (CLI Control) — depends on 28
Phase 3:             29 (Status Sync) — depends on 25,26,27,28
Phase 4:             30 (Project Structure) — massive refactoring, runs last
```

---

## Phase 1: Three Independent Plans (Parallel)

### Plan 25: Scheduler Workflow Native Completion

**Files touched (7):**
| Action | File |
|--------|------|
| CREATE | `tests/scheduler/scheduler-workflow-contribution.test.ts` |
| MODIFY | `src/scheduler/scheduler-workflow-contribution.ts` |
| MODIFY | `src/scheduler/task-scheduler.ts` |
| MODIFY | `src/scheduler/scheduler-runtime-observer.ts` |
| MODIFY | `src/plugins/core/core-plugin.ts` |
| MODIFY | `tests/scheduler/task-scheduler.test.ts` |
| MODIFY | `tests/scheduler/scheduler-runtime-observer.test.ts` |

**3 Tasks:**

1. **Test + Complete contribution registration** — Create `scheduler-workflow-contribution.test.ts`, verify `schedulerWorkflowContribution` registers both workflows (`scheduler.heartbeat.workflow`, `scheduler.agent_prompt.workflow`) and the `core:agent_prompt` effect handler.

2. **Add runtime routing to TaskScheduler** — Define `SchedulerWorkflowRunner` interface. In `TaskScheduler.execute()`, when a task kind maps to a scheduler workflow, route through the runner; unsupported kinds stay on legacy HandlerKind path. Add test proving routing behavior.

3. **Recover repeated runtime failures** — Update `SchedulerRuntimeObserver` to track runtime-backed failures distinctly (source metadata `{ source: "scheduler_runtime", taskId, kind, runAttemptId }`). Test that 2 consecutive runtime-backed failures trigger recovery evidence.

---

### Plan 27: Webhook Plugin Ingress Completion

**Files touched (7):**
| Action | File |
|--------|------|
| MODIFY | `src/webhook/webhook-trigger-event-adapter.ts` |
| CREATE | `src/plugins/webhook/webhook-plugin.ts` |
| MODIFY | `src/boot/default-plugins.ts` |
| MODIFY | `src/boot/feegle-plugin.ts` (if needed) |
| MODIFY | `tests/webhook/webhook-trigger-event-adapter.test.ts` |
| CREATE | `tests/plugins/webhook/webhook-plugin.test.ts` |

**3 Tasks:**

1. **Add HMAC signature verification** — Implement `verifyWebhookSignature()` with `crypto.timingSafeEqual`. Add valid/invalid signature tests. Wire into adapter before trigger event creation.

2. **Redact sensitive payload fields** — Add redaction for keys matching `/token|password|secret|authorization|api[_-]?key/i`. Use existing `src/security/redaction.ts` patterns. Test with payloads containing sensitive keys.

3. **Create and register webhook plugin** — Create `src/plugins/webhook/webhook-plugin.ts` with `runtimeContributions` containing `webhookRuntimeContribution()` (register intent resolver + workflow selector + minimal webhook workflow). Add `webhookPlugin` to `defaultPlugins`.

---

### Plan 28: Runtime Observability Completion

**Files touched (8):**
| Action | File |
|--------|------|
| MODIFY | `src/runtime/runtime-store.ts` |
| MODIFY | `src/operations/runtime-inspection-service.ts` |
| MODIFY | `src/operations/runtime-health-service.ts` |
| MODIFY | `src/operations/stuck-run-detector.ts` |
| MODIFY | `src/platform/commands/system/doctor-command.ts` |
| CREATE | `tests/operations/runtime-inspection-service.test.ts` |
| MODIFY | `tests/operations/runtime-health-service.test.ts` |
| CREATE | `tests/operations/stuck-run-detector.test.ts` |

**4 Tasks:**

1. **Add read-only RuntimeStore queries** — Add `listWorkflowSummaries(workspaceId)`, `listRunAttempts(workflowInstanceId)`, `listStepSummaries(workflowInstanceId)`, `listEffectSummaries(runAttemptId)`, `listRunningAttemptsOlderThan(now, maxAgeMs)`. All SELECT-only.

2. **Implement RuntimeInspectionService** — Replace placeholder with real queries from RuntimeStore. Test returns `{ totalWorkflows, waitingCount, failedCount, workflows }`.

3. **Make health checks non-mutating** — Replace `markRunningAttemptsInterrupted()` call with `StuckRunDetector.detect()` read-only call. Report `warn` when stale running attempts exist without mutating them.

4. **Return concrete stuck-run data** — Use `listRunningAttemptsOlderThan()` instead of `markRunningAttemptsInterrupted()`. Return exact `{ attemptId, workflowInstanceId, status }` records. Ignore waiting workflows. Test: stale running → reported, waiting → not reported, fresh → not reported.

---

## Phase 2: Depends on Phase 1

### Plan 26: Runtime CLI Control Completion

**Files touched (5):**
| Action | File |
|--------|------|
| MODIFY | `src/platform/slash-command-module.ts` |
| MODIFY | `src/platform/commands/runtime-command-module.ts` |
| MODIFY | `src/platform/commands/default-slash-command-modules.ts` |
| MODIFY | `src/boot/phases/commands-phase.ts` |
| CREATE | `tests/platform/commands/runtime-command.test.ts` |

**4 Tasks:**

1. **Add missing dependencies** — Add `runtimeInspectionService?`, `recoveryService?`, `controlActionStore?` to `SlashCommandRegistryDeps`. Wire in `commands-phase.ts` boot. Create test file with fake services.

2. **Implement list/show commands** — `/runtime list` queries `RuntimeInspectionService.inspect("ws_personal")` and formats output. `/runtime show <id>` shows workflow detail. Test both.

3. **Fix approve/reject/cancel** — Make `RejectCommandHandler` actually call `processor.process()`. Add `CancelCommandHandler` for `/runtime cancel`. All three use the same control-action path.

4. **Add memory + recovery commands** — `/runtime memory approve <id>` calls `MemoryService.approve()`. `/runtime memory reject <id>` calls `MemoryService.reject()`. `/runtime recover <wfId>` creates a `trigger_recovery` control action. Wire `memoryService` into command deps.

---

## Phase 3: Documentation

### Plan 29: Status Sync

**Files touched (2):**
| Action | File |
|--------|------|
| CREATE | `_docs/plans/2026-05-31-runtime-platform-status.md` |
| MODIFY | `_docs/plans/2026-05-31-roadmap-runtime-platform-next.md` |

**2 Tasks:**

1. **Create status page** — Markdown table: Plan | Status | Evidence | Remaining Gap | Follow-up. Plans 18/20/21/24 → `reopened`, link to 25-28.

2. **Update roadmap** — Add completion follow-ups section (25-29). Verify all file links resolve.

---

## Phase 4: Engineering Refactoring

### Plan 30: Project Structure & Import Aliases

**Files touched:** ALL `src/**/*.ts` and `tests/**/*.ts` (import updates).

**8 Tasks (sequential, each committed separately):**

| Task | What Moves |
|------|-----------|
| T1 | Document structure (`_docs/project-structure.md`) |
| T2 | `src/{webhook,gitlab,stock}` → `src/integrations/`, `src/{workspace,repositories}` → `src/resources/` |
| T3 | `src/{runtime,control,memory,recovery,security,artifacts,diagnostics}` → `src/core/` |
| T4 | `src/{app,boot,git}` → `src/infra/`, `src/{scheduler,automation,workbench,requirements,prototype}` → `src/features/` |
| T5 | `src/feishu` → `src/integrations/feishu` |
| T6 | Add aliases (`@core`, `@infra`, `@integrations`, `@features`, `@resources`, `@platform`, `@plugins`, `@domain`, `@tests`) in `tsconfig.json`, `vitest.config.ts`, `package.json` |
| T7 | Rewrite cross-boundary imports to use aliases (keep same-module imports relative) |
| T8 | Add boundary guard script (`scripts/check-import-boundaries.mjs`) + alias docs |

Each task verifies with focused tests + `npm run typecheck` before committing.

---

## Verification Gates

After each phase:
```bash
npm run typecheck   # must pass
npm test            # all tests must pass
```

Final verification:
```bash
npm run typecheck && npm test && npm run build
```
