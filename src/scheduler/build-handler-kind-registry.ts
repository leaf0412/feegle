import { HandlerKindRegistry } from "./handler-kind-registry.js";
import type { HandlerKindModule, HandlerKindRegistryDeps } from "./handler-kind-module.js";
import { defaultHandlerKindModules } from "./default-handler-kind-modules.js";

export interface BuildHandlerKindRegistryOptions extends HandlerKindRegistryDeps {
  modules?: readonly HandlerKindModule[];
}

export function buildHandlerKindRegistry(options: BuildHandlerKindRegistryOptions): HandlerKindRegistry {
  const registry = new HandlerKindRegistry();
  for (const module of [...defaultHandlerKindModules(), ...(options.modules ?? [])]) {
    module.register(registry, options);
  }
  registry.freeze();
  return registry;
}
