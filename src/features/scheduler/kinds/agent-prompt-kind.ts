import { z } from "zod";
import type { AgentProviderRegistry } from "../../../agent/agent-provider-registry.js";
import { simpleTextCard } from "../util/simple-text-card.js";
import { AgentRunError, UnknownProviderError } from "../handler-errors.js";
import type { HandlerKind, HandlerRunResult } from "../handler-kind.js";
import type { TaskContext } from "../task-context.js";

const ParamsSchema = z.object({
  provider: z.enum(["claude", "codex"]).default("claude"),
  prompt: z.string().min(1),
  format: z.enum(["text", "card"]).default("text")
});

type Params = z.infer<typeof ParamsSchema>;

export class AgentPromptKind implements HandlerKind<Params> {
  readonly id = "agent-prompt";
  readonly title = "Agent prompt";
  readonly description = "Runs a fixed prompt on a schedule";

  constructor(private readonly deps: { agents: AgentProviderRegistry }) {}

  parseParams(input: unknown): Params {
    return ParamsSchema.parse(input);
  }

  describeParams(params: Params): string {
    return `${params.provider}: ${params.prompt.slice(0, 40)}`;
  }

  async run(ctx: TaskContext, params: Params): Promise<HandlerRunResult> {
    const provider = this.deps.agents.resolve(params.provider);
    if (!provider) {
      throw new UnknownProviderError(`Unknown provider: ${params.provider}`);
    }
    let response: string;
    try {
      response = await provider.buildAgent().chat([{ role: "user", content: params.prompt }]);
    } catch (error) {
      throw new AgentRunError(params.provider, error);
    }
    if (!ctx.task.target) {
      return { outcome: "silent", note: "no target" };
    }
    if (params.format === "card") {
      await ctx.notify.sendCard(ctx.task.target, simpleTextCard("Agent result", response));
    } else {
      await ctx.notify.sendText(ctx.task.target, response);
    }
    return { outcome: "sent" };
  }
}
