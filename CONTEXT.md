# CONTEXT

## Domain Terms

### Workspace

Primary ownership, permission, and isolation boundary for Feegle resources. A Workspace owns projects, users, memberships, workflows, runs, memory, providers, schedules, policies, observations, and configuration.

### Project

A business or code context that belongs to a Workspace.

### Conversation

An external interaction location from a plugin platform, such as a Feishu group, Slack channel, GitLab issue, email thread, or webhook source. A Conversation can bind to a Workspace or Project but is not the ownership boundary.

### Plugin

A platform or capability extension that owns platform-specific triggers, effects, payload schemas, and control surfaces.

### WorkflowInstance

The long-lived lifecycle object that tracks where a business process currently is.

### RunAttempt

A trigger-driven attempt to advance a WorkflowInstance, such as one message, retry, button click, or scheduled tick.

### StepState

The durable recovery and diagnostic unit inside a workflow.

### RuntimeEvent

The fact stream for workflow state transitions, diagnostics, recovery, and audit history. Logs are projections of RuntimeEvents.

### MemoryRecord

Distilled reusable long-term context that may help future work. It is not raw chat history, runtime state, or logs.

## Flagged Ambiguities

### Workspace vs removed named-workspace

The target Workspace is an ownership and isolation domain. It is not the removed named-workspace feature, which only let a chat choose a working directory through `/workspace` and `/dir`.
