import type { SlashCommandModule } from "../../slash-command-module.js";
import { defineSlashCommand } from "../../slash-command-catalog.js";
import { GitLabClient, readGitLabToken } from "../../../gitlab/gitlab-client.js";
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
      try {
        const token = readGitLabToken();
        const client = new GitLabClient(token);
        const agent = deps.providers?.resolveActiveAgent();

        registry.registerCommand(
          glsumDefinition,
          new GlsumCommandHandler(client, agent)
        );
      } catch {
        registry.declarePlanned(glsumDefinition);
      }
    }
  };
}
