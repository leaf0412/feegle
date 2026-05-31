# Import Aliases

Aliases mirror the target directory structure. Do not create aliases for legacy top-level folders.

Use aliases for cross-boundary imports:

```ts
import { RuntimeStore } from "@core/runtime/runtime-store.js";
import { openRuntimeDb } from "@infra/app/runtime-db.js";
import { FeishuChatHandler } from "@integrations/feishu/feishu-chat-handler.js";
```

Use relative imports inside the same module:

```ts
import { encodeJson } from "./runtime-store.js";
```

Do not use deep cross-boundary relative imports:

```ts
import { RuntimeStore } from "../../core/runtime/runtime-store.js";
```
