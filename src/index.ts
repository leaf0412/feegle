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
export { FeishuCommandResponder } from "./feishu/feishu-command-responder.js";
export {
  FeishuLongConnectionRuntime,
  type FeishuCommandHandler,
  type FeishuLongConnectionConfig,
  type FeishuLongConnectionSdk
} from "./feishu/feishu-long-connection-runtime.js";
