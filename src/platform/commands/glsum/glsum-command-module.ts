import type { SlashCommandModule } from "../../slash-command-module.js";
import { defineSlashCommand } from "../../slash-command-catalog.js";
import { GitLabClient } from "../../../integrations/gitlab/gitlab-client.js";
import { consolePipelineHooks } from "../../pipeline-hooks.js";
import { GlsumCommandHandler } from "./glsum-command-handler.js";

const glsumDefinition = defineSlashCommand(
  "glsum",
  "/glsum <gitlab_url>",
  "总结 GitLab issue（含QA信息）",
  "system",
  "nav:/command glsum"
);

export function glsumCommandModule(): SlashCommandModule {
  return {
    id: "glsum",
    register: (registry, deps) => {
      const gl = deps.configStore?.get().gitlab;
      if (!gl) {
        registry.declarePlanned(glsumDefinition);
        return;
      }
      const client = new GitLabClient(gl.token);
      const agent = deps.providers?.resolveActiveAgent();
      const hooks = deps.pipelineHooks ?? consolePipelineHooks;
      registry.registerCommand(glsumDefinition, new GlsumCommandHandler(client, agent, hooks));
    }
  };
}
