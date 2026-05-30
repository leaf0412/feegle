import type { Startable } from "../app/feegle-app.js";
import type { NotificationAdapterModule } from "../app/notification-adapter-module.js";
import type { SlashCommandModule } from "../platform/slash-command-module.js";
import type { HandlerKindModule } from "../scheduler/handler-kind-module.js";
import type { QuoteClientModule } from "../stock/quote-client-module.js";
import type { BootContext, CapabilityContext } from "./boot-context.js";
import type { BootPhaseName } from "./boot-phase.js";

/** A platform adapter contributes a runtime built from capabilities. */
export interface PlatformRuntimeModule {
  readonly id: string;
  create(ctx: CapabilityContext): Startable;
}

/** Escape hatch: a plugin that supplies a capability at a chosen phase. */
export interface PluginProvision {
  readonly phase: BootPhaseName;
  run(ctx: BootContext): void | Promise<void>;
}

/** First-class runtime contribution hook for future ingress/effect/workflow roles. */
export interface RuntimeContributionModule {
  readonly id: string;
  register(ctx: unknown): void | Promise<void>;
}

/** A feature, grouping its contributions to extension points. */
export interface FeeglePlugin {
  readonly id: string;
  readonly dependsOn?: readonly string[];
  readonly handlerKinds?: readonly HandlerKindModule[];
  readonly slashCommands?: readonly SlashCommandModule[];
  readonly quoteClients?: readonly QuoteClientModule[];
  readonly notificationAdapters?: readonly NotificationAdapterModule[];
  readonly platformRuntimes?: readonly PlatformRuntimeModule[];
  readonly provides?: readonly PluginProvision[];
  readonly runtimeContributions?: readonly RuntimeContributionModule[];
}

export interface Contributions {
  handlerKinds: HandlerKindModule[];
  slashCommands: SlashCommandModule[];
  quoteClients: QuoteClientModule[];
  notificationAdapters: NotificationAdapterModule[];
  platformRuntimes: PlatformRuntimeModule[];
  provisions: PluginProvision[];
  runtimeContributions: RuntimeContributionModule[];
}

export function collectContributions(plugins: readonly FeeglePlugin[]): Contributions {
  return {
    handlerKinds: plugins.flatMap((p) => [...(p.handlerKinds ?? [])]),
    slashCommands: plugins.flatMap((p) => [...(p.slashCommands ?? [])]),
    quoteClients: plugins.flatMap((p) => [...(p.quoteClients ?? [])]),
    notificationAdapters: plugins.flatMap((p) => [...(p.notificationAdapters ?? [])]),
    platformRuntimes: plugins.flatMap((p) => [...(p.platformRuntimes ?? [])]),
    provisions: plugins.flatMap((p) => [...(p.provides ?? [])]),
    runtimeContributions: plugins.flatMap((p) => [...(p.runtimeContributions ?? [])])
  };
}
