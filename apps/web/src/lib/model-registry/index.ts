import {
  createModelRegistry,
  type ModelDefinition,
  type ProviderDefinition,
} from "@tenas-ai/api/common";
import providerPayload from "./providers.generated.json";

const providers = (Array.isArray(providerPayload)
  ? providerPayload
  : Array.isArray(providerPayload.providers)
    ? providerPayload.providers
    : []) as ProviderDefinition[];

const normalizedProviders = providers.map((provider) => ({
  ...provider,
  models: Array.isArray(provider.models) ? provider.models : [],
}));

const modelDefinitions: ModelDefinition[] = normalizedProviders.flatMap((provider) => {
  return provider.models.map((model) => ({
    ...model,
    // 中文注释：统一覆盖 providerId，避免 JSON 手误导致过滤失败。
    providerId: provider.id,
  }));
});

const providerById = new Map(normalizedProviders.map((provider) => [provider.id, provider]));
const modelByKey = new Map(
  modelDefinitions.map((model) => [`${model.providerId}:${model.id}`, model]),
);

export const MODEL_REGISTRY = createModelRegistry(modelDefinitions);

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
export function getProviderDefinition(providerId: string): ProviderDefinition | undefined {
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
  return modelDefinitions.filter((model) => model.providerId === providerId);
}

/** Resolve display label for a model. */
export function getModelLabel(model: ModelDefinition): string {
  // 中文注释：优先使用配置的展示名，没有就回退到 id。
  return model.name ?? model.id;
}

/** Build a concise label for selected models. */
export function getModelSummary(models: ModelDefinition[], selected: string[]) {
  if (models.length === 0) return "暂无可选模型";
  if (selected.length === 0) return "请选择模型";
  const selectedSet = new Set(selected);
  const visible = models.filter((model) => selectedSet.has(model.id)).slice(0, 2);
  const labels = visible.map((model) => getModelLabel(model));
  if (selected.length <= 2) return labels.join("、");
  return `${labels.join("、")} +${selected.length - 2}`;
}
