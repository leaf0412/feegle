# Manual Testing Handoff

Before manual testing starts, `npm run verify:platform` must pass.

Manual testers should file product bugs only. If a basic route is missing, a command is planned, a workflow cannot start, or diagnostics are absent, stop manual testing and fix the acceptance gate.

Manual testers are not responsible for reconstructing internal execution. Every report must have trace IDs from runtime records or diagnostic artifacts.

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
