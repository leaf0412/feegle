import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../slash-command-handler.js";
import { isOwner } from "../owner-access.js";
import type { FeishuUserDirectory } from "@integrations/feishu/feishu-user-directory.js";

export interface WhoamiCommandHandlerDeps {
  ownerEmails?: ReadonlySet<string>;
  userDirectory?: FeishuUserDirectory;
}

export class WhoamiCommandHandler implements SlashCommandHandler {
  readonly id = "whoami";

  constructor(private readonly deps: WhoamiCommandHandlerDeps = {}) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const ownerCheck = this.deps.ownerEmails ? isOwner(context, this.deps.ownerEmails) : false;
    const name = this.deps.userDirectory
      ? await this.deps.userDirectory.resolveUserName(context.sender.userId)
      : undefined;
    return { kind: "text", text: render(context, context.sender.email, ownerCheck, name) };
  }
}

function render(
  context: SlashCommandContext,
  email: string | undefined,
  owner: boolean,
  name?: string
): string {
  const lines = [
    "bot 视角下的你",
    `- platform: ${context.sender.platform}`,
    `- userId: ${context.sender.userId || "(空)"}`
  ];
  if (name && name !== context.sender.userId) {
    lines.push(`- 姓名: ${name}`);
  }
  lines.push(`- 邮箱: ${email || "(未获取到)"}`);
  lines.push(`- isOwner: ${owner ? "✅" : "❌"}`);
  lines.push("");
  if (owner) {
    lines.push("已通过 owner 校验，可使用 /cron · /bind_stocks · /portfolio · /error_target · /provider 等命令。");
  } else if (email) {
    lines.push(`未匹配 owner。把 ${email} 加入 ~/.feegle/config.jsonc 的 "ownerEmails" 数组即可解锁 owner-only 命令。`);
  } else {
    lines.push("飞书未返回邮箱，bot 无法识别 owner。检查飞书企业通讯录是否填写了邮箱，并确认应用具备 contact:user.email 读取权限。");
  }
  return lines.join("\n");
}
