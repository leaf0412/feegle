export class UnknownProviderError extends Error {
  readonly errorClass = "UnknownProviderError";
}

export class AgentRunError extends Error {
  readonly errorClass = "AgentRunError";

  constructor(
    public readonly provider: string,
    public readonly cause: unknown
  ) {
    super(`Agent provider ${provider} run failed`);
  }
}
