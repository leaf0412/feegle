/**
 * Prompt builders that used to live inside the per-method CLI adapter. With the
 * unified event-stream interface every caller builds the prompt string itself
 * and runs it through {@link collectText}/{@link streamAgentText}, so these stay
 * as plain functions to keep behavior identical.
 */
export function buildDevelopmentTaskPrompt(input: {
  localPath: string;
  branchName: string;
  title: string;
  requirementText: string;
  task: string;
}): string {
  return (
    `Work on the following task in the repository at ${input.localPath} ` +
    `(branch ${input.branchName}).\n\n` +
    `Requirement: ${input.title}\n${input.requirementText}\n\n` +
    `Task: ${input.task}`
  );
}
