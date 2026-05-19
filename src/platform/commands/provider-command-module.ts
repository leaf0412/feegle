import { defineSlashCommand, type SlashCommandDefinition } from "../slash-command-catalog.js";
import type { SlashCommandModule, SlashCommandRegistryDeps } from "../slash-command-module.js";
import {
  ProviderListCommandHandler,
  ProviderRegisterCommandHandler,
  ProviderUnregisterCommandHandler,
  ProviderUseCommandHandler,
  type ProviderCommandDeps
} from "./provider/provider-command-handlers.js";

const providerDefinitions = {
  provider_list: defineSlashCommand(
    "provider_list",
    "/provider list",
    "列出所有 provider",
    "agent",
    "cmd:/provider list"
  ),
  provider_register: defineSlashCommand(
    "provider_register",
    "/provider register <kind> [k=v...]",
    "注册一个 provider",
    "agent",
    "cmd:/provider register"
  ),
  provider_unregister: defineSlashCommand(
    "provider_unregister",
    "/provider unregister <kind>",
    "移除一个 provider",
    "agent",
    "cmd:/provider unregister"
  ),
  provider_use: defineSlashCommand(
    "provider_use",
    "/provider use <kind>",
    "激活一个 provider",
    "agent",
    "cmd:/provider use"
  )
} satisfies Record<string, SlashCommandDefinition>;

export function providerCommandModule(): SlashCommandModule {
  return {
    id: "provider",
    register: (registry, deps) => {
      const resolved = requireProviderDeps(deps);
      registry.registerCommand(
        providerDefinitions.provider_list,
        new ProviderListCommandHandler(resolved)
      );
      registry.registerCommand(
        providerDefinitions.provider_register,
        new ProviderRegisterCommandHandler(resolved)
      );
      registry.registerCommand(
        providerDefinitions.provider_unregister,
        new ProviderUnregisterCommandHandler(resolved)
      );
      registry.registerCommand(
        providerDefinitions.provider_use,
        new ProviderUseCommandHandler(resolved)
      );
    }
  };
}

function requireProviderDeps(deps: SlashCommandRegistryDeps): ProviderCommandDeps {
  const missing: string[] = [];
  if (!deps.ownerEmails) missing.push("ownerEmails");
  if (!deps.providers) missing.push("providers");
  if (!deps.providerStore) missing.push("providerStore");
  if (missing.length > 0) {
    throw new Error(`provider command module requires deps: ${missing.join(", ")}`);
  }
  return {
    ownerEmails: deps.ownerEmails!,
    providers: deps.providers!,
    providerStore: deps.providerStore!
  };
}
