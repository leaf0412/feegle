import type { RequirementExecutionRecord } from "./requirement-execution-models.js";

export class RequirementExecutionStore {
  private readonly records = new Map<string, RequirementExecutionRecord>();

  createPendingExecution(input: {
    requirementId: string;
    planVersion: number;
    requestedByUserId: string;
  }): RequirementExecutionRecord {
    const now = new Date().toISOString();
    const record: RequirementExecutionRecord = {
      requirementId: input.requirementId,
      planVersion: input.planVersion,
      requestedByUserId: input.requestedByUserId,
      status: "pending_approval",
      createdAt: now,
      updatedAt: now
    };
    this.records.set(input.requirementId, record);
    return record;
  }

  approve(input: {
    requirementId: string;
    approvedByUserId: string;
  }): RequirementExecutionRecord {
    const record = this.records.get(input.requirementId);
    if (record === undefined) {
      throw new Error(`Requirement execution not found: ${input.requirementId}`);
    }
    const updated: RequirementExecutionRecord = {
      ...record,
      status: "approved",
      approvedByUserId: input.approvedByUserId,
      updatedAt: new Date().toISOString()
    };
    this.records.set(input.requirementId, updated);
    return updated;
  }

  markExecuting(input: {
    requirementId: string;
    approvedByUserId: string;
    worktreePath: string;
    headBranch: string;
  }): RequirementExecutionRecord {
    const record = this.records.get(input.requirementId);
    if (record === undefined) {
      throw new Error(`Requirement execution not found: ${input.requirementId}`);
    }
    if (record.status !== "approved") {
      throw new Error(
        `Execution must be approved before it can start: ${input.requirementId}`
      );
    }
    const updated: RequirementExecutionRecord = {
      ...record,
      status: "executing",
      worktreePath: input.worktreePath,
      headBranch: input.headBranch,
      updatedAt: new Date().toISOString()
    };
    this.records.set(input.requirementId, updated);
    return updated;
  }

  markImplementationReady(input: {
    requirementId: string;
    summary: string;
    diffStats: { filesChanged: number; insertions: number; deletions: number };
  }): RequirementExecutionRecord {
    const record = this.records.get(input.requirementId);
    if (record === undefined) {
      throw new Error(`Requirement execution not found: ${input.requirementId}`);
    }
    if (record.status !== "executing") {
      throw new Error(
        `Execution must be in executing state to mark implementation ready: ${input.requirementId}`
      );
    }
    const updated: RequirementExecutionRecord = {
      ...record,
      status: "implementation_ready",
      summary: input.summary,
      diffStats: input.diffStats,
      updatedAt: new Date().toISOString()
    };
    this.records.set(input.requirementId, updated);
    return updated;
  }

  latest(requirementId: string): RequirementExecutionRecord | undefined {
    return this.records.get(requirementId);
  }
}
