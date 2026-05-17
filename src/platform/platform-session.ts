export interface PlatformSessionKeyInput {
  platform: string;
  chatId: string;
  userId: string;
  chatType: "group" | "p2p" | string;
  shareSessionInChannel?: boolean;
  threadIsolation?: boolean;
  rootMessageId?: string;
}

export function createPlatformSessionKey(input: PlatformSessionKeyInput): string {
  if (input.chatType === "group") {
    if (input.threadIsolation && input.rootMessageId) {
      return `${input.platform}:${input.chatId}:root:${input.rootMessageId}`;
    }
    if (input.shareSessionInChannel) {
      return `${input.platform}:${input.chatId}:channel`;
    }
  }
  return `${input.platform}:${input.chatId}:${input.userId}`;
}

const THREAD_ROOT_PREFIXES = ["root:", "thread:"];

export function parseThreadRootID(sessionTail: string): string | undefined {
  for (const prefix of THREAD_ROOT_PREFIXES) {
    if (sessionTail.startsWith(prefix)) {
      const rootID = sessionTail.slice(prefix.length);
      return rootID === "" ? undefined : rootID;
    }
  }
  return undefined;
}

export function isThreadSessionKey(sessionKey: string): boolean {
  const parts = splitSessionKey(sessionKey, 3);
  if (parts.length !== 3) {
    return false;
  }
  return parseThreadRootID(parts[2]) !== undefined;
}

export interface PlatformReplyCtx {
  platform: string;
  chatId: string;
  rootMessageId?: string;
  shared: boolean;
  sessionKey: string;
}

export function reconstructPlatformReplyCtx(sessionKey: string, platform: string): PlatformReplyCtx {
  const parts = splitSessionKey(sessionKey, 3);
  if (parts.length < 2 || parts[0] !== platform) {
    throw new Error(`invalid session key for ${platform}: ${sessionKey}`);
  }
  const chatId = parts[1];
  if (chatId === "") {
    throw new Error(`invalid session key for ${platform}: ${sessionKey}`);
  }
  if (parts.length === 2) {
    return { platform, chatId, shared: false, sessionKey };
  }
  const tail = parts[2];
  if (tail === "channel") {
    return { platform, chatId, shared: true, sessionKey };
  }
  const rootID = parseThreadRootID(tail);
  if (rootID !== undefined) {
    return { platform, chatId, rootMessageId: rootID, shared: false, sessionKey };
  }
  return { platform, chatId, shared: false, sessionKey };
}

export interface SessionKeyFromCardActionInput {
  platform: string;
  chatId: string;
  userId: string;
  shareSessionInChannel?: boolean;
}

export function sessionKeyFromCardAction(input: SessionKeyFromCardActionInput, cardValue: unknown): string {
  if (cardValue && typeof cardValue === "object" && !Array.isArray(cardValue)) {
    const provided = (cardValue as { session_key?: unknown }).session_key;
    if (typeof provided === "string" && provided !== "") {
      return provided;
    }
  }
  if (input.shareSessionInChannel) {
    return `${input.platform}:${input.chatId}:channel`;
  }
  return `${input.platform}:${input.chatId}:${input.userId}`;
}

function splitSessionKey(sessionKey: string, maxParts: number): string[] {
  const parts = sessionKey.split(":");
  if (parts.length <= maxParts) {
    return parts;
  }
  return [...parts.slice(0, maxParts - 1), parts.slice(maxParts - 1).join(":")];
}
