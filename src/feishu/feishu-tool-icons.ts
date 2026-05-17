export const DEFAULT_TOOL_ICON = "setting-inter_outlined";

export const TOOL_ICON_MAP: Readonly<Record<string, string>> = {
  Bash: "terminal-two_outlined",
  Edit: "edit_outlined",
  Read: "file-open_outlined",
  Write: "notes_outlined",
  Glob: "folder-open_outlined",
  Grep: "search_outlined",
  WebFetch: "internet_outlined",
  WebSearch: "internet_outlined",
  Agent: "robot_outlined",
  Skill: "code_outlined",
  LSP: "code_outlined"
};

export function getToolIcon(toolName: string): string {
  return TOOL_ICON_MAP[toolName] ?? DEFAULT_TOOL_ICON;
}

export const THINKING_VERBS: ReadonlyArray<string> = [
  "Churning", "Clauding", "Coalescing", "Cogitating", "Computing",
  "Combobulating", "Concocting", "Conjuring", "Considering", "Contemplating",
  "Cooking", "Crafting", "Creating", "Crunching", "Deciphering",
  "Deliberating", "Divining", "Effecting", "Elucidating", "Enchanting",
  "Envisioning", "Finagling", "Forging", "Generating", "Germinating",
  "Hatching", "Ideating", "Imagining", "Incubating", "Inferring",
  "Manifesting", "Marinating", "Meandering", "Mulling", "Musing",
  "Noodling", "Percolating", "Perusing", "Pondering", "Processing",
  "Puzzling", "Reticulating", "Ruminating", "Scheming", "Simmering",
  "Spelunking", "Spinning", "Stewing", "Sussing", "Synthesizing",
  "Thinking", "Tinkering", "Transmuting", "Unfurling", "Unravelling",
  "Vibing", "Wandering", "Whirring", "Wizarding", "Working", "Wrangling"
];

export function pickThinkingVerb(nowSec: number = Math.floor(Date.now() / 1000)): string {
  const index = ((nowSec % THINKING_VERBS.length) + THINKING_VERBS.length) % THINKING_VERBS.length;
  return `${THINKING_VERBS[index]}...`;
}
