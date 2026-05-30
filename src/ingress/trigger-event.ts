export const triggerEventModelVersion = 1;

export interface TriggerEvent {
  triggerEventId: string;
  source: {
    pluginId: string;
    adapterId: string;
    triggerType: string;
  };
  receivedAt: string;
  external: Record<string, unknown>;
  actorHint?: Record<string, unknown>;
  conversationHint?: Record<string, unknown>;
  payloadSummary: Record<string, unknown>;
}
