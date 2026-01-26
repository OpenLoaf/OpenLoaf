export type ToolSpec = {
  /** Tool id. */
  id: string;
  /** Tool description. */
  description: string;
};

export interface ToolRegistryPort {
  /** Resolve tool spec by id. */
  getTool(id: string): ToolSpec | null;
}
