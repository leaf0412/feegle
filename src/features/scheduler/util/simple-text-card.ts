import { createPlatformCard, type PlatformCard } from "@platform/platform-card.js";

export function simpleTextCard(title: string, text: string): PlatformCard {
  return createPlatformCard().title(title, "blue").markdown(text).build();
}
