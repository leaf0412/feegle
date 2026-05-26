import type { FeeglePlugin } from "../../boot/feegle-plugin.js";
import { gitlabFollowKindModule } from "../../scheduler/default-handler-kind-modules.js";

export const gitlabFollowPlugin: FeeglePlugin = {
  id: "gitlab-follow",
  handlerKinds: [gitlabFollowKindModule()]
};
