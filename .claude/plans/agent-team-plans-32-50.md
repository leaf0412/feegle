# Agent Team Execution Plan: Plans 32-50

## Context

- **Completed:** Plans 01-31 (987 tests pass, typecheck clean)
- **Remaining:** Plans 32-50 (19 plans)
- **Plan sizes:** Most are 1.6-6.6KB — small, focused completion plans

## Dependency Map (simplified)

```
Wave 1:  33 ─┬─ 34 ────────────── 35 (docs, anytime)
             │
Wave 2:      ├─ 36 ─┬─ 37 ─┐
             │      │       ├─ 39 ─┬─ 43 ── 44 ─┬─ 45 ─┬─ 46 ┐
             │      └─ 38 ─┘       │             │      │     ├─ 49 ─┐
             │                     │             │      └─ 48 ┘     │
Wave 2b:     ├─ 41 ── 42 ─────────┘             │                  │
             │                                   │                  │
Wave 3:      └─ 40 (needs 34+36) ───────────────┘                  │
                                                                   │
Wave 4:      └─ 47 (needs 38+40+44)                                │
                                                                   │
Final:       32 (gate) + 50 (matrix) ←─────────────────────────────┘
```

## Execution Waves

### Wave 1 (Parallel — 3 agents)
| Plan | Est. Effort | Description |
|------|-------------|-------------|
| **33** | Medium | Move `src/agent`→`@integrations/agent`, `src/ingress`→`@core/ingress`, `src/operations`→`@core/operations` + tighten boundary guard |
| **34** | Medium | Add `WebhookIngressService` that enforces signature verification before ingress dispatch |
| **35** | Small | Move status doc to correct path, refresh content for plans 25-35 |

### Wave 2 (After 33 — parallel groups)
| Group | Plans | Depends On |
|-------|-------|------------|
| A | **36** workspace identity + **37** agent provider (sequential) | 33 |
| B | **38** policy engine | 33 (paths) |
| C | **41** queue worker + **42** concurrency (sequential) | 33 |

### Wave 3 (After 36+38 — parallel)
| Plan | Description | Depends On |
|------|-------------|------------|
| **39** | Permission boundary enforcement | 37, 38 |
| **40** | Secret reference resolver | 34, 36 |

### Wave 4 (After 39+40+41 — serial spine begins)
| Plan | Description | Depends On |
|------|-------------|------------|
| **43** | Effect execution contract | 39, 40, 41 |
| **44** | Runtime event trace contract | 43 |
| **45** | Recovery workflow completion | 42, 43, 44 |

### Wave 5 (After 45 — parallel)
| Plan | Description | Depends On |
|------|-------------|------------|
| **46** | Memory governance | 38, 39, 45 |
| **47** | Artifact retention redaction | 38, 40, 44 |
| **48** | Plugin manifest capability | 39 |

### Wave 6 (After 46+48 — near final)
| Plan | Description | Depends On |
|------|-------------|------------|
| **49** | Control plane resource actions | 36, 37, 38, 39, 45, 46 |

### Wave 7 (Final gate)
| Plan | Description | Depends On |
|------|-------------|------------|
| **32** | Acceptance gate (scenario matrix, plugin/command/diag/trace/failure/fallback tests, verify:platform) | 25-31, 33-35 |
| **50** | Platform acceptance matrix (final verify:platform gate) | 31-49 |

## Agent Dispatch Strategy

Each wave dispatches agents in parallel. Within a wave, plans with mutual deps run sequentially in the same agent.

### Wave 1: 3 agents
- Agent A: Plan 33 (module boundary finalization)
- Agent B: Plan 34 (webhook dispatch security)
- Agent C: Plan 35 (status doc repair)

### Wave 2: 3 agents
- Agent D: Plans 36+37 (identity binding → agent provider)
- Agent E: Plan 38 (policy engine)
- Agent F: Plans 41+42 (queue worker → concurrency)

### Wave 3: 2 agents
- Agent G: Plan 39 (permission enforcement)
- Agent H: Plan 40 (secret resolver)

### Wave 4: 1 agent
- Agent I: Plans 43+44+45 (effect → trace → recovery — serial spine)

### Wave 5: 3 agents
- Agent J: Plan 46 (memory governance)
- Agent K: Plan 47 (artifact retention)
- Agent L: Plan 48 (plugin manifest)

### Wave 6: 1 agent
- Agent M: Plan 49 (control plane resource actions)

### Wave 7: 2 agents
- Agent N: Plan 32 (acceptance gate)
- Agent O: Plan 50 (final matrix)

## Total: ~8 waves, ~15 agent invocations, each wave verifies with typecheck+tests
