import {
  createModelRegistry,
  type ModelDefinition,
  type ProviderDefinition,
} from "@openloaf/api/common";
import {
  fetchProviderTemplates,
  invalidateProviderCache,
} from "./fetch-providers";

let normalizedProviders: ProviderDefinition[] = [];
let modelDefinitions: ModelDefinition[] = [];
let providerById = new Map<string, ProviderDefinition>();
let modelByKey = new Map<string, ModelDefinition>();
let registry = createModelRegistry([]);
let initialized = false;

/** Initialize model registry from SaaS provider templates. */
export async function initModelRegistry(saasUrl: string) {
  const providers = await fetchProviderTemplates(saasUrl);
  applyProviders(providers);
}

/** Refresh model registry by invalidating cache and re-fetching. */
export async function refreshModelRegistry(saasUrl: string) {
  invalidateProviderCache();
  await initModelRegistry(saasUrl);
}

/** Apply provider definitions to internal state. */
function applyProviders(providers: ProviderDefinition[]) {
  normalizedProviders = providers.map((provider) => ({
    ...provider,
    models: Array.isArray(provider.models) ? provider.models : [],
  }));
  modelDefinitions = normalizedProviders.flatMap((provider) =>
    (provider.models ?? []).map((model) => ({
      ...model,
      // 统一覆盖 providerId，避免数据不一致。
      providerId: provider.id,
    })),
  );
  providerById = new Map(
    normalizedProviders.map((provider) => [provider.id, provider]),
  );
  modelByKey = new Map(
    modelDefinitions.map((model) => [
      `${model.providerId}:${model.id}`,
      model,
    ]),
  );
  registry = createModelRegistry(modelDefinitions);
  initialized = true;
}

/** Whether the registry has been initialized. */
export function isModelRegistryReady() {
  return initialized;
}

export { registry as MODEL_REGISTRY };

/** Return all provider definitions. */
export function getProviderDefinitions(): ProviderDefinition[] {
  return normalizedProviders;
}

/** Build provider options for UI selectors. */
export function getProviderOptions(): Array<{ id: string; label: string }> {
  return normalizedProviders.map((provider) => ({
    id: provider.id,
    label: provider.label || provider.id,
  }));
}

/** Resolve provider definition by id. */
export function getProviderDefinition(
  providerId: string,
): ProviderDefinition | undefined {
  return providerById.get(providerId);
}

/** Resolve model definition by provider and model id. */
export function resolveModelDefinition(
  providerId: string,
  modelId: string,
): ModelDefinition | undefined {
  return modelByKey.get(`${providerId}:${modelId}`);
}

/** List models for a provider. */
export function getProviderModels(providerId: string): ModelDefinition[] {
  return modelDefinitions.filter(
    (model) => model.providerId === providerId,
  );
}

/** Resolve display label for a model. */
export function getModelLabel(model: ModelDefinition): string {
  // 优先使用配置的展示名，没有就回退到 id。
  return model.name ?? model.id;
}

/** Build a concise label for selected models. */
export function getModelSummary(
  models: ModelDefinition[],
  selected: string[],
) {
  if (models.length === 0) return "暂无可选模型";
  if (selected.length === 0) return "请选择模型";
  const selectedSet = new Set(selected);
  const visible = models
    .filter((model) => selectedSet.has(model.id))
    .slice(0, 2);
  const labels = visible.map((model) => getModelLabel(model));
  if (selected.length <= 2) return labels.join("、");
  return `${labels.join("、")} +${selected.length - 2}`;
}
