export interface Effect {
  effectId: string;
  pluginId: string;
  effectType: string;
  input: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
}

export interface EffectExecutor {
  execute(effect: Effect): Promise<unknown>;
}
