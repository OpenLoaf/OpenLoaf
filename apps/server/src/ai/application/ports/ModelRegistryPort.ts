import type { ModelDefinition, ProviderDefinition } from "@tenas-ai/api/common";

export interface ModelRegistryPort {
  /** Resolve model definition. */
  getModel(providerId: string, modelId: string): ModelDefinition | undefined;
  /** Resolve provider definition. */
  getProvider(providerId: string): ProviderDefinition | undefined;
}
