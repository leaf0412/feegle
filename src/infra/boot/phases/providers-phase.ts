import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import type { Contributions } from "../feegle-plugin.js";
import type { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import { AgentConversationService } from "@core/agent-conversation/agent-conversation-service.js";
import { buildNotificationBroker } from "../../app/build-notification-broker.js";
import { GitService } from "../../git/git-service.js";
import { GitLabClient } from "@integrations/gitlab/gitlab-client.js";
import { GitLabFollowStore } from "@integrations/gitlab/gitlab-follow-store.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import { buildQuoteClientRegistry } from "@integrations/stock/build-quote-client-registry.js";
import { resolveGitLabToken } from "./resolve-gitlab-token.js";
import { resolveWorkspaceDir } from "../../app/workspace-dir.js";

export interface ProvidersPhaseDeps {
  feegleHome: string;
  feishuClient: FeishuClientPort;
  quoteClientId: string;
  contributions: Contributions;
  resolveAgents(ctx: BootContext): Promise<AgentProviderRegistry>;
}

export function providersPhase(deps: ProvidersPhaseDeps): BootPhase {
  return {
    name: "providers",
    run: async (ctx: BootContext) => {
      const agents = await deps.resolveAgents(ctx);
      ctx.provide("agents", agents);
      const configStore = ctx.require("configStore");
      ctx.provide("agentConversationService", new AgentConversationService({
        providers: agents,
        history: ctx.require("chatHistory"),
        sessionStore: ctx.require("sessionStore"),
        workspaceDir: resolveWorkspaceDir(deps.feegleHome, configStore.get().defaultWorkspace)
      }));
      const gitlabConfig = configStore.get().gitlab;
      const gitlabToken = resolveGitLabToken(gitlabConfig);
      ctx.provide("gitlab", new GitLabClient(gitlabToken));
      ctx.provide("gitlabFollowStore", new GitLabFollowStore(ctx.require("runtimeDb")));
      ctx.provide("gitService", new GitService());
      ctx.provide(
        "notify",
        buildNotificationBroker({
          feishuClient: deps.feishuClient,
          modules: deps.contributions.notificationAdapters
        })
      );
      const quoteRegistry = buildQuoteClientRegistry({ modules: deps.contributions.quoteClients });
      const quote = quoteRegistry.get(deps.quoteClientId);
      if (!quote) {
        throw new Error(`Quote client not registered: ${deps.quoteClientId}`);
      }
      ctx.provide("quote", quote);
      // plugins that supply capabilities in this phase (e.g. Feishu → userDirectory)
      for (const provision of deps.contributions.provisions.filter((p) => p.phase === "providers")) {
        await provision.run(ctx);
      }
    }
  };
}
