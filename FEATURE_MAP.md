# FEATURE_MAP

代码导览。把当前按"技术种类"切分（kind 在 `scheduler/kinds/`、命令在 `platform/commands/`）的实现，按"功能"重新拼回去——一个 feature = 一组语义上属于同一功能的 kind + 命令 + schema。

读这一份文件之后，你应该能：
1. 在表格里定位某个 feature 跨哪些文件
2. 在 [Add Cookbook](#add-cookbook) 找到新增同类东西的改动清单
3. 在 [Review Notes](#review-notes) 看到关于"是否要做 Feature 内聚重构"的待复盘记录

## Feature Inventory

| Feature | Kind 实现 | 用户命令 | 命令 handler | 注册入口 | 关键 deps |
|---|---|---|---|---|---|
| **heartbeat** | `src/scheduler/kinds/heartbeat-kind.ts` | — | — | `scheduler/default-handler-kind-modules.ts` | taskRegistry |
| **stock-monitor** | `src/scheduler/kinds/stock-monitor-kind.ts` | `/bind_stocks` `/unbind_stocks` `/stocks` | `platform/commands/stock/stock-command-handlers.ts`（前 3 个 class） | kind: 同上一行；命令: `platform/commands/scheduler-command-module.ts` | stockStore, quote |
| **stock-portfolio-snapshot** | `src/scheduler/kinds/stock-portfolio-snapshot-kind.ts` | `/portfolio set/list/clear/unset` | `platform/commands/stock/stock-command-handlers.ts`（后 4 个 class） | kind: `scheduler/default-handler-kind-modules.ts`；命令: `scheduler-command-module.ts` | stockStore, quote |
| **stock-advisor** | `src/scheduler/kinds/stock-advisor-kind.ts` | — | — | `scheduler/default-handler-kind-modules.ts` | stockStore, quote, agents |
| **agent-prompt** | `src/scheduler/kinds/agent-prompt-kind.ts` | — | — | `scheduler/default-handler-kind-modules.ts` | agents |
| **cron-admin** | — | `/cron list/show/add/edit/remove/pause/resume/run-now/set-target/history` | `platform/commands/cron/cron-command-handlers.ts` | `platform/commands/scheduler-command-module.ts` | taskRegistry, scheduler, kinds, runsLog |
| **error-target** | — | `/error_target set/show/clear` | `platform/commands/setup/error-target-command.ts` | `platform/commands/scheduler-command-module.ts` | configStore |
| **repo** | — | `/repo list/add/remove/scan/show/clear` `/bind_repo <url>` `/unbind_repo <url\|#\|name\|id>`（已实现）<br>+ `/shifu`（planned） | `platform/commands/repo-list-command.ts` `repo/bind-repo-command.ts` `repo/unbind-repo-command.ts` | `platform/commands/repo-command-module.ts` | repositories |
| **system** | — | `/help` `/whoami`（已实现）<br>+ `/ping` `/info` `/status` `/doctor` `/usage` `/version` `/upgrade` `/restart` `/lang`（planned） | `platform/commands/help-command.ts` `whoami-command.ts` `command-detail.ts` | `platform/commands/system-command-module.ts` | ownerEmails, userDirectory |
| **agent-provider** | — | `/provider list/register/unregister/use`（已实现） | `platform/commands/provider/provider-command-handlers.ts` | `platform/commands/provider-command-module.ts` | providers, providerStore |
| **planned**（占位） | — | session/setup/knowledge 各组未实现命令 + agent group 剩余占位（`/model` `/reasoning` `/mode` `/memory` …） | （无 handler） | `platform/commands/planned-command-module.ts` | — |

> **agent-provider 负载均衡**：注册 ≥2 个 provider 时，自然语言 chat 按"最少在飞 + round-robin"在各 provider 间分摊，并按会话黏（session 的 agentKind 固定）。`active`（/provider use）此时仅作为配置类命令与 cron 的默认目标，不再决定 chat 走向。

> **repo 绑定与分支解耦**：`/bind_repo <url>` 把仓库绑到当前 scope（群=chatId，单聊=user:&lt;id&gt;，见 `resolveBindingScopeKey`）；未注册的 url 自动注册（不联网探测，占位 `defaultBaseBranch=main`）。`/unbind_repo <url|#|name|id>` 取消单个、`/repo clear` 清空。ChatBinding 只存 `repositoryIds`（branch 已移除）。群聊未绑定仓库时，自然语言 chat 被拦截并提示 `/bind_repo`（见 `feishu-command-responder.ts` 的 `dispatchChat`）。

> ⚠️ 注意 `scheduler-command-module.ts` 一个 module 同时覆盖了 cron-admin / stock-monitor / stock-portfolio / error-target 四个 feature 的命令注册——这是当前最反内聚的位置。

## Cross-cutting Infrastructure

| 扩展点 | 默认模块 | 自定义钩子（FeegleAppDeps） |
|---|---|---|
| Slash command 注册 | `platform/commands/default-slash-command-modules.ts` | `slashCommandModules` |
| Handler kind 注册 | `scheduler/default-handler-kind-modules.ts` | `handlerKindModules` |
| Quote client（行情源） | `stock/default-quote-client-modules.ts`（仅 sina） | `quoteClientModules` + `quoteClientId` |
| Notification adapter | `app/build-notification-broker.ts`（仅 feishu 默认） | `notificationAdapterModules` |

所有四类 registry 都遵循 ADR 0001：`build<X>Registry({ modules })` 形状 + boot 后 `freeze()` + 缺 dep 抛错。Slash command 还多了三动词（`declarePlanned` / `registerCommand` / `registerInternalHandler`）。

## Add Cookbook

### 加一条 slash command（已有 group）
> 例：在 cron group 加 `/cron stats`
1. 在 `platform/commands/cron/cron-command-handlers.ts` 加一个 class，继承 `CronCommand`
2. 在 `platform/commands/scheduler-command-module.ts`：top import + `cronDefinitions` 加一条 `defineSlashCommand` + `register` 函数 body 加一行 `registry.registerCommand`
3. README "Scheduler And Stock Commands" 段加一行
4. 测试

### 加一条 slash command（新 group）
1. 新建 `platform/commands/<group>-command-module.ts`，模仿 `repo-command-module.ts`
2. 在 `default-slash-command-modules.ts` 的 `defaultModuleFactories` 数组里加一行
3. README 加一节

### 加一个 handler kind
> 例：加 `daily-summary` kind
1. 新建 `scheduler/kinds/<id>-kind.ts`，实现 `HandlerKind` 接口（参考 `heartbeat-kind.ts`）
2. 在 `scheduler/default-handler-kind-modules.ts`：加一个 `xxxKindModule()` 工厂 + `defaultModuleFactories` 数组加一行
3. 如果引入新 dep（不在现有 taskRegistry/stockStore/quote/agents 里）：改 `scheduler/handler-kind-module.ts` 的 `HandlerKindRegistryDeps` interface → 顺着改 `app/feegle-app.ts` 里 `buildHandlerKindRegistry({...})` 调用
4. 测试

### 加一个 env 变量
> 例：加 `FEISHU_SOMETHING`
1. 在 `feishu/feishu-platform-config.ts`：`FeishuPlatformConfigInput` 加 input 字段 + `FeishuPlatformConfig` 加 output 字段 + `parseFeishuPlatformConfig` 加 default-resolve
2. 在 `feishu/feishu-long-connection-entry.ts` 调用处加一行 `process.env.FEISHU_SOMETHING`（必要时套 `readBooleanEnv` / `readRequiredEnv`）
3. README "Environment Variables" 段加一行

### 加一个 quote client（行情源）
1. 新建 `stock/<name>-quote-client.ts` 实现 `QuoteClient` 接口
2. 模仿 `stock/default-quote-client-modules.ts` 的 module 形状
3. 用 `quoteClientModules` 钩子注入到 FeegleApp；按需用 `quoteClientId` 切换默认

### 加一个 notification adapter（推送通道）
1. 新建 adapter 实现 `app/notification-port.ts` 的 `NotificationPort`
2. 用 `app/notification-adapter-module.ts` 的 module 形状包装
3. 用 `notificationAdapterModules` 钩子注入到 FeegleApp

## Review Notes

### 2026-05-19 — Feature 内聚重构待复盘

讨论过把目前"kind 在 scheduler/、命令在 platform/commands/"的反内聚切法重构成"每个 feature 一个文件，含 kind + 命令 + schema"。最终**选择先观察不重构**，原因：

- ADR 0001 才 5 天前刚做完，连续重构会让 commit history 反复推翻自己
- 当前 5 个 kind + ~20 条已实现命令的规模，"加多处"的痛感被列表格放大了
- 这份 FEATURE_MAP.md 就是为了零代码成本解决"AI agent 理解 feature"诉求

**复盘日期：2026-07-19**（约 2 个月后）

**提前触发条件**（任一满足即可提前复盘）：
- 加新 kind ≥ 3 个
- 加新 slash command ≥ 8 条
- "改 dep 顺着改 HandlerKindModuleDeps → feegle-app.ts" 的痛出现 ≥ 2 次
- `scheduler-command-module.ts` 文件长度 ≥ 200 行（目前 ~110）

**复盘要看的方向**：是否值得把 feature 内聚成单文件（每个 feature 一个 `.ts`，含 kind + 命令 + paramsSchema + 自描述 deps），feegle-app 用一个 for 循环装配（参考当次讨论方向 D）。

**便携优化**（不依赖重构、可随时单独做）：
- args schema DSL：消灭 `cron-command-handlers.ts` 里 `parseArgs/parseKeyValues/coerceValue` 的重复，新写命令时直接受益
