export const requirementStatuses = [
  "created",
  "repo_selected",
  "requirement_received",
  "branch_suggested",
  "branch_created",
  "requirement_materialized",
  "prototype_generated",
  "prototype_reviewing",
  "plan_generated",
  "plan_confirmed",
  "dev_running",
  "committed",
  "push_ready",
  "pushed",
  "closed"
] as const;

export type RequirementStatus = (typeof requirementStatuses)[number];

const allowedTransitions: Record<RequirementStatus, readonly RequirementStatus[]> = {
  created: ["repo_selected", "closed"],
  repo_selected: ["requirement_received", "closed"],
  requirement_received: ["branch_suggested", "closed"],
  branch_suggested: ["branch_created", "closed"],
  branch_created: ["requirement_materialized", "closed"],
  requirement_materialized: ["prototype_generated", "closed"],
  prototype_generated: ["prototype_reviewing", "closed"],
  prototype_reviewing: ["plan_generated", "closed"],
  plan_generated: ["plan_confirmed", "closed"],
  plan_confirmed: ["dev_running", "closed"],
  dev_running: ["committed", "closed"],
  committed: ["push_ready", "closed"],
  push_ready: ["pushed", "closed"],
  pushed: ["closed"],
  closed: []
};

export function canTransition(from: RequirementStatus, to: RequirementStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertTransition(from: RequirementStatus, to: RequirementStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid requirement transition: ${from} -> ${to}`);
  }
}
