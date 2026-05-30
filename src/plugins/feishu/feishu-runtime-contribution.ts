import type { RuntimeContributionModule } from "../../boot/feegle-plugin.js";

export function feishuRuntimeContribution(input: { workspaceId: string }): RuntimeContributionModule {
  return {
    id: "feishu-runtime",
    register: (ctx) => {
      ctx.intentResolvers.register({
        id: "feishu-message",
        canResolve: (event) => event.source.pluginId === "feishu" && event.source.triggerType === "message",
        resolve: (event) => ({
          intentId: `intent:${event.triggerEventId}`,
          kind: "chat",
          workspaceId: input.workspaceId,
          projectId: null,
          actor:
            event.actorHint && typeof event.actorHint.userId === "string"
              ? { kind: "user", userId: event.actorHint.userId }
              : { kind: "system" },
          payload: event.external
        })
      });
      ctx.workflowSelector.register({
        id: "feishu-chat",
        matches: (intent) => intent.kind === "chat",
        definitionId: "feishu.chat.workflow"
      });
      ctx.workflows.register({
        definitionId: "feishu.chat.workflow",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [{ stepId: "record", run: () => ({ kind: "complete" }) }]
      });
    }
  };
}
