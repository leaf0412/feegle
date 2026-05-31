import type { RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";
import type { AgentConversationResult } from "./agent-conversation-models.js";

export function agentConversationRuntimeContribution(): RuntimeContributionModule {
  return {
    id: "agent-conversation-runtime",
    register: (ctx) => {
      ctx.workflows.register({
        definitionId: "agent.conversation.workflow",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "run-agent",
            run: async (stepCtx) => {
              const payload = stepCtx.input as Record<string, unknown>;
              const sourcePlugin = requiredString(payload.sourcePlugin, "sourcePlugin");
              const chatId = optionalString(payload.chatId);
              const messageId = optionalString(payload.messageId);
              const result = await requireAgentConversationService(ctx).run({
                workspaceId: requiredString(payload.resolvedWorkspaceId, "resolvedWorkspaceId"),
                projectId: optionalString(payload.resolvedProjectId) ?? null,
                conversationKey: requiredString(payload.conversationKey, "conversationKey"),
                sessionKey: requiredString(payload.sessionKey, "sessionKey"),
                userId: requiredString(payload.resolvedUserId, "resolvedUserId"),
                userText: requiredString(payload.text, "text"),
                source: {
                  pluginId: sourcePlugin,
                  chatId,
                  messageId
                }
              });

              if (payload.shouldRespond !== false) {
                await stepCtx.executeEffect({
                  pluginId: sourcePlugin,
                  effectType: "agent_conversation.render",
                  input: {
                    chatId,
                    messageId,
                    result
                  }
                });
              }

              return { kind: "complete", output: result };
            }
          }
        ]
      });
    }
  };
}

function requireAgentConversationService(ctx: Parameters<RuntimeContributionModule["register"]>[0]) {
  if (!ctx.agentConversationService) {
    throw new Error("agentConversationService is required for agent.conversation.workflow");
  }
  return ctx.agentConversationService;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required field: ${field}`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export type AgentConversationWorkflowOutput = AgentConversationResult;
