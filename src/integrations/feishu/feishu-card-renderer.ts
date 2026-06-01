import type { PlatformCard, PlatformCardButton } from "@platform/platform-card.js";

export function renderFeishuCard(card: PlatformCard, sessionKey?: string): Record<string, unknown> {
  const result: Record<string, unknown> = {
    config: {
      wide_screen_mode: true,
      update_multi: true
    }
  };

  if (card.header) {
    result.header = {
      template: card.header.color,
      title: plainText(card.header.title)
    };
  }

  const elements = card.elements.flatMap((element): unknown[] => {
    if (element.kind === "markdown") {
      return [{ tag: "markdown", content: element.content }];
    }
    if (element.kind === "divider") {
      return [{ tag: "hr" }];
    }
    if (element.kind === "note") {
      return [{ tag: "note", elements: [plainText(element.text)] }];
    }
    if (element.kind === "actions") {
      const actions = element.buttons.map((button) => renderButton(button, sessionKey));
      if (element.layout === "equal_columns") {
        return [
          {
            tag: "column_set",
            flex_mode: actions.length === 2 ? "bisect" : undefined,
            columns: actions.map((action) => ({
              tag: "column",
              width: "weighted",
              weight: 1,
              vertical_align: "center",
              horizontal_align: "center",
              elements: [{ ...action, width: "fill" }]
            }))
          }
        ];
      }
      return [{ tag: "action", actions }];
    }
    if (element.kind === "list_item") {
      return [
        {
          tag: "column_set",
          flex_mode: "none",
          columns: [
            {
              tag: "column",
              width: "weighted",
              weight: 5,
              vertical_align: "center",
              elements: [{ tag: "markdown", content: element.text }]
            },
            {
              tag: "column",
              width: "auto",
              vertical_align: "center",
              elements: [renderButton(element.button, sessionKey)]
            }
          ]
        }
      ];
    }
    if (element.kind === "select") {
      return [
        {
          tag: "action",
          actions: [
            {
              tag: "select_static",
              placeholder: plainText(element.placeholder),
              options: element.options.map((option) => ({
                text: plainText(option.text),
                value: option.action
              })),
              value: sessionKey ? { session_key: sessionKey } : undefined,
              initial_option: element.initialAction
            }
          ]
        }
      ];
    }
    if (element.kind === "form_input") {
      const submitButton = renderButton(element.button, sessionKey);
      return [
        {
          tag: "form",
          name: `${element.name}_form`,
          elements: [
            {
              tag: "input",
              name: element.name,
              placeholder: plainText(element.placeholder)
            },
            { ...submitButton, action_type: "form_submit" }
          ]
        }
      ];
    }
    return [];
  });

  result.elements = elements.length > 0 ? elements : [{ tag: "markdown", content: " " }];
  return result;
}

function renderButton(button: PlatformCardButton, sessionKey?: string): Record<string, unknown> {
  return {
    tag: "button",
    text: plainText(button.text),
    type: button.type,
    value: {
      action: button.action,
      ...(sessionKey ? { session_key: sessionKey } : {}),
      ...(button.extra ?? {})
    }
  };
}

function plainText(content: string): { tag: "plain_text"; content: string } {
  return { tag: "plain_text", content };
}
