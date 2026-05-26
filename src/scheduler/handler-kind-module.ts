import type { CapabilityContext } from "../boot/boot-context.js";
import type { HandlerKindRegistry } from "./handler-kind-registry.js";

export interface HandlerKindModule {
  readonly id: string;
  register(registry: HandlerKindRegistry, ctx: CapabilityContext): void;
}
