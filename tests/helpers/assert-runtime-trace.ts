import { expect } from "vitest";
import { SECRET_PATTERNS } from "@core/runtime/runtime-event-contract.js";

export interface RuntimeTraceEvent {
  type: string;
  payload: unknown;
}

export interface TraceExpectations {
  /** Events that MUST be present in the trace */
  required?: string[];
  /** Events that MUST NOT appear in the trace */
  forbidden?: string[];
  /** Events that must appear in this exact relative order (not necessarily contiguous) */
  ordered?: string[];
  /** If true, assert that no payload matches secret patterns */
  noSecretPayload?: boolean;
  /** Explicit secret values to check are absent from event payloads */
  secretValues?: string[];
}

export function assertRuntimeTrace(
  events: RuntimeTraceEvent[],
  expectations: TraceExpectations
): void {
  const eventTypes = events.map((e) => e.type);

  // Assert all required events are present
  if (expectations.required) {
    for (const required of expectations.required) {
      if (!eventTypes.includes(required)) {
        const nearby = eventTypes
          .filter((t) => t.split(".")[0] === required.split(".")[0])
          .join(", ");
        throw new Error(
          `Required event "${required}" not found in trace. ` +
          `Events present: [${eventTypes.join(", ")}]` +
          (nearby ? `. Related events: [${nearby}]` : "")
        );
      }
    }
  }

  // Assert forbidden events are absent
  if (expectations.forbidden) {
    for (const forbidden of expectations.forbidden) {
      if (eventTypes.includes(forbidden)) {
        throw new Error(
          `Forbidden event "${forbidden}" found in trace. ` +
          `Events present: [${eventTypes.join(", ")}]`
        );
      }
    }
  }

  // Assert ordered events appear in sequence (not necessarily contiguous)
  if (expectations.ordered && expectations.ordered.length > 1) {
    let lastIndex = -1;
    for (const orderedEvent of expectations.ordered) {
      const idx = eventTypes.indexOf(orderedEvent, lastIndex + 1);
      if (idx === -1) {
        throw new Error(
          `Ordered event "${orderedEvent}" not found after preceding events in order. ` +
          `Expected order: [${expectations.ordered.join(", ")}]. ` +
          `Got: [${eventTypes.join(", ")}]`
        );
      }
      lastIndex = idx;
    }
  }

  // Assert no secret patterns in payloads
  if (expectations.noSecretPayload) {
    const payloadsJson = JSON.stringify(events.map((e) => e.payload));
    for (const pattern of SECRET_PATTERNS) {
      pattern.lastIndex = 0; // Reset regex state
      if (pattern.test(payloadsJson)) {
        // Find which field leaked
        for (const event of events) {
          const eventJson = JSON.stringify(event.payload);
          pattern.lastIndex = 0;
          if (pattern.test(eventJson)) {
            throw new Error(
              `Secret pattern "${pattern}" found in event payload of type "${event.type}". ` +
              `Payload: ${eventJson.substring(0, 200)}`
            );
          }
        }
        throw new Error(
          `Secret pattern "${pattern}" found in trace payloads`
        );
      }
    }
  }

  // Assert explicit secret values are absent
  if (expectations.secretValues && expectations.secretValues.length > 0) {
    const payloadsJson = JSON.stringify(events.map((e) => e.payload));
    for (const secret of expectations.secretValues) {
      if (payloadsJson.includes(secret)) {
        for (const event of events) {
          const eventJson = JSON.stringify(event.payload);
          if (eventJson.includes(secret)) {
            throw new Error(
              `Secret value "${secret}" leaked in event payload of type "${event.type}". ` +
              `Payload: ${eventJson.substring(0, 200)}`
            );
          }
        }
        throw new Error(`Secret value "${secret}" leaked in trace payloads`);
      }
    }
  }
}

/**
 * Assert that a failed path does NOT contain `attempt.completed`.
 */
export function assertFailedPath(events: RuntimeTraceEvent[]): void {
  assertRuntimeTrace(events, {
    forbidden: ["attempt.completed"]
  });
}

/**
 * Assert the standard success path for a workflow trace.
 */
export function assertSuccessPath(events: RuntimeTraceEvent[]): void {
  assertRuntimeTrace(events, {
    required: [
      "workflow_instance.created",
      "attempt.started",
      "attempt.completed",
      "workflow_instance.state_changed"
    ],
    ordered: [
      "workflow_instance.created",
      "attempt.started",
      "attempt.completed",
      "workflow_instance.state_changed"
    ]
  });
}
