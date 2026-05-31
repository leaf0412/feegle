# Runtime Platform Next Roadmap

> **For agentic workers:** This is a planning index. Execute individual plan files with `superpowers:executing-plans` or expand a selected plan into task-level TDD steps before implementation.

**Goal:** Break the remaining Agent Automation Platform architecture into a broad set of follow-up implementation plans after completed plans 01-08.

**Baseline:** Plans 01-08 created the workspace/resource boundary, workflow runtime core, trigger/intent/effect boundary, recovery/memory/control stores, runtime execution state writes, boot-time runtime contributions, Feishu ingress migration seed, and scheduler recovery observation seed.

---

## Current Status

As of 2026-05-31:
- Plans 01-28: complete
- Plan 29: repaired (status doc refreshed in Plan 35)
- Plan 30: partial (module boundaries moved, import guard incomplete -- reopened -> Plan 33)
- Plan 31: complete (7 E2E tests written, harness import fix pending after Plan 33)
- Plan 32: pending (depends on 33-35 + acceptance gate)
- Plans 33-35: complete (Wave 1 closure)
- Plans 36-50: pending (Waves 2-7)
- `npm run verify:platform`: will be available after plan 50

## Status Update

After pulling `d9808ac` on 2026-05-31, plans 09-24 are partially implemented in `main`. Typecheck passes and the full Vitest suite passes, but plans 18, 20, 21, and 24 still have concrete implementation/test gaps. Those gaps are reopened as completion plans 25-28, with plan 29 reserved for synchronizing documentation status after implementation.

## Implemented Capability Baseline

- 01 Workspace resource boundary: Workspace/User/Membership/Project/ConversationBinding stores and service exist.
- 02 Workflow runtime core: workflow models, registry, runtime store, runtime skeleton, restart interruption marking exist.
- 03 Trigger/intent/effect/plugin boundary: TriggerEvent, Intent, intent resolver registry, workflow selector, effect handler registry, and runtime contribution extension exist.
- 04 Recovery/memory/diagnostics/control plane seed: artifact, diagnostic bundle, memory candidate, recovery service, and control action store exist.
- 05 Runtime execution completeness: runtime now records step states, runtime events, effect execution records, final attempt status, and final workflow instance status.
- 06 Runtime boot composition: runtime stores, registries, selector, executor registries, artifact/memory/control stores, and runtime contribution phase are boot-wired.
- 07 Feishu runtime ingress migration seed: Feishu messages can be adapted to TriggerEvent and dispatched through ingress into a placeholder Feishu workflow.
- 08 Scheduler recovery/memory integration seed: scheduler task runs can emit TriggerEvents and repeated scheduler failures can create diagnostics/memory/control records.

## Major Remaining Capability Gaps

- Effect execution is not yet part of workflow step context, so workflow steps cannot call typed plugin effects through the runtime.
- Ingress does not yet resolve external identities, conversation bindings, workspace/project scope, permissions, or policy before intent resolution.
- Control actions are persisted but not handled as workflow signals, approvals, resumes, cancellations, or memory approvals.
- Recovery is still a service that creates diagnostic artifacts, not a normal recovery workflow with classification and proposed action.
- Memory candidates exist, but approval/rejection, promotion, search, and workflow consumption are not implemented.
- Runtime can enter waiting state, but there is no resume/signal path.
- Scheduler still executes HandlerKind directly; it is only observed by runtime, not workflow-native.
- Feishu runtime workflow is a placeholder and does not execute reply/update effects.
- GitLab, CLI, and webhook ingress are not runtime-native.
- Permission/policy, agent authority, secret redaction, artifact retention, runtime inspection, config-defined automation, and operational diagnostics remain future work.

## Follow-Up Plan Set

### Foundation and Runtime Closure

09. `2026-05-31-09-effect-execution-runtime-closure.md`
Build runtime-owned effect execution through step context, effect handlers, idempotency, and RuntimeEvents.

10. `2026-05-31-10-ingress-identity-workspace-permission-pipeline.md`
Add identity, conversation, workspace/project, permission, and policy stages before intent resolution.

11. `2026-05-31-11-runtime-wait-signal-resume.md`
Allow waiting workflow instances to resume from workflow signals and control actions.

12. `2026-05-31-12-control-action-processing-plane.md`
Turn persisted ControlActions into executable platform-neutral operations.

### Recovery and Memory

13. `2026-05-31-13-recovery-workflow-engine.md`
Implement recovery as a normal workflow that creates diagnostics, classifies failures, proposes repair, and waits for approval when needed.

14. `2026-05-31-14-memory-approval-search-consumption.md`
Add memory approval/rejection, active memory search, and workflow memory consumption.

15. `2026-05-31-15-diagnostic-artifact-timeline.md`
Create full diagnostic bundles from runtime event timelines, failed effects, artifacts, environment summaries, and related memory.

16. `2026-05-31-16-artifact-retention-redaction.md`
Implement artifact retention, pinning, secret redaction, and safe deletion that preserves event summaries.

### Plugin and Platform Migration

17. `2026-05-31-17-feishu-effect-control-surface.md`
Make Feishu reply/card operations runtime effects and convert card actions into control actions/workflow signals.

18. `2026-05-31-18-scheduler-workflow-native-execution.md`
Move scheduled work from direct HandlerKind execution toward workflow-native execution.

19. `2026-05-31-19-gitlab-runtime-ingress-effects.md`
Introduce GitLab trigger adapters, MR/issue workflows, and GitLab effect handlers.

20. `2026-05-31-20-cli-runtime-control-surface.md`
Add CLI commands for runtime inspection, diagnostics, control actions, memory approvals, and workflow intervention.

21. `2026-05-31-21-webhook-runtime-ingress.md`
Add a generic webhook trigger adapter and policy-bound workflow selection.

### Policy, Authority, Automation, Operations

22. `2026-05-31-22-permission-policy-agent-authority.md`
Implement RBAC permission checks, policy decisions, and least-privilege agent authority.

23. `2026-05-31-23-configured-workspace-automation.md`
Add limited config-defined trigger-condition-effect automations after runtime semantics stabilize.

24. `2026-05-31-24-runtime-observability-operations.md`
Add runtime inspection projections, health checks, stuck-run detection, and operational diagnostics.

### Completion Follow-Ups

25. `2026-05-31-25-scheduler-workflow-native-completion.md`
Complete scheduler runtime-native routing, contribution tests, and recovery evidence for repeated runtime failures.

26. `2026-05-31-26-runtime-cli-control-completion.md`
Complete runtime CLI/slash-command control surface for inspection, diagnostics, cancellation, memory approval, and recovery trigger commands.

27. `2026-05-31-27-webhook-plugin-ingress-completion.md`
Complete webhook plugin registration, signature verification, and redacted payload summaries.

28. `2026-05-31-28-runtime-observability-completion.md`
Replace placeholder observability services with real projections, non-mutating health checks, and concrete stuck-run detection.

29. `2026-05-31-29-runtime-platform-plan-status-sync.md`
Create and maintain a verified status summary for plans 09-24 and their reopened follow-ups.

30. `2026-05-31-30-project-structure-and-import-alias.md`
First migrate the project into planned directory boundaries, then add aliases and a boundary guard for the new structure.

31. `2026-05-31-31-runtime-closed-loop-e2e-verification.md`
Add local end-to-end tests that prove Feishu, GitLab polling, webhook, scheduler, and control paths close through ingress, runtime, effects, recovery, memory, and observability.

32. `2026-05-31-32-runtime-platform-acceptance-gate.md`
Add the final automated readiness gate so manual testing starts only after plugins, commands, E2E scenarios, diagnostics, docs, build, and import boundaries are closed.

33. `2026-05-31-33-module-boundary-finalization.md`
Move remaining top-level modules into the planned architecture and tighten the import-boundary guard.

34. `2026-05-31-34-webhook-dispatch-security-completion.md`
Enforce webhook signature verification before dispatching payloads into runtime ingress.

35. `2026-05-31-35-plan-status-document-repair.md`
Move and refresh the runtime platform status document so plan state is accurate through the final acceptance gate.

### Spec Closure Follow-Ups

36. `2026-05-31-36-workspace-identity-binding-completion.md`
Remove hardcoded workspace assumptions by making every external interaction resolve to a durable workspace, user, optional project, and binding before runtime execution.

37. `2026-05-31-37-agent-provider-registry-completion.md`
Make agent providers workspace-owned resources with registration, lookup, enable/disable, capability metadata, and audit events.

38. `2026-05-31-38-policy-engine-completion.md`
Consolidate permission decisions into a single workspace policy engine with explicit allow/deny decisions and audit evidence.

39. `2026-05-31-39-permission-boundary-enforcement.md`
Enforce policy checks at ingress, intent, workflow step, effect, resource, memory, provider, and schedule boundaries.

40. `2026-05-31-40-secret-reference-resolver-completion.md`
Ensure secrets are represented only as references in durable state and resolved only at the boundary that needs them.

41. `2026-05-31-41-runtime-queue-lease-worker.md`
Turn reserved queue fields into a real durable execution queue with leases, retry scheduling, worker claiming, and restart recovery.

42. `2026-05-31-42-runtime-concurrency-policy-completion.md`
Implement `reject_if_running`, `queue_if_running`, `skip_if_running`, and `allow_readonly_parallel` execution semantics.

43. `2026-05-31-43-effect-execution-contract-completion.md`
Complete the effect boundary with permission checks, idempotency, retries, RuntimeEvents, and normalized errors.

44. `2026-05-31-44-runtime-event-trace-contract.md`
Turn the architecture spec's RuntimeEvent list into a tested contract that every core workflow path must satisfy.

45. `2026-05-31-45-recovery-workflow-completion.md`
Complete recovery as a normal workflow with diagnosis, proposal, approval, execution, memory, and observable outcome.

46. `2026-05-31-46-memory-governance-completion.md`
Complete memory governance with scope, kind, approval policy, search, revocation, expiration, provenance, and audit events.

47. `2026-05-31-47-artifact-retention-redaction-policy.md`
Complete artifact governance with retention rules, pinning, workspace policy, redaction, access checks, and safe deletion.

48. `2026-05-31-48-plugin-manifest-capability-contract.md`
Introduce plugin manifests and capability contracts for triggers, effects, intents, control surfaces, permissions, and secrets.

49. `2026-05-31-49-control-plane-resource-actions.md`
Route workspace, provider, binding, policy, memory, schedule, and recovery mutations through platform-neutral ControlActions.

50. `2026-05-31-50-platform-acceptance-matrix.md`
Create the final platform acceptance matrix and `verify:platform` gate that proves the original architecture is closed before human testing.

## Status Document

Current implementation status is tracked in `_docs/plans/2026-05-31-runtime-platform-status.md`.
See also individual plan files at `_docs/plans/2026-05-31-{NN}-*.md`.

## Dependency Map

- 09 depends on 05 and 06.
- 10 depends on 01, 03, 06, and should precede 17-21.
- 11 depends on 05, 10, and 12.
- 12 depends on 04 and 10.
- 13 depends on 09, 11, 12, and 15.
- 14 depends on 04, 10, and 12.
- 15 depends on 05, 09, and 04.
- 16 depends on 04 and 15.
- 17 depends on 09, 10, 11, and 12.
- 18 depends on 09, 10, and 13.
- 19 depends on 09, 10, and 12.
- 20 depends on 12, 13, 14, and 15.
- 21 depends on 10 and 09.
- 22 depends on 10 and should harden 12, 17, 18, 19, 20, and 21.
- 23 depends on 09, 10, 12, and 22.
- 24 depends on 05, 13, 15, and 16.
- 25 depends on 18.
- 26 depends on 20 and 28.
- 27 depends on 21.
- 28 depends on 24.
- 29 depends on verification after follow-up implementation.
- 30 should run before large module moves or alias-dependent feature work.
- 31 depends on 09-29 and should run after 30/33 when import paths stabilize.
- 32 depends on 25-31 and should remain late-stage.
- 33 completes 30 and should run before 31/32.
- 34 completes 27 and should run before 31/32.
- 35 completes 29 and should run before 32.
- 36 depends on 33 and should precede 37, 38, 39, 40, 46, 47, 49, and 50.
- 37 depends on 36 and should precede provider-related permission, effect, and acceptance work.
- 38 depends on 36 and should precede 39, 46, 47, and 49.
- 39 depends on 37 and 38, and should harden 43, 46, 47, 48, and 49.
- 40 depends on 34 and 36, and should harden webhook, GitLab, agent, artifact, and diagnostics paths before 43/47/50.
- 41 depends on 33 and should precede 42, 43, 45, and 50.
- 42 depends on 41 and should precede scheduler/recovery acceptance.
- 43 depends on 39, 40, and 41.
- 44 depends on 43 and should precede 45 and 50.
- 45 depends on 42, 43, and 44.
- 46 depends on 38, 39, and 45.
- 47 depends on 38, 40, and 44.
- 48 depends on 39 and should precede final plugin acceptance.
- 49 depends on 36, 37, 38, 39, 45, and 46.
- 50 depends on 31-49 and is the final gate before human testing.

## Parallelization

Recommended serial spine:

```text
09 -> 10 -> 12 -> 11 -> 15 -> 13
```

Parallel groups after the spine:

- 14 and 16 can proceed after 12/15.
- 17, 19, and 21 can proceed in parallel after 09/10/12.
- 18 should wait for 13 if recovery behavior is included.
- 20 can proceed after 12/15, then deepen after 13/14.
- 22 can start after 10 and then harden downstream plans.
- 23 should be late-stage.
- 24 can start as projections after 15, then add operations after 13/16.
- Completion follow-ups: 25 depends on 18; 26 depends on 20 and 28; 27 depends on 21; 28 depends on 24; 29 depends on verification after follow-up implementation.
- Engineering follow-up: 30 is the directory reorganization and import-alias plan. It should run before any large file-splitting or new feature work that depends on stable module boundaries.
- Closed-loop verification: 31 depends on 09-29 and should run after 30 if import paths have been reorganized.
- Platform acceptance: 32 depends on 25-31 and is the final gate before human testing.
- Boundary finalization: 33 completes the remaining gaps from 30 and should run before 31/32.
- Webhook dispatch security: 34 completes the remaining gap from 27 and should run before 31/32.
- Status repair: 35 completes the remaining gap from 29 and should run before 32.
- Spec closure spine: 36 -> 38 -> 39 -> 43 -> 44 -> 45 -> 50.
- 37 can proceed after 36 and before provider-specific acceptance.
- 40 can proceed after 34/36 and then harden 43/47.
- 41 and 42 can proceed after 33 in parallel with policy work, then feed 43/45.
- 46 and 47 can proceed after policy and trace foundations are in place.
- 48 can proceed after 39 and should finish before final plugin acceptance.
- 49 should be late-stage because it composes workspace, provider, policy, memory, and recovery actions.
