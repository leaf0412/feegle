export type PlatformCardColor =
  | "blue"
  | "green"
  | "red"
  | "orange"
  | "grey"
  | "turquoise"
  | "violet"
  | "indigo"
  | "wathet"
  | "yellow"
  | "carmine";

export interface PlatformCard {
  header?: PlatformCardHeader;
  elements: PlatformCardElement[];
}

export interface PlatformCardHeader {
  title: string;
  color: PlatformCardColor;
}

export type PlatformCardElement =
  | { kind: "markdown"; content: string }
  | { kind: "divider" }
  | { kind: "actions"; buttons: PlatformCardButton[]; layout: PlatformCardActionLayout }
  | { kind: "list_item"; text: string; button: PlatformCardButton }
  | { kind: "select"; placeholder: string; options: PlatformCardSelectOption[]; initialAction?: string }
  | { kind: "note"; text: string; tag?: string };

export type PlatformCardActionLayout = "row" | "equal_columns";

export interface PlatformCardButton {
  text: string;
  type: "default" | "primary" | "danger";
  action: string;
  extra?: Record<string, string>;
}

export interface PlatformCardSelectOption {
  text: string;
  action: string;
}

export function createPlatformCard(): PlatformCardBuilder {
  return new PlatformCardBuilder();
}

export class PlatformCardBuilder {
  private readonly card: PlatformCard = { elements: [] };

  title(title: string, color: PlatformCardColor): this {
    this.card.header = { title, color };
    return this;
  }

  markdown(content: string): this {
    if (content.trim()) {
      this.card.elements.push({ kind: "markdown", content });
    }
    return this;
  }

  divider(): this {
    this.card.elements.push({ kind: "divider" });
    return this;
  }

  buttonRow(buttons: PlatformCardButton[], layout: PlatformCardActionLayout = "row"): this {
    if (buttons.length > 0) {
      this.card.elements.push({ kind: "actions", buttons, layout });
    }
    return this;
  }

  listItem(text: string, button: PlatformCardButton): this {
    this.card.elements.push({ kind: "list_item", text, button });
    return this;
  }

  select(placeholder: string, options: PlatformCardSelectOption[], initialAction?: string): this {
    if (options.length > 0) {
      this.card.elements.push({ kind: "select", placeholder, options, initialAction });
    }
    return this;
  }

  note(text: string, tag?: string): this {
    if (text.trim()) {
      this.card.elements.push({ kind: "note", text, tag });
    }
    return this;
  }

  build(): PlatformCard {
    return {
      header: this.card.header ? { ...this.card.header } : undefined,
      elements: [...this.card.elements]
    };
  }
}
