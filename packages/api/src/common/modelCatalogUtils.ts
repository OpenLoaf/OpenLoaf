import type { ModelDefinition } from "./modelTypes";
import { DEEPSEEK_MODEL_CATALOG } from "./models/DeepseekModels";
import { GOOGLE_MODEL_CATALOG } from "./models/GoogleModels";
import { QWEN_MODEL_CATALOG } from "./models/QwenModels";
import { VOLCENGINE_MODEL_CATALOG } from "./models/VolcengineModels";
import { XAI_MODEL_CATALOG } from "./models/XaiModels";

export type ProviderId =
  | "anthropic"
  | "deepseek"
  | "google"
  | "openai"
  | "qwen"
  | "xai"
  | "volcengine"
  | "custom";

export const PROVIDER_OPTIONS: Array<{ id: ProviderId; label: string }> = [
  { id: "openai", label: "openai" },
  { id: "anthropic", label: "anthropic" },
  { id: "google", label: "Google" },
  { id: "deepseek", label: "deepseek" },
  // 通义模型入口。
  { id: "qwen", label: "Qwen" },
  { id: "xai", label: "xai" },
  { id: "volcengine", label: "火山引擎" },
  { id: "custom", label: "自定义" },
];

export const MODEL_CATALOG_BY_PROVIDER: Partial<
  Record<ProviderId, typeof XAI_MODEL_CATALOG>
> = {
  xai: XAI_MODEL_CATALOG,
  deepseek: DEEPSEEK_MODEL_CATALOG,
  google: GOOGLE_MODEL_CATALOG,
  qwen: QWEN_MODEL_CATALOG,
  volcengine: VOLCENGINE_MODEL_CATALOG,
};

/** Resolve model label with fallback to id. */
export function getModelLabel(model: ModelDefinition): string {
  if (typeof model.label === "string" && model.label.trim()) {
    return model.label.trim();
  }
  return model.id;
}

/** Provide the default API URL for known providers. */
export function getDefaultApiUrl(provider: ProviderId) {
  const defaults: Record<ProviderId, string> = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    google: "https://generativelanguage.googleapis.com/v1beta",
    deepseek: "https://api.deepseek.com/v1",
    qwen: "https://dashscope.aliyuncs.com/api/v1",
    xai: "https://api.x.ai/v1",
    volcengine: "https://visual.volcengineapi.com",
    custom: "",
  };
  return defaults[provider];
}

/** Provide the default display name for a provider. */
export function getDefaultProviderName(provider: ProviderId) {
  const defaults: Record<ProviderId, string> = {
    openai: "OPENAI",
    anthropic: "ANTHROPIC",
    google: "Google",
    deepseek: "Deepseek",
    qwen: "Qwen",
    xai: "XAI",
    volcengine: "火山引擎",
    custom: "",
  };
  return defaults[provider];
}

/** Get model ids from the provider catalog. */
export function getDefaultModelIds(provider: ProviderId) {
  const catalog = MODEL_CATALOG_BY_PROVIDER[provider];
  if (!catalog) return [];
  const [first] = catalog.getModels();
  return first ? [first.id] : [];
}

/** Build a label for selected models. */
export function getModelSummary(models: ModelDefinition[], selected: string[]) {
  if (models.length === 0) return "暂无可选模型";
  if (selected.length === 0) return "请选择模型";
  const selectedSet = new Set(selected);
  const visible = models.filter((model) => selectedSet.has(model.id)).slice(0, 2);
  const labels = visible.map((model) => getModelLabel(model));
  if (selected.length <= 2) return labels.join("、");
  return `${labels.join("、")} +${selected.length - 2}`;
}

/** Build labels for all selected models. */
export function getSelectedModelLabels(models: ModelDefinition[]) {
  if (!Array.isArray(models) || models.length === 0) return "未配置";
  return models.map((model) => getModelLabel(model)).join("、");
}

/** Resolve model definitions from the provider catalog. */
export function resolveModelDefinitions(
  provider: ProviderId,
  modelIds: string[],
): ModelDefinition[] {
  const catalog = MODEL_CATALOG_BY_PROVIDER[provider];
  if (!catalog) return [];
  const modelById = new Map(catalog.getModels().map((model) => [model.id, model]));
  return modelIds
    .map((modelId) => modelById.get(modelId))
    .filter((model): model is ModelDefinition => Boolean(model));
}
