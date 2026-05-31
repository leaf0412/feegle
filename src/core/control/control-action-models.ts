import { z } from "zod";

export const ApproveStepPayloadSchema = z.object({
  stepStateId: z.string().min(1),
  comment: z.string().optional()
});

export const RejectStepPayloadSchema = z.object({
  stepStateId: z.string().min(1),
  reason: z.string()
});

export const ResumeWorkflowPayloadSchema = z.object({
  workflowInstanceId: z.string().min(1)
});

export const CancelWorkflowPayloadSchema = z.object({
  workflowInstanceId: z.string().min(1),
  reason: z.string().optional()
});

export const TriggerRecoveryPayloadSchema = z.object({
  workflowInstanceId: z.string().min(1),
  runAttemptId: z.string().min(1)
});

export const ConfirmMemoryPayloadSchema = z.object({
  memoryId: z.string().min(1)
});

export const DeleteMemoryPayloadSchema = z.object({
  memoryId: z.string().min(1)
});

export const BindWorkspacePayloadSchema = z.object({
  workspaceId: z.string().min(1),
  conversationId: z.string().min(1)
});

export const RegisterProviderPayloadSchema = z.object({
  providerId: z.string().min(1),
  label: z.string().min(1),
  command: z.string().min(1),
  kind: z.string().optional()
});

export const DisableProviderPayloadSchema = z.object({
  providerId: z.string().min(1)
});

export const UpdatePolicyPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  policyId: z.string().min(1),
  rule: z.record(z.unknown())
});

export const PauseSchedulePayloadSchema = z.object({
  scheduleId: z.string().min(1)
});

export const ResumeSchedulePayloadSchema = z.object({
  scheduleId: z.string().min(1)
});

export const RevokeMemoryPayloadSchema = z.object({
  memoryId: z.string().min(1)
});

export const ApproveRecoveryPayloadSchema = z.object({
  recoveryId: z.string().min(1)
});

export type ApproveStepPayload = z.infer<typeof ApproveStepPayloadSchema>;
export type RejectStepPayload = z.infer<typeof RejectStepPayloadSchema>;
export type ResumeWorkflowPayload = z.infer<typeof ResumeWorkflowPayloadSchema>;
export type CancelWorkflowPayload = z.infer<typeof CancelWorkflowPayloadSchema>;
export type TriggerRecoveryPayload = z.infer<typeof TriggerRecoveryPayloadSchema>;
export type ConfirmMemoryPayload = z.infer<typeof ConfirmMemoryPayloadSchema>;
export type DeleteMemoryPayload = z.infer<typeof DeleteMemoryPayloadSchema>;
export type BindWorkspacePayload = z.infer<typeof BindWorkspacePayloadSchema>;
export type RegisterProviderPayload = z.infer<typeof RegisterProviderPayloadSchema>;
export type DisableProviderPayload = z.infer<typeof DisableProviderPayloadSchema>;
export type UpdatePolicyPayload = z.infer<typeof UpdatePolicyPayloadSchema>;
export type PauseSchedulePayload = z.infer<typeof PauseSchedulePayloadSchema>;
export type ResumeSchedulePayload = z.infer<typeof ResumeSchedulePayloadSchema>;
export type RevokeMemoryPayload = z.infer<typeof RevokeMemoryPayloadSchema>;
export type ApproveRecoveryPayload = z.infer<typeof ApproveRecoveryPayloadSchema>;

export const actionTypeSchemas = {
  approve_step: ApproveStepPayloadSchema,
  reject_step: RejectStepPayloadSchema,
  resume_workflow: ResumeWorkflowPayloadSchema,
  cancel_workflow: CancelWorkflowPayloadSchema,
  trigger_recovery: TriggerRecoveryPayloadSchema,
  confirm_memory: ConfirmMemoryPayloadSchema,
  delete_memory: DeleteMemoryPayloadSchema,
  bind_workspace: BindWorkspacePayloadSchema,
  register_provider: RegisterProviderPayloadSchema,
  disable_provider: DisableProviderPayloadSchema,
  update_policy: UpdatePolicyPayloadSchema,
  pause_schedule: PauseSchedulePayloadSchema,
  resume_schedule: ResumeSchedulePayloadSchema,
  revoke_memory: RevokeMemoryPayloadSchema,
  approve_recovery: ApproveRecoveryPayloadSchema
} as const;

export type ActionType = keyof typeof actionTypeSchemas;

export function parsePayload(
  actionType: string,
  payload: Record<string, unknown>
): { ok: true; value: unknown } | { ok: false; error: string } {
  const schema = actionTypeSchemas[actionType as ActionType];
  if (!schema) {
    return { ok: false, error: `unknown action type: ${actionType}` };
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => i.message).join("; ") };
  }
  return { ok: true, value: result.data };
}
