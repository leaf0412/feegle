import type { CapabilityContext } from "@infra/boot/boot-context.js";
import { HandlerKindRegistry } from "./handler-kind-registry.js";
import type { HandlerKindModule } from "./handler-kind-module.js";

export interface BuildHandlerKindRegistryOptions {
  ctx: CapabilityContext;
  modules: readonly HandlerKindModule[];
}

export function buildHandlerKindRegistry(options: BuildHandlerKindRegistryOptions): HandlerKindRegistry {
  const registry = new HandlerKindRegistry();
  for (const module of options.modules) {
    module.register(registry, options.ctx);
  }
  registry.freeze();
  return registry;
}
