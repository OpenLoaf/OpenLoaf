import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createModelRegistry,
  createProviderRegistry,
  type ModelDefinition,
  type ProviderDefinition,
} from "@teatime-ai/api/common";

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

// Resolve repo root based on current file location.
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);
/** Directory storing per-provider model definition JSON files. */
const MODEL_DEFINITION_DIR = path.join(
  PROJECT_ROOT,
  "apps/web/src/lib/model-registry/providers",
);

let cachedRegistry: RegistryCache | null = null;

/** Load and cache registry data from JSON. */
function loadRegistryCache(): RegistryCache {
  if (cachedRegistry) return cachedRegistry;
  let providers: ProviderDefinition[] = [];
  try {
    // 逻辑：逐个读取 provider JSON，跳过解析失败的文件。
    const files = fs.readdirSync(MODEL_DEFINITION_DIR, { withFileTypes: true });
    const jsonFiles = files
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(MODEL_DEFINITION_DIR, entry.name));
    providers = jsonFiles
      .map((filePath) => {
        try {
          const raw = fs.readFileSync(filePath, "utf-8");
          return JSON.parse(raw) as ProviderDefinition;
        } catch {
          return null;
        }
      })
      .filter((provider): provider is ProviderDefinition => Boolean(provider));
  } catch {
    providers = [];
  }
  const normalizedProviders = providers.map((provider) => ({
    ...provider,
    models: Array.isArray(provider.models) ? provider.models : [],
  }));
  const models = normalizedProviders.flatMap((provider) => {
    return provider.models.map((model) => ({
      ...model,
      // 中文注释：统一覆盖 providerId，避免 JSON 手误导致过滤失败。
      providerId: provider.id,
    }));
  });
  cachedRegistry = {
    providers: normalizedProviders,
    models,
    modelByKey: new Map(models.map((model) => [`${model.providerId}:${model.id}`, model])),
    providerById: new Map(normalizedProviders.map((provider) => [provider.id, provider])),
  };
  return cachedRegistry;
}

/** Resolve provider definition by id. */
export function getProviderDefinition(providerId: string): ProviderDefinition | undefined {
  return loadRegistryCache().providerById.get(providerId);
}

/** Resolve model definition by provider and model id. */
export function getModelDefinition(
  providerId: string,
  modelId: string,
): ModelDefinition | undefined {
  return loadRegistryCache().modelByKey.get(`${providerId}:${modelId}`);
}

/** Build model registry for filtering. */
export function getModelRegistry() {
  const { models } = loadRegistryCache();
  return createModelRegistry(models);
}

/** Build provider registry for adapters. */
export function getProviderRegistry() {
  const { providers } = loadRegistryCache();
  return createProviderRegistry(providers);
}
