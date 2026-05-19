import { QuoteClientRegistry } from "./quote-client-registry.js";
import type { QuoteClientModule } from "./quote-client-module.js";
import { defaultQuoteClientModules } from "./default-quote-client-modules.js";

export interface BuildQuoteClientRegistryOptions {
  modules?: readonly QuoteClientModule[];
}

export function buildQuoteClientRegistry(options: BuildQuoteClientRegistryOptions = {}): QuoteClientRegistry {
  const registry = new QuoteClientRegistry();
  for (const module of [...defaultQuoteClientModules(), ...(options.modules ?? [])]) {
    module.register(registry);
  }
  registry.freeze();
  return registry;
}
