import type { IOType, ModelDefinition, ModelTag, ProviderDefinition } from "./modelTypes";

export type ModelSpec = (definition: ModelDefinition) => boolean;

export type ModelRegistry = {
  /** All model definitions. */
  models: ModelDefinition[];
  /** Filter models by spec. */
  filter: (spec: ModelSpec) => ModelDefinition[];
};

export type ProviderRegistry = {
  /** All provider definitions. */
  providers: ProviderDefinition[];
  /** Resolve provider definition. */
  getProvider: (providerId: string) => ProviderDefinition | undefined;
};

/** Build a registry for querying model definitions. */
export function createModelRegistry(models: ModelDefinition[]): ModelRegistry {
  return {
    models,
    filter: (spec) => models.filter(spec),
  };
}

/** Build a registry for provider definitions. */
export function createProviderRegistry(providers: ProviderDefinition[]): ProviderRegistry {
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  return {
    providers,
    getProvider: (providerId) => providerById.get(providerId),
  };
}

/** Build a model spec for required input types. */
export function byInput(input: IOType[]): ModelSpec {
  return (definition) => input.every((item) => definition.input.includes(item));
}

/** Build a model spec for required output types. */
export function byOutput(output: IOType[]): ModelSpec {
  return (definition) => output.every((item) => definition.output.includes(item));
}

/** Build a model spec for a specific tag. */
export function byTag(tag: ModelTag): ModelSpec {
  return (definition) => definition.tags.includes(tag);
}

/** Build an AND spec composition. */
export function andSpec(...specs: ModelSpec[]): ModelSpec {
  return (definition) =>
    specs.every((spec) => {
      // 中文注释：所有条件都匹配时才视为命中。
      return spec(definition);
    });
}
