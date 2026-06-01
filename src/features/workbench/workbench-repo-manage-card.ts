import type { ChatWorkbenchState } from "./workbench-models.js";
import { createPlatformCard, type PlatformCard } from "@platform/platform-card.js";

export function renderWorkbenchRepoManageCard(state: ChatWorkbenchState): PlatformCard {
  const builder = createPlatformCard()
    .title("仓库管理", "indigo");

  if (state.repositories.length > 0) {
    for (const repo of state.repositories) {
      builder.listItem(repo, {
        text: "移除",
        type: "danger",
        action: `act:/workbench remove_repo ${repo}`
      });
    }
  } else {
    builder.markdown("暂无绑定的仓库");
  }

  builder.divider();
  builder.markdown("**添加仓库**：输入仓库 URL（HTTPS 或 SSH）");
  builder.formInput("repo_url", "git@github.com:org/repo.git", {
    text: "添加",
    type: "primary",
    action: "act:/workbench add_repo"
  });

  builder.divider();
  builder.buttonRow([{ text: "返回工作台", type: "default", action: "act:/workbench back" }], "row");

  return builder.build();
}
