import type { Effect } from "./effect-executor.js";

export interface EffectHandler {
  pluginId: string;
  effectType: string;
  execute(effect: Effect): Promise<unknown> | unknown;
}

export class EffectHandlerRegistry {
  private readonly handlers = new Map<string, EffectHandler>();

  register(handler: EffectHandler): void {
    const key = effectKey(handler.pluginId, handler.effectType);
    if (this.handlers.has(key)) {
      throw new Error(`Effect handler already registered: ${key}`);
    }
    this.handlers.set(key, handler);
  }

  has(pluginId: string, effectType: string): boolean {
    return this.handlers.has(effectKey(pluginId, effectType));
  }

  async execute(effect: Effect): Promise<unknown> {
    const key = effectKey(effect.pluginId, effect.effectType);
    const handler = this.handlers.get(key);
    if (!handler) {
      throw new Error(`No effect handler registered: ${key}`);
    }
    return handler.execute(effect);
  }
}

function effectKey(pluginId: string, effectType: string): string {
  return `${pluginId}:${effectType}`;
}
