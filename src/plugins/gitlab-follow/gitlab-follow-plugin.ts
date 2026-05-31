import type { FeeglePlugin } from "@infra/boot/feegle-plugin.js";
import { gitlabFollowKindModule } from "@features/scheduler/default-handler-kind-modules.js";

export const gitlabFollowPlugin: FeeglePlugin = {
  id: "gitlab-follow",
  manifest: {
    id: "gitlab-follow",
    version: "1.0.0",
    displayName: "GitLab Follow",
    description: "GitLab MR review automation with comments and status updates",
    triggerTypes: ["gitlab_webhook"],
    effectTypes: [
      { pluginId: "gitlab", effectType: "post_comment" },
      { pluginId: "gitlab", effectType: "update_status" }
    ],
    intentKinds: ["chat"],
    permissions: ["read_gitlab", "write_gitlab_comments", "write_gitlab_status"]
  },
  handlerKinds: [gitlabFollowKindModule()]
};
