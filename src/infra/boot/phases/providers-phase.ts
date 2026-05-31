import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import type { Contributions } from "../feegle-plugin.js";
import type { AgentProviderRegistry } from "../../../agent/agent-provider-registry.js";
import { buildNotificationBroker } from "../../app/build-notification-broker.js";
import { GitService } from "../../git/git-service.js";
import { GitLabClient } from "../../../integrations/gitlab/gitlab-client.js";
import { GitLabFollowStore } from "../../../integrations/gitlab/gitlab-follow-store.js";
import type { FeishuClientPort } from "../../../feishu/feishu-client.js";
import { buildQuoteClientRegistry } from "../../../integrations/stock/build-quote-client-registry.js";

export interface ProvidersPhaseDeps {
  feishuClient: FeishuClientPort;
  quoteClientId: string;
  contributions: Contributions;
  resolveAgents(ctx: BootContext): Promise<AgentProviderRegistry>;
}

export function providersPhase(deps: ProvidersPhaseDeps): BootPhase {
  return {
    name: "providers",
    run: async (ctx: BootContext) => {
      ctx.provide("agents", await deps.resolveAgents(ctx));
      ctx.provide("gitlab", new GitLabClient(ctx.require("configStore").get().gitlab?.token ?? ""));
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
