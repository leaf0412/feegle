import { hostname, platform, release, totalmem } from "node:os";
import type { HostInfo, HostInfoProvider } from "../task-context.js";

export interface RuntimeHostInfo extends HostInfo {
  uptimeSeconds: number;
  nodeVersion: string;
  platform: string;
  memoryUsedMb: number;
  memoryTotalMb: number;
}

export class RuntimeHostInfoProvider implements HostInfoProvider {
  async read(): Promise<RuntimeHostInfo> {
    return {
      hostname: hostname(),
      pid: process.pid,
      uptimeSeconds: process.uptime(),
      nodeVersion: process.version,
      platform: `${platform()} ${release()}`,
      memoryUsedMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      memoryTotalMb: Math.round(totalmem() / 1024 / 1024)
    };
  }
}
