const INVALID_TOKEN_CODE = "99991663";
const INVALID_TOKEN_PHRASE = "invalid access token";

export function isTenantAccessTokenInvalid(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes(INVALID_TOKEN_CODE) || message.includes(INVALID_TOKEN_PHRASE);
}

export interface TokenRefreshRetryOptions {
  refresh: () => Promise<void>;
  operation?: string;
}

export async function withTokenRefreshRetry<T>(
  fn: () => Promise<T>,
  options: TokenRefreshRetryOptions
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isTenantAccessTokenInvalid(error)) {
      throw error;
    }
    try {
      await options.refresh();
    } catch (refreshError) {
      const operation = options.operation ?? "operation";
      throw new Error(
        `${operation} failed after token refresh attempt: ${errorMessage(refreshError)} (original error: ${errorMessage(error)})`
      );
    }
    return fn();
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

const TRANSIENT_CODES = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"]);
const TRANSIENT_SUBSTRINGS = [
  "connection reset by peer",
  "broken pipe",
  "i/o timeout",
  "tls handshake timeout",
  "server misbehaving",
  "connection refused",
  "socket hang up"
];

export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as Error & { code?: unknown }).code;
  if (typeof code === "string" && TRANSIENT_CODES.has(code)) {
    return true;
  }
  const message = error.message.toLowerCase();
  return TRANSIENT_SUBSTRINGS.some((needle) => message.includes(needle));
}

export interface TransientRetryOptions {
  operation?: string;
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 5_000;
const JITTER_RATIO = 0.25;

export async function withTransientRetry<T>(fn: () => Promise<T>, options: TransientRetryOptions = {}): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialDelay = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const maxDelay = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const operation = options.operation ?? "operation";

  let delay = initialDelay;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (options.signal?.aborted) {
      throw new Error(`${operation} aborted before attempt ${attempt + 1}`);
    }
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt === maxRetries) {
        break;
      }
      const jitter = Math.floor(delay * JITTER_RATIO * random());
      await sleep(delay + jitter);
      if (options.signal?.aborted) {
        throw new Error(`${operation} aborted during retry backoff: ${errorMessage(lastError)}`);
      }
      delay = Math.min(delay * 2, maxDelay);
    }
  }

  if (!isTransientError(lastError)) {
    throw lastError;
  }
  throw new Error(`${operation} failed after ${maxRetries} retries: ${errorMessage(lastError)}`);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
