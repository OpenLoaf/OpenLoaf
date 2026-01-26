import type { ModelRegistryPort } from "@/ai/models";
import type { ToolRegistryPort } from "@/ai/tools";

export type { AgentRunnerPort } from "./AgentRunnerPort";

export type AgentPorts = {
  /** Registry for model resolution. */
  modelRegistry: ModelRegistryPort;
  /** Registry for tool exposure. */
  toolRegistry: ToolRegistryPort;
};

export * from "./masterAgent/masterAgent";
