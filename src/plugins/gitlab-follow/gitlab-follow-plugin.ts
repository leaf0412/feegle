import type { FeeglePlugin } from "@infra/boot/feegle-plugin.js";
import { gitlabFollowKindModule } from "@features/scheduler/default-handler-kind-modules.js";

export const gitlabFollowPlugin: FeeglePlugin = {
  id: "gitlab-follow",
  handlerKinds: [gitlabFollowKindModule()]
};
