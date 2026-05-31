export type ActorSource = "user" | "admin" | "agent" | "system" | "scheduler";

export interface AgentAuthorityRules {
  canApproveMemory(actorSource: ActorSource): boolean;
  canGrantPermissions(actorSource: ActorSource): boolean;
  canCreateControlAction(actorSource: ActorSource): boolean;
  canExecuteEffect(actorSource: ActorSource): boolean;
}

export const defaultAgentAuthority: AgentAuthorityRules = {
  canApproveMemory: (source) => source === "user" || source === "admin",
  canGrantPermissions: (source) => source === "user" || source === "admin",
  canCreateControlAction: (source) => source === "user" || source === "system" || source === "scheduler",
  canExecuteEffect: () => true
};
