import type { Intent } from "@core/ingress/intent.js";
import type { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";
import type { WorkflowSelector } from "@core/ingress/workflow-selector.js";

export const workbenchCardWorkflowId = "workbench.card";

export function registerWorkbenchIntentResolver(registry: IntentResolverRegistry): void {
  registry.register({
    id: "workbench-card",
    canResolve(event: TriggerEvent): boolean {
      if (event.source.pluginId !== "feishu" || event.source.triggerType !== "message") {
        return false;
      }
      const chatId = event.external.chatId;
      return typeof chatId === "string" && chatId.length > 0;
    },
    resolve(event: TriggerEvent): Intent {
      const chatId = event.external.chatId as string;
      const resolvedWorkspaceId = event.external.resolvedWorkspaceId;
      if (typeof resolvedWorkspaceId !== "string" || resolvedWorkspaceId.length === 0) {
        throw new Error("resolved workspaceId missing from trigger event");
      }
      const resolvedUserId = event.external.resolvedUserId;
      if (typeof resolvedUserId !== "string" || resolvedUserId.length === 0) {
        throw new Error("resolved userId missing from trigger event");
      }
      const messageId = event.external.messageId;
      if (typeof messageId !== "string" || messageId.length === 0) {
        throw new Error("messageId missing from trigger event");
      }
      return {
        intentId: `intent:${event.triggerEventId}`,
        kind: "workbench_card",
        workspaceId: resolvedWorkspaceId,
        projectId: typeof event.external.resolvedProjectId === "string"
          ? event.external.resolvedProjectId
          : null,
        actor: { kind: "user", userId: resolvedUserId },
        payload: {
          sourcePlugin: "feishu",
          chatId,
          messageId,
          conversationKey: `feishu:${chatId}`
        }
      };
    }
  });
}

export function registerWorkbenchCardWorkflowSelector(selector: WorkflowSelector): void {
  selector.register({
    id: "workbench-card",
    matches: (intent) => intent.kind === "workbench_card",
    definitionId: workbenchCardWorkflowId
  });
}
