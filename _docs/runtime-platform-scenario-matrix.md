# Runtime Platform Scenario Matrix

> Generated 2026-05-31 for the platform acceptance gate.

Every row must have either a matching E2E test name in `tests/e2e/runtime-closed-loop.test.ts` or a documented defer reason in this file. Deferred rows block human testing unless the product owner explicitly accepts the missing path.

## Matrix

| ID | Entry | Trigger Fixture | Expected Workflow | Required Evidence | Human Test Equivalent |
|---|---|---|---|---|---|
| F-01 | Feishu message | feishuMessageEnvelopeToTriggerEvent | feishu.chat.workflow | reply effect + attempt.completed | send message in Feishu |
| F-02 | Feishu card approve | feishuCardActionToTriggerEvent | waiting workflow resume | workflow.signal_received + step.resumed | click approve card |
| G-01 | GitLab polling result | gitlabEventToTriggerEvent | gitlab review/follow workflow | gitlab comment/status effect | issue/MR updated |
| W-01 | Webhook inbound | webhookPayloadToTriggerEvent | webhook workflow | redacted payload + attempt.completed | call webhook endpoint |
| S-01 | Scheduler tick | taskToTriggerEvent | scheduler workflow | agent effect + attempt.completed | cron task due |
| C-01 | Runtime command | command handler/control action | control workflow signal | action completed/failed honestly | run runtime command |
| R-01 | Recoverable failure | failing workflow fixture | recovery workflow | diagnostic artifact + recovery action | workflow fails in real use |
| M-01 | Memory approval | control action fixture | memory approval path | active memory consumed later | approve memory candidate |
| O-01 | Observability | existing runtime facts | inspection/health/stuck projections | read-only projections | run doctor/status commands |
