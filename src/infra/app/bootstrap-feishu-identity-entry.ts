import { join } from "node:path";
import { openRuntimeDb } from "./runtime-db.js";
import { resolveFeegleHome } from "./feegle-home.js";
import { bootstrapFeishuIdentity } from "@resources/workspace/feishu-identity-bootstrap.js";
import { WorkspaceStore } from "@resources/workspace/workspace-store.js";

interface CliArgs {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  displayName: string;
  feishuOpenId: string;
  feishuChatId: string;
}

const args = parseArgs(process.argv.slice(2));
const feegleHome = resolveFeegleHome(process.env);
const db = openRuntimeDb(join(feegleHome, "feegle.db"));

try {
  const result = bootstrapFeishuIdentity(new WorkspaceStore(db), {
    ...args,
    now: new Date().toISOString()
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  db.close();
}

function parseArgs(argv: string[]): CliArgs {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key?.startsWith("--")) {
      throw new Error(`unexpected argument: ${key ?? ""}`);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for ${key}`);
    }
    values.set(key.slice(2), value);
    i++;
  }

  return {
    workspaceId: getArg(values, "workspace-id"),
    workspaceName: values.get("workspace-name") ?? getArg(values, "workspace-id"),
    userId: getArg(values, "user-id"),
    displayName: values.get("display-name") ?? getArg(values, "user-id"),
    feishuOpenId: getArg(values, "feishu-open-id"),
    feishuChatId: getArg(values, "feishu-chat-id")
  };
}

function getArg(values: Map<string, string>, key: string): string {
  const value = values.get(key)?.trim();
  if (!value) {
    throw new Error(`missing required --${key}`);
  }
  return value;
}
