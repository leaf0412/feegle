import { homedir } from "node:os";
import { resolve } from "node:path";

export interface FeegleHomeEnv {
  FEEGLE_HOME?: string;
  HOME?: string;
}

export function resolveFeegleHome(env: FeegleHomeEnv = process.env): string {
  const configured = env.FEEGLE_HOME?.trim();
  if (configured) {
    return resolve(configured);
  }
  return resolve(env.HOME ?? homedir(), ".feegle");
}
