import type { WorkflowDefinition } from "./runtime-models.js";

export class WorkflowRegistry {
  private readonly definitions = new Map<string, WorkflowDefinition>();

  register(definition: WorkflowDefinition): void {
    if (this.definitions.has(definition.definitionId)) {
      throw new Error(`Workflow definition already registered: ${definition.definitionId}`);
    }
    this.definitions.set(definition.definitionId, definition);
  }

  require(definitionId: string): WorkflowDefinition {
    const definition = this.definitions.get(definitionId);
    if (!definition) {
      throw new Error(`Workflow definition not registered: ${definitionId}`);
    }
    return definition;
  }
}
