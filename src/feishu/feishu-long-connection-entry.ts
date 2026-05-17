import * as lark from "@larksuiteoapi/node-sdk";
import { createFeegleAgent, type FeegleAgentKind } from "../agent/agent-factory.js";
import { FeishuClientPort, LarkFeishuClient } from "./feishu-client.js";
import { FeishuCommandResponder } from "./feishu-command-responder.js";
import { FeishuLongConnectionRuntime } from "./feishu-long-connection-runtime.js";

const config = {
  appId: readRequiredEnv("FEISHU_APP_ID"),
  appSecret: readRequiredEnv("FEISHU_APP_SECRET"),
  verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
  encryptKey: process.env.FEISHU_ENCRYPT_KEY
};
const feishuClient: FeishuClientPort = new LarkFeishuClient(
  new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret
  })
);
const agentKind = readAgentKindEnv();
const configuredAgent = createFeegleAgent({
  kind: agentKind,
  command: readAgentCommandEnv(agentKind),
  cwd: process.env.FEEGLE_AGENT_CWD ?? process.cwd(),
  sandbox: readSandboxEnv(),
  approvalPolicy: readApprovalPolicyEnv(),
  timeoutMs: readTimeoutMsEnv()
});
const handler = new FeishuCommandResponder(feishuClient, configuredAgent.agent, {
  agentDisplayName: configuredAgent.displayName
});

const runtime = new FeishuLongConnectionRuntime(
  config,
  lark,
  handler
);

await runtime.start();

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readAgentKindEnv(): FeegleAgentKind {
  const value = process.env.FEEGLE_AGENT_KIND;
  if (value === undefined || value === "codex") {
    return "codex";
  }
  if (value === "claude_code") {
    return "claude_code";
  }
  throw new Error(`Invalid FEEGLE_AGENT_KIND: ${value}`);
}

function readAgentCommandEnv(agentKind: FeegleAgentKind): string | undefined {
  if (process.env.FEEGLE_AGENT_COMMAND) {
    return process.env.FEEGLE_AGENT_COMMAND;
  }
  return agentKind === "claude_code" ? "claude" : "codex";
}

function readSandboxEnv(): "read-only" | "workspace-write" | "danger-full-access" {
  const value = process.env.FEEGLE_AGENT_SANDBOX;
  if (value === undefined || value === "workspace-write") {
    return "workspace-write";
  }
  if (value === "read-only" || value === "danger-full-access") {
    return value;
  }
  throw new Error(`Invalid FEEGLE_AGENT_SANDBOX: ${value}`);
}

function readApprovalPolicyEnv(): "untrusted" | "on-request" | "never" {
  const value = process.env.FEEGLE_AGENT_APPROVAL_POLICY;
  if (value === undefined || value === "never") {
    return "never";
  }
  if (value === "untrusted" || value === "on-request") {
    return value;
  }
  throw new Error(`Invalid FEEGLE_AGENT_APPROVAL_POLICY: ${value}`);
}

function readTimeoutMsEnv(): number {
  const value = process.env.FEEGLE_AGENT_TIMEOUT_MS;
  if (value === undefined) {
    return 300_000;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid FEEGLE_AGENT_TIMEOUT_MS: ${value}`);
  }
  return parsed;
}
