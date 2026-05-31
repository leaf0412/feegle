# Project Structure

Feegle uses directory boundaries as architecture boundaries.

## Layers

- `src/core/*`: platform-neutral workflow runtime, control, memory, recovery, diagnostics, artifacts, and security.
- `src/infra/*`: app shell, boot phases, runtime DB, config, filesystem, and Git helpers.
- `src/platform/*`: platform-neutral command/message/card/action contracts.
- `src/integrations/*`: external system adapters and external payload formats.
- `src/features/*`: user-visible product workflows and capability modules.
- `src/resources/*`: persisted business resources such as workspaces and repository bindings.
- `src/plugins/*`: thin contribution assembly modules.
- `src/domain/*`: shared domain types that have not yet moved into a narrower module.

## Current Migration Map

| Current | Target |
| --- | --- |
| `src/runtime` | `src/core/runtime` |
| `src/control` | `src/core/control` |
| `src/memory` | `src/core/memory` |
| `src/recovery` | `src/core/recovery` |
| `src/security` | `src/core/security` |
| `src/artifacts` | `src/core/artifacts` |
| `src/diagnostics` | `src/core/diagnostics` |
| `src/app` | `src/infra/app` |
| `src/boot` | `src/infra/boot` |
| `src/git` | `src/infra/git` |
| `src/feishu` | `src/integrations/feishu` |
| `src/gitlab` | `src/integrations/gitlab` |
| `src/webhook` | `src/integrations/webhook` |
| `src/stock` | `src/integrations/stock` |
| `src/scheduler` | `src/features/scheduler` |
| `src/automation` | `src/features/automation` |
| `src/workbench` | `src/features/workbench` |
| `src/requirements` | `src/features/requirements` |
| `src/prototype` | `src/features/prototype` |
| `src/workspace` | `src/resources/workspace` |
| `src/repositories` | `src/resources/repositories` |

## Rule

Do not add import aliases for old top-level folders. Aliases name the target structure only.
