export interface FeishuMentionLike {
  key?: string;
  name?: string;
}

export function replaceMentions(text: string, mentions: ReadonlyArray<FeishuMentionLike> | undefined): string {
  if (!mentions || mentions.length === 0) {
    return text;
  }
  return mentions.reduce((acc, mention) => {
    if (!mention.key || !mention.name) {
      return acc;
    }
    return acc.replaceAll(mention.key, `@${mention.name}`);
  }, text);
}

interface PostElement {
  tag?: unknown;
  text?: unknown;
  language?: unknown;
  user_id?: unknown;
  user_name?: unknown;
}

interface PostPayload {
  title?: unknown;
  content?: unknown;
}

export function extractPostPlainText(content: string): string {
  const payload = parsePostPayload(content);
  if (!payload || !Array.isArray(payload.content) || payload.content.length === 0) {
    return "";
  }
  const parts: string[] = [];
  if (typeof payload.title === "string" && payload.title !== "") {
    parts.push(payload.title);
  }
  for (const paragraph of payload.content) {
    if (!Array.isArray(paragraph)) {
      continue;
    }
    const segments: string[] = [];
    for (const element of paragraph) {
      const segment = renderPostElement(element);
      if (segment !== "") {
        segments.push(segment);
      }
    }
    if (segments.length > 0) {
      parts.push(segments.join(""));
    }
  }
  return parts.join("\n");
}

function parsePostPayload(content: string): PostPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (looksLikePost(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      if (looksLikePost(value)) {
        return value;
      }
    }
  }
  return null;
}

function looksLikePost(value: unknown): value is PostPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const content = (value as { content?: unknown }).content;
  return Array.isArray(content);
}

function renderPostElement(element: unknown): string {
  if (!element || typeof element !== "object" || Array.isArray(element)) {
    return "";
  }
  const elem = element as PostElement;
  const tag = typeof elem.tag === "string" ? elem.tag : "";
  const text = typeof elem.text === "string" ? elem.text : "";
  if (tag === "text" || tag === "a" || tag === "markdown") {
    return text;
  }
  if (tag === "at") {
    if (elem.user_id === "all") {
      return "@all";
    }
    if (typeof elem.user_name === "string" && elem.user_name !== "") {
      return `@${elem.user_name}`;
    }
    if (typeof elem.user_id === "string" && elem.user_id !== "") {
      return "@user";
    }
    return "";
  }
  if (tag === "img") {
    return "[image]";
  }
  if (tag === "code_block" && text !== "") {
    const lang = typeof elem.language === "string" ? elem.language : "";
    return `\`\`\`${lang}\n${text}\n\`\`\``;
  }
  return "";
}

export function extractInteractiveCardText(content: string): string {
  const cardJSON = unwrapJsonCard(content);
  let card: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(cardJSON);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      card = parsed as Record<string, unknown>;
    }
  } catch {
    return "[interactive card]";
  }
  if (!card) {
    return "[interactive card]";
  }

  const parts: string[] = [];

  const body = card.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const bodyRecord = body as Record<string, unknown>;
    const propertyElements = readProperty(bodyRecord, "elements");
    if (bodyRecord.tag === "body" && Array.isArray(propertyElements)) {
      extractCardElements(propertyElements, parts);
    } else if (Array.isArray(bodyRecord.elements)) {
      extractCardElements(bodyRecord.elements as unknown[], parts);
    }
  }

  if (parts.length === 0) {
    extractLegacyCard(card, parts);
  }

  if (parts.length === 0) {
    return "[interactive card]";
  }
  return parts.join("\n");
}

function unwrapJsonCard(content: string): string {
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as { json_card?: unknown }).json_card === "string" &&
      (parsed as { json_card: string }).json_card !== ""
    ) {
      return (parsed as { json_card: string }).json_card;
    }
  } catch {
    /* fall through */
  }
  return content;
}

function readProperty(record: Record<string, unknown>, key: string): unknown {
  const property = record.property;
  if (!property || typeof property !== "object" || Array.isArray(property)) {
    return undefined;
  }
  return (property as Record<string, unknown>)[key];
}

function extractLegacyCard(card: Record<string, unknown>, parts: string[]): void {
  const header = card.header;
  if (header && typeof header === "object" && !Array.isArray(header)) {
    const title = (header as { title?: unknown }).title;
    if (title && typeof title === "object" && !Array.isArray(title)) {
      const titleContent = (title as { content?: unknown }).content;
      if (typeof titleContent === "string" && titleContent !== "") {
        parts.push(titleContent);
      }
    }
  }
  if (parts.length === 0 && typeof card.title === "string" && card.title !== "") {
    parts.push(card.title);
  }

  const rawElements = card.elements;
  let elements: unknown[] = [];
  if (Array.isArray(rawElements) && Array.isArray(rawElements[0])) {
    for (const row of rawElements) {
      if (Array.isArray(row)) {
        elements = elements.concat(row);
      }
    }
  } else if (Array.isArray(rawElements)) {
    elements = rawElements;
  }
  for (const element of elements) {
    if (!element || typeof element !== "object" || Array.isArray(element)) {
      continue;
    }
    const elem = element as { tag?: unknown; text?: unknown };
    if (elem.tag === "text" && typeof elem.text === "string" && elem.text.trim() !== "") {
      parts.push(elem.text);
    }
  }
}

export function extractCardElements(elements: ReadonlyArray<unknown>, parts: string[]): void {
  for (const raw of elements) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const elem = raw as Record<string, unknown>;
    const tag = typeof elem.tag === "string" ? elem.tag : "";
    const property = isRecord(elem.property) ? elem.property : {};
    switch (tag) {
      case "code_block":
        renderCodeBlock(property, parts);
        break;
      case "code_span": {
        const span = readString(property, "content");
        if (span !== "") {
          parts.push("`" + span + "`");
        }
        break;
      }
      case "hr":
        parts.push("---");
        break;
      case "table":
        extractCardTable(property.columns, property.rows, parts);
        break;
      case "list":
        extractCardListItems(property.items, parts);
        break;
      default: {
        const content = readString(property, "content") || readStringField(elem, "content");
        if (content !== "") {
          parts.push(content);
        }
        if (isRecord(property.text)) {
          const nested = readString(isRecord(property.text.property) ? property.text.property : {}, "content");
          if (nested !== "") {
            parts.push(nested);
          }
        }
        break;
      }
    }
    if (Array.isArray(property.elements)) {
      extractCardElements(property.elements as unknown[], parts);
    }
  }
}

function renderCodeBlock(property: Record<string, unknown>, parts: string[]): void {
  const contents = property.contents;
  if (!Array.isArray(contents)) {
    return;
  }
  const codeLines: string[] = [];
  for (const line of contents) {
    if (!isRecord(line) || !Array.isArray(line.contents)) {
      continue;
    }
    const tokens = (line.contents as unknown[]).map((tok) => (isRecord(tok) ? readString(tok, "content") : ""));
    codeLines.push(tokens.join(""));
  }
  const code = codeLines.join("");
  if (code.trim() === "") {
    return;
  }
  const lang = readString(property, "language");
  parts.push(`\`\`\`${lang}\n${code}\`\`\``);
}

export function extractCardTable(columnsRaw: unknown, rowsRaw: unknown, parts: string[]): void {
  if (!Array.isArray(columnsRaw) || columnsRaw.length === 0) {
    return;
  }
  if (!Array.isArray(rowsRaw)) {
    return;
  }
  const columns = columnsRaw
    .filter(isRecord)
    .map((col) => ({
      displayName: readString(col, "displayName"),
      name: readString(col, "name")
    }));
  if (columns.length === 0) {
    return;
  }
  const header = columns.map((col) => col.displayName);
  parts.push(`| ${header.join(" | ")} |`);
  parts.push(`| ${columns.map(() => "---").join(" | ")} |`);
  for (const row of rowsRaw) {
    if (!isRecord(row)) {
      continue;
    }
    const cells = columns.map((col) => {
      const cell = row[col.name];
      if (!isRecord(cell)) {
        return "";
      }
      const cellParts: string[] = [];
      extractCardElements([cell.data], cellParts);
      return cellParts.join(" ");
    });
    parts.push(`| ${cells.join(" | ")} |`);
  }
}

export function extractCardListItems(itemsRaw: unknown, parts: string[]): void {
  if (!Array.isArray(itemsRaw)) {
    return;
  }
  for (const item of itemsRaw) {
    if (!isRecord(item) || !Array.isArray(item.elements)) {
      continue;
    }
    const itemParts: string[] = [];
    extractCardElements(item.elements as unknown[], itemParts);
    if (itemParts.length > 0) {
      parts.push(`- ${itemParts.join(" ")}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function readStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}
