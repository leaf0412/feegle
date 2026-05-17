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
