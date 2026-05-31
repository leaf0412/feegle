import type { RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";
import type { GitLabClient } from "@integrations/gitlab/gitlab-client.js";

export function gitlabRuntimeContribution(getClient: () => GitLabClient): RuntimeContributionModule {
  return {
    id: "gitlab-runtime",
    register: (ctx) => {
      ctx.intentResolvers.register({
        id: "gitlab-review",
        canResolve: (event) => event.source.pluginId === "gitlab",
        resolve: (event) => ({
          intentId: `intent:${event.triggerEventId}`,
          kind: "chat",
          workspaceId: workspaceIdFromEvent(event),
          projectId: projectIdFromEvent(event),
          actor: { kind: "system" },
          payload: event.external
        })
      });

      ctx.workflowSelector.register({
        id: "gitlab-review",
        matches: (intent) => intent.kind === "chat",
        definitionId: "gitlab.review.workflow"
      });

      ctx.workflows.register({
        definitionId: "gitlab.review.workflow",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "review",
            run: async (stepCtx) => {
              const payload = stepCtx.input as Record<string, unknown>;
              if (payload.text) {
                await stepCtx.executeEffect({
                  pluginId: "gitlab",
                  effectType: "post_comment",
                  input: { body: payload.text }
                });
              }
              return { kind: "complete", output: { reviewed: true } };
            }
          }
        ]
      });

      ctx.effectHandlers.register({
        pluginId: "gitlab",
        effectType: "post_comment",
        execute: async (effect) => {
          const input = effect.input as {
            host?: string;
            namespace?: string;
            project?: string;
            issueIid?: number;
            body?: string;
          };
          if (!input.host || !input.namespace || !input.project) {
            throw new Error(
              "Missing required gitlab fields: host, namespace, project (strings), issueIid (number)"
            );
          }
          if (typeof input.issueIid !== "number") {
            throw new Error("Missing required field: issueIid (number)");
          }
          if (!input.body || typeof input.body !== "string") {
            throw new Error("Missing required field: body (string)");
          }
          const client = getClient();
          await client.postNote(
            { host: input.host, namespace: input.namespace, project: input.project, issueIid: input.issueIid },
            input.body
          );
          return { posted: true, body: input.body };
        }
      });

      ctx.effectHandlers.register({
        pluginId: "gitlab",
        effectType: "update_status",
        execute: async (effect) => {
          const input = effect.input as {
            host?: string;
            namespace?: string;
            project?: string;
            issueIid?: number;
            status?: string;
          };
          if (!input.host || !input.namespace || !input.project) {
            throw new Error(
              "Missing required gitlab fields: host, namespace, project (strings), issueIid (number)"
            );
          }
          if (typeof input.issueIid !== "number") {
            throw new Error("Missing required field: issueIid (number)");
          }
          if (!input.status || typeof input.status !== "string") {
            throw new Error("Missing required field: status (string)");
          }
          const client = getClient();
          await client.updateIssueStatus(
            { host: input.host, namespace: input.namespace, project: input.project, issueIid: input.issueIid },
            input.status
          );
          return { updated: true, status: input.status };
        }
      });
    }
  };
}

function workspaceIdFromEvent(event: TriggerEvent): string {
  const workspaceId = event.external.resolvedWorkspaceId;
  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    throw new Error("resolved workspaceId missing from trigger event");
  }
  return workspaceId;
}

function projectIdFromEvent(event: TriggerEvent): string | null {
  const projectId = event.external.resolvedProjectId;
  return typeof projectId === "string" ? projectId : null;
}
