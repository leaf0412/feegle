import { parsePlatformAction } from "./platform-action.js";

export interface PlatformActionContext {
  raw: string;
  command: string;
  args: string;
  sessionKey: string;
}

export type PlatformActionHandler = (context: PlatformActionContext) => Promise<unknown>;

export class PlatformActionRouter {
  private readonly navHandlers = new Map<string, PlatformActionHandler>();
  private readonly actHandlers = new Map<string, PlatformActionHandler>();
  private readonly cmdHandlers = new Map<string, PlatformActionHandler>();

  registerNav(command: string, handler: PlatformActionHandler): void {
    this.navHandlers.set(command, handler);
  }

  registerAct(command: string, handler: PlatformActionHandler): void {
    this.actHandlers.set(command, handler);
  }

  registerCommand(command: string, handler: PlatformActionHandler): void {
    this.cmdHandlers.set(command, handler);
  }

  async route(raw: string, sessionKey: string): Promise<unknown> {
    const action = parsePlatformAction(raw);
    if (action.kind === "nav") {
      return this.invoke(this.navHandlers, action.command, action.args, action.raw, sessionKey);
    }
    if (action.kind === "act") {
      return this.invoke(this.actHandlers, action.command, action.args, action.raw, sessionKey);
    }
    if (action.kind === "cmd") {
      return this.invoke(this.cmdHandlers, action.command, action.args, action.raw, sessionKey);
    }
    return undefined;
  }

  private async invoke(
    handlers: Map<string, PlatformActionHandler>,
    command: string,
    args: string,
    raw: string,
    sessionKey: string
  ): Promise<unknown> {
    const handler = handlers.get(command);
    if (!handler) {
      return undefined;
    }
    return handler({ command, args, raw, sessionKey });
  }
}
