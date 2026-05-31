export const serviceName = "feegle-agent-gateway";

export type {
  AgentRun,
  RepositoryRecord,
  RequirementCommit,
  RequirementContext,
  RequirementRepository
} from "./domain/models.js";

export type { RequirementStatus } from "./domain/status.js";
export { PrototypeGenerator } from "./prototype/prototype-generator.js";
export type { WritePrototypeSourceInput } from "./prototype/prototype-generator.js";
export {
  parseFeishuCardActionValue,
  parseFeishuCommand,
  type FeishuCommand
} from "./feishu/feishu-gateway.js";
export {
  extractCardActionCommand,
  extractTextMessageCommand,
  type FeishuCardActionTriggerEvent,
  type FeishuCommandEnvelope,
  type FeishuMessageReceiveEvent
} from "./feishu/feishu-event-adapter.js";
export {
  LarkFeishuClient,
  type FeishuClientPort,
  type FeishuOpenApiClient
} from "./feishu/feishu-client.js";
export {
  buildRequirementStatusCard,
  buildWorkflowProgressCard,
  type FeishuInteractiveCard,
  type RequirementStatusCardInput,
  type RequirementStatusCardRepository,
  type WorkflowProgressCardInput,
  type WorkflowProgressStep
} from "./feishu/feishu-card-builder.js";
export { renderFeishuCard } from "./feishu/feishu-card-renderer.js";
export { renderFeishuProgressCard } from "./feishu/feishu-progress-card.js";
export { FeishuCommandResponder } from "./feishu/feishu-command-responder.js";
export { FeegleApp } from "./app/feegle-app.js";
export type { NotificationPort, NotificationTarget } from "./app/notification-port.js";
export { ConfigStore } from "./app/config-store.js";
export { TaskScheduler } from "./scheduler/task-scheduler.js";
export type { Task } from "./scheduler/task.js";
export { StockStore } from "./integrations/stock/stock-store.js";
export type { Quote, QuoteClient } from "./integrations/stock/stock-quote-port.js";
export {
  FeishuLongConnectionRuntime,
  type FeishuCommandHandler,
  type FeishuLongConnectionConfig,
  type FeishuLongConnectionSdk
} from "./feishu/feishu-long-connection-runtime.js";
export {
  parseFeishuPlatformConfig,
  type FeishuPlatformConfig,
  type FeishuPlatformConfigInput,
  type FeishuProgressStyle
} from "./feishu/feishu-platform-config.js";
export { FeishuMessageDedup, isAllowedByList, isOldMessage } from "./feishu/feishu-dedup.js";
export {
  normalizeFeishuTextMessage,
  type FeishuMessageExtractOptions
} from "./feishu/feishu-message-normalizer.js";
export {
  createPlatformCard,
  type PlatformCard,
  type PlatformCardActionLayout,
  type PlatformCardButton,
  type PlatformCardColor,
  type PlatformCardElement,
  type PlatformCardHeader,
  type PlatformCardSelectOption
} from "./platform/platform-card.js";
export {
  parsePlatformAction,
  type PlatformAction,
  type PlatformAskQuestionAction,
  type PlatformCommandAction,
  type PlatformPermissionAction,
  type PlatformUnknownAction
} from "./platform/platform-action.js";
export {
  createPlatformSessionKey,
  type PlatformSessionKeyInput
} from "./platform/platform-session.js";
export type {
  PlatformIncomingMessage,
  PlatformKind,
  PlatformReplyContext,
  PlatformSendResult
} from "./platform/platform-message.js";
export type { PlatformPort } from "./platform/platform-port.js";
export type { PlatformMessageHandler } from "./platform/platform-port.js";
export { createPlatformCommandHandler } from "./platform/platform-command-handler.js";
export {
  createProgressEvent,
  type PlatformProgressEntry,
  type PlatformProgressEvent,
  type PlatformProgressInput,
  type PlatformProgressSnapshot,
  type PlatformProgressSnapshotState,
  type PlatformProgressStatus
} from "./platform/progress.js";
export {
  PlatformActionRouter,
  type PlatformActionContext,
  type PlatformActionHandler
} from "./platform/action-router.js";
export { createAgent, listAgentKinds, registerAgent, agentDisplayName } from "./agent/agent-registry.js";
export type { AgentFactory } from "./agent/agent-registry.js";
export { hasCapability } from "./agent/agent-capabilities.js";
export type {
  AgentDoctorInfo,
  CommandProvider,
  ContextCompressor,
  DoctorCheckResult,
  DoctorChecker,
  DoctorStatus,
  HistoryEntry,
  HistoryProvider,
  MemoryFileProvider,
  ModelOption,
  ModelSwitcher,
  ModeSwitcher,
  PermissionModeInfo,
  ReasoningEffortSwitcher,
  SkillProvider,
  ToolAuthorizer,
  UsageBucket,
  UsageCredits,
  UsageReport,
  UsageReporter,
  UsageWindow
} from "./agent/agent-capabilities.js";
export { HookManager, HOOK_EVENTS } from "./app/hooks.js";
export type { HookConfig, HookEventPayload, HookEventType, HookHandlerType } from "./app/hooks.js";
