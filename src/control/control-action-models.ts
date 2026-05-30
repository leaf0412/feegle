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

export type ApproveStepPayload = z.infer<typeof ApproveStepPayloadSchema>;
export type RejectStepPayload = z.infer<typeof RejectStepPayloadSchema>;
export type ResumeWorkflowPayload = z.infer<typeof ResumeWorkflowPayloadSchema>;
export type CancelWorkflowPayload = z.infer<typeof CancelWorkflowPayloadSchema>;
export type TriggerRecoveryPayload = z.infer<typeof TriggerRecoveryPayloadSchema>;
export type ConfirmMemoryPayload = z.infer<typeof ConfirmMemoryPayloadSchema>;
export type DeleteMemoryPayload = z.infer<typeof DeleteMemoryPayloadSchema>;

export const actionTypeSchemas = {
  approve_step: ApproveStepPayloadSchema,
  reject_step: RejectStepPayloadSchema,
  resume_workflow: ResumeWorkflowPayloadSchema,
  cancel_workflow: CancelWorkflowPayloadSchema,
  trigger_recovery: TriggerRecoveryPayloadSchema,
  confirm_memory: ConfirmMemoryPayloadSchema,
  delete_memory: DeleteMemoryPayloadSchema
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
