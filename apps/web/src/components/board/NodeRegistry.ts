import type { CanvasNodeDefinition } from "./CanvasTypes";

export class NodeRegistry {
  /** Node definitions mapped by type. */
  private readonly definitions = new Map<string, CanvasNodeDefinition<unknown>>();

  /** Register a single node definition. */
  register<P>(definition: CanvasNodeDefinition<P>): void {
    if (this.definitions.has(definition.type)) {
      throw new Error(`Node type already registered: ${definition.type}`);
    }
    this.definitions.set(definition.type, definition as CanvasNodeDefinition<unknown>);
  }

  /** Register multiple node definitions. */
  registerAll(definitions: CanvasNodeDefinition<unknown>[]): void {
    definitions.forEach(definition => this.register(definition));
  }

  /** Resolve a node definition by type. */
  getDefinition(type: string): CanvasNodeDefinition<unknown> | null {
    return this.definitions.get(type) ?? null;
  }

  /** Return all registered node definitions. */
  getDefinitions(): CanvasNodeDefinition<unknown>[] {
    return Array.from(this.definitions.values());
  }
}
