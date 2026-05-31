/**
 * Runtime Event Trace Contract
 *
 * Defines the required event categories that every core workflow path must emit.
 * The `assertRuntimeTrace` helper in tests validates these contracts.
 */

export const REQUIRED_EVENTS = {
  ingress: [
    "trigger.adapted",
    "ingress.identity_resolved",
    "ingress.workspace_resolved",
    "ingress.permission_checked",
    "ingress.policy_decided",
    "ingress.intent_resolved",
    "ingress.workflow_selected"
  ] as const,
  workflow: [
    "workflow_instance.created",
    "attempt.started",
    "step.started",
    "attempt.completed",
    "workflow_instance.state_changed"
  ] as const,
  effect: [
    "effect.started",
    "effect.succeeded"
  ] as const,
  recovery: [
    "diagnostic.created",
    "recovery.started"
  ] as const,
  memory: [
    "memory.candidate_created"
  ] as const
} as const;

export type IngressEvent = (typeof REQUIRED_EVENTS.ingress)[number];
export type WorkflowEvent = (typeof REQUIRED_EVENTS.workflow)[number];
export type EffectEvent = (typeof REQUIRED_EVENTS.effect)[number];
export type RecoveryEvent = (typeof REQUIRED_EVENTS.recovery)[number];
export type MemoryEvent = (typeof REQUIRED_EVENTS.memory)[number];

export type RequiredEvent =
  | IngressEvent
  | WorkflowEvent
  | EffectEvent
  | RecoveryEvent
  | MemoryEvent;

export const ALL_REQUIRED_EVENTS: readonly string[] = [
  ...REQUIRED_EVENTS.ingress,
  ...REQUIRED_EVENTS.workflow,
  ...REQUIRED_EVENTS.effect,
  ...REQUIRED_EVENTS.recovery,
  ...REQUIRED_EVENTS.memory
];

export const FAILED_PATH_FORBIDDEN_EVENTS: readonly string[] = [
  "attempt.completed"
];

export const SECRET_PATTERNS: readonly RegExp[] = [
  // Structured token formats that should NEVER appear in event payloads
  /bearer\s+[a-zA-Z0-9_\-.]{20,}/i,
  /ghp_[a-zA-Z0-9]{36}/,
  /glpat-[a-zA-Z0-9_\-]{20,}/,
  /xox[bprs]-[a-zA-Z0-9\-]{10,}/,
  /sk-[a-zA-Z0-9]{20,}/,
  /-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/
];
