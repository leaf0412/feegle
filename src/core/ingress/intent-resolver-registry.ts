import type { Intent } from "./intent.js";
import type { TriggerEvent } from "./trigger-event.js";

export interface IntentResolver {
  id: string;
  canResolve(event: TriggerEvent): boolean;
  resolve(event: TriggerEvent): Promise<Intent> | Intent;
}

export class IntentResolverRegistry {
  private readonly resolvers: IntentResolver[] = [];

  register(resolver: IntentResolver): void {
    if (this.resolvers.some((item) => item.id === resolver.id)) {
      throw new Error(`Intent resolver already registered: ${resolver.id}`);
    }
    this.resolvers.push(resolver);
  }

  async resolve(event: TriggerEvent): Promise<Intent> {
    const resolver = this.resolvers.find((item) => item.canResolve(event));
    if (!resolver) {
      throw new Error(`No intent resolver for trigger: ${event.source.pluginId}/${event.source.triggerType}`);
    }
    return resolver.resolve(event);
  }
}
