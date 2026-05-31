# Manual Testing Handoff

Before manual testing starts, `npm run verify:platform` must pass.

Manual testers should file product bugs only. If a basic route is missing, a command is planned, a workflow cannot start, or diagnostics are absent, stop manual testing and fix the acceptance gate.

Manual testers are not responsible for reconstructing internal execution. Every report must have trace IDs from runtime records or diagnostic artifacts.

## Architecture (the only supported path)

External event → Ingress (identity/workspace/policy resolution) → Intent resolver → Workflow selector → Workflow runtime (step effects + control actions + diagnostics) → Effect handlers → Completion/failure

All entrypoints (Feishu messages, Feishu card actions, scheduler tasks, GitLab events, Webhook events, CLI commands, workbench actions) dispatch through this single pipeline. There is no legacy fallback or direct handler execution path.

## Scenarios

Use `_docs/runtime-platform-scenario-matrix.md` as the source of truth.

For every bug report, include:

- entry path
- workspace/project
- workflowInstanceId
- runAttemptId
- triggerEventId
- diagnostic artifact id if present
- failed trace stage if present
- expected behavior
- actual behavior

## Runtime Evidence

Before reporting a behavior bug, verify that the runtime produced evidence for the entry:

- **Feishu message (F-01):** Runtime events include `ingress.identity_resolved`, `ingress.workspace_resolved`, `ingress.permission_checked`, `ingress.policy_decided`, `workflow_instance.created`, `attempt.started`, `step.started`, `effect.started`, `effect.succeeded`, `step.succeeded`, `attempt.completed`
- **Feishu card action (F-02):** Runtime events include `workflow.signal_received`, `step.resumed`, `attempt.completed`
- **Scheduler task (S-01):** Runtime events include `workflow_instance.created` through `attempt.completed` with `source.pluginId === "core"` and `triggerType === "scheduled_workflow"`
- **GitLab trigger (G-01):** Runtime events include `workflow_instance.created` through `attempt.completed` with `source.pluginId === "gitlab"`
- **Webhook (W-01):** Runtime events include `workflow_instance.created` through `attempt.completed` with `source.pluginId === "webhook"`
- **Control action (C-01):** Control action record created with `status: "completed"` or `"failed"`
- **Recoverable failure (R-01):** Diagnostic artifact created + runtime event `attempt.failed`
- **Memory approval (M-01):** Memory record created with `status: "active"` then consumed
- **Observability (O-01):** `RuntimeInspectionService.getRunDetail()` returns non-null with effects and control actions

If any of these evidence traces are missing, the bug is in the platform runtime layer, not in the product feature.
