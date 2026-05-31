import { parseFeishuPlatformConfig, type FeishuPlatformConfig, type FeishuPlatformConfigInput } from "./feishu-platform-config.js";
import type { FeishuClientPort } from "./feishu-client.js";

export function buildFeishuEntryConfig(input: FeishuPlatformConfigInput): FeishuPlatformConfig {
  return parseFeishuPlatformConfig(input);
}

export async function resolveFeishuEntryConfig(
  input: FeishuPlatformConfigInput,
  client: Pick<FeishuClientPort, "fetchBotOpenId">
): Promise<FeishuPlatformConfig> {
  const config = buildFeishuEntryConfig(input);
  if (config.botOpenId) {
    return config;
  }
  const botOpenId = await client.fetchBotOpenId();
  if (!botOpenId) {
    throw new Error("Feishu bot info response missing open_id");
  }
  return { ...config, botOpenId };
}
