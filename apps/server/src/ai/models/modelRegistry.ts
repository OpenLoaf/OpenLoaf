import type { AiProviderTemplate } from "@tenas-saas/sdk";
import type {
  ModelDefinition,
  ModelTag,
  ProviderDefinition,
} from "@tenas-ai/api/common";
import { getSaasClient } from "@/modules/saas/client";

type RegistryCache = {
  /** Provider definitions. */
  providers: ProviderDefinition[];
  /** Flattened model definitions. */
  models: ModelDefinition[];
  /** Lookup map for model definitions. */
  modelByKey: Map<string, ModelDefinition>;
  /** Lookup map for provider definitions. */
  providerById: Map<string, ProviderDefinition>;
};

let cachedRegistry: RegistryCache | null = null;
let fetchPromise: Promise<RegistryCache> | null = null;

/** Convert SaaS template to local ProviderDefinition. */
function toProviderDefinition(
  template: AiProviderTemplate,
): ProviderDefinition {
  return {
    ...template,
    adapterId: template.id,
    authConfig:
      template.authType === "hmac"
        ? { accessKeyId: "", secretAccessKey: "" }
        : { apiKey: "" },
    models: template.models.map(
      (model): ModelDefinition => ({
        ...model,
        name: model.displayName,
        tags: model.tags as ModelTag[],
        providerId: template.id,
      }),
    ),
  };
}

/** Build registry cache from provider definitions. */
function buildCache(providers: ProviderDefinition[]): RegistryCache {
  const normalizedProviders = providers.map((provider) => ({
    ...provider,
    models: Array.isArray(provider.models) ? provider.models : [],
  }));
  const models = normalizedProviders.flatMap((provider) =>
    (provider.models ?? []).map((model) => ({
      ...model,
      // 统一覆盖 providerId，避免数据不一致。
      providerId: provider.id,
    })),
  );
  return {
    providers: normalizedProviders,
    models,
    modelByKey: new Map(
      models.map((model) => [`${model.providerId}:${model.id}`, model]),
    ),
    providerById: new Map(
      normalizedProviders.map((provider) => [provider.id, provider]),
    ),
  };
}

/** Empty registry returned before initialization completes. */
const EMPTY_REGISTRY = buildCache([]);

/** Fetch provider templates from SaaS and build registry cache. */
async function fetchRegistry(): Promise<RegistryCache> {
  try {
    const client = getSaasClient();
    const response = await client.ai.providerTemplates();
    if (!response.success) {
      console.error("[ModelRegistry] 获取供应商模板失败");
      return EMPTY_REGISTRY;
    }
    const providers = response.data.providers.map(toProviderDefinition);
    return buildCache(providers);
  } catch (error) {
    console.error("[ModelRegistry] 获取供应商模板异常:", error);
    return EMPTY_REGISTRY;
  }
}

/** Load registry with deduplication — concurrent callers share one fetch. */
async function loadRegistryCache(): Promise<RegistryCache> {
  if (cachedRegistry) return cachedRegistry;
  if (!fetchPromise) {
    fetchPromise = fetchRegistry().then((registry) => {
      cachedRegistry = registry;
      fetchPromise = null;
      return registry;
    });
  }
  return fetchPromise;
}

/** Invalidate cached registry so next access re-fetches from SaaS. */
export function invalidateModelRegistry() {
  cachedRegistry = null;
  fetchPromise = null;
}

/** Resolve provider definition by id. */
export async function getProviderDefinition(
  providerId: string,
): Promise<ProviderDefinition | undefined> {
  const registry = await loadRegistryCache();
  return registry.providerById.get(providerId);
}

/** Resolve model definition by provider and model id. */
export async function getModelDefinition(
  providerId: string,
  modelId: string,
): Promise<ModelDefinition | undefined> {
  const registry = await loadRegistryCache();
  return registry.modelByKey.get(`${providerId}:${modelId}`);
}
