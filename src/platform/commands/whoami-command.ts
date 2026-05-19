import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../slash-command-handler.js";
import { isOwner } from "../owner-access.js";

export interface WhoamiCommandHandlerDeps {
  ownerIdentities?: ReadonlySet<string>;
}

export class WhoamiCommandHandler implements SlashCommandHandler {
  readonly id = "whoami";

  constructor(private readonly deps: WhoamiCommandHandlerDeps = {}) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const matchKey = `${context.sender.platform}:${context.sender.userId}`;
    const ownerCheck = this.deps.ownerIdentities && isOwner(context, this.deps.ownerIdentities);
    return { kind: "text", text: render(context, matchKey, ownerCheck === true) };
  }
}

function render(context: SlashCommandContext, matchKey: string, owner: boolean): string {
  return [
    "🪪 bot 视角下的你",
    `- platform: ${context.sender.platform}`,
    `- userId: ${context.sender.userId || "(空)"}`,
    `- 当前 owner 匹配键: ${matchKey}`,
    `- isOwner: ${owner ? "✅" : "❌"}`,
    "",
    owner
      ? "已通过 owner 校验，可使用 /cron · /bind_stocks · /portfolio · /error_target · /provider 等命令。"
      : "未匹配 FEEGLE_OWNER_IDENTITIES。把上面「当前 owner 匹配键」整串加入该环境变量（逗号分隔多个）即可解锁 owner-only 命令。"
  ].join("\n");
}
