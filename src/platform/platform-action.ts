export type PlatformCommandAction = {
  kind: "nav" | "act" | "cmd";
  command: string;
  args: string;
  raw: string;
};

export type PlatformPermissionAction = {
  kind: "permission";
  behavior: "allow" | "deny" | "allow_all";
  raw: string;
};

export type PlatformAskQuestionAction = {
  kind: "ask_question";
  questionIndex: number;
  optionIndex: number;
  raw: string;
};

export type PlatformUnknownAction = { kind: "unknown"; raw: string };

export type PlatformAction =
  | PlatformCommandAction
  | PlatformPermissionAction
  | PlatformAskQuestionAction
  | PlatformUnknownAction;

export function parsePlatformAction(raw: string): PlatformAction {
  const value = raw.trim();
  if (value.startsWith("nav:")) {
    return parseCommandAction("nav", value);
  }
  if (value.startsWith("act:")) {
    return parseCommandAction("act", value);
  }
  if (value.startsWith("cmd:")) {
    return parseCommandAction("cmd", value);
  }
  if (value === "perm:allow" || value === "perm:deny" || value === "perm:allow_all") {
    return {
      kind: "permission",
      behavior: value.slice("perm:".length) as "allow" | "deny" | "allow_all",
      raw
    };
  }
  if (value.startsWith("askq:")) {
    const [, questionIndex, optionIndex] = value.split(":");
    const parsedQuestionIndex = Number(questionIndex);
    const parsedOptionIndex = Number(optionIndex);
    if (Number.isInteger(parsedQuestionIndex) && Number.isInteger(parsedOptionIndex)) {
      return {
        kind: "ask_question",
        questionIndex: parsedQuestionIndex,
        optionIndex: parsedOptionIndex,
        raw
      };
    }
  }
  return { kind: "unknown", raw };
}

function parseCommandAction(kind: "nav" | "act" | "cmd", raw: string): PlatformAction {
  const body = raw.slice(`${kind}:`.length).trim();
  if (!body.startsWith("/")) {
    return { kind: "unknown", raw };
  }
  const [command = "", ...args] = body.split(/\s+/);
  return {
    kind,
    command,
    args: args.join(" "),
    raw
  };
}
