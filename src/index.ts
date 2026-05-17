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
