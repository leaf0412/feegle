import { createInterface } from "node:readline";
import type { Readable } from "node:stream";

export async function consumeStdoutLines(
  stdout: Readable | null | undefined,
  onStdoutLine: ((line: string) => Promise<void>) | undefined
): Promise<void> {
  if (!stdout || !onStdoutLine) {
    return;
  }

  const lines = createInterface({ input: stdout, crlfDelay: Infinity });
  for await (const line of lines) {
    await onStdoutLine(line);
  }
}
