import type { QuoteClientModule } from "./quote-client-module.js";
import { SinaQuoteClient } from "./sina-quote-client.js";

export const defaultQuoteClientId = "sina";

const defaultModuleFactories = [
  sinaQuoteClientModule
];

export function defaultQuoteClientModules(): QuoteClientModule[] {
  return defaultModuleFactories.map((createModule) => createModule());
}

function sinaQuoteClientModule(): QuoteClientModule {
  return {
    id: defaultQuoteClientId,
    register: (registry) => {
      registry.register(defaultQuoteClientId, new SinaQuoteClient());
    }
  };
}
