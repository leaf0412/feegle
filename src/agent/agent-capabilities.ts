// Optional capability interfaces — agents opt in by implementing only what they support.
// Callers detect support via `hasCapability` and gracefully degrade when absent.
// Pattern borrowed from cc-connect core/interfaces.go.

export interface ModelOption {
  name: string;
  desc?: string;
  alias?: string;
}

export interface ModelSwitcher {
  setModel(model: string): void;
  getModel(): string;
  availableModels(): Promise<ModelOption[]>;
}

export interface ReasoningEffortSwitcher {
  setReasoningEffort(effort: string): void;
  getReasoningEffort(): string;
  availableReasoningEfforts(): string[];
}

export interface PermissionModeInfo {
  key: string;
  name: string;
  desc: string;
}

export interface ModeSwitcher {
  setMode(mode: string): void;
  getMode(): string;
  permissionModes(): PermissionModeInfo[];
}

export interface MemoryFileProvider {
  projectMemoryFile(): string;
  globalMemoryFile(): string;
}

export interface ToolAuthorizer {
  addAllowedTools(tools: string[]): Promise<void>;
  getAllowedTools(): string[];
}

export interface ContextCompressor {
  compressCommand(): string;
}

export interface UsageWindow {
  name: string;
  usedPercent: number;
  windowSeconds: number;
  resetAfterSeconds: number;
  resetAtUnix: number;
}

export interface UsageBucket {
  name: string;
  allowed: boolean;
  limitReached: boolean;
  windows: UsageWindow[];
}

export interface UsageCredits {
  hasCredits: boolean;
  unlimited: boolean;
  balance: string;
}

export interface UsageReport {
  provider: string;
  accountId?: string;
  userId?: string;
  email?: string;
  plan?: string;
  buckets: UsageBucket[];
  credits?: UsageCredits;
}

export interface UsageReporter {
  getUsage(): Promise<UsageReport>;
}

export interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface HistoryProvider {
  getSessionHistory(sessionId: string, limit: number): Promise<HistoryEntry[]>;
}

export interface SkillProvider {
  skillDirs(): string[];
}

export interface CommandProvider {
  commandDirs(): string[];
}

export type DoctorStatus = "ok" | "warn" | "fail";

export interface DoctorCheckResult {
  name: string;
  status: DoctorStatus;
  detail: string;
  latencyMs?: number;
}

export interface DoctorChecker {
  doctorChecks(): Promise<DoctorCheckResult[]>;
}

export interface AgentDoctorInfo {
  cliBinaryName(): string;
  cliDisplayName(): string;
}

export function hasCapability<T extends object>(
  obj: unknown,
  methodName: keyof T
): obj is T {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const candidate = (obj as Record<string, unknown>)[methodName as string];
  return typeof candidate === "function";
}
