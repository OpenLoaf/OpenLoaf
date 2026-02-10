import {
  AI_MODEL_TAG_LABELS,
  type AiModelCapabilities,
  type AiModelTag,
  type AiProviderTemplate,
} from "@tenas-saas/sdk";

export type ChatModelSource = "local" | "cloud";

export type ModelTag = AiModelTag;

export type ModelDefinition = {
  /** Model id. */
  id: string;
  /** Display name. */
  name?: string;
  /** Icon identifier. */
  icon?: string;
  /** Model family id. */
  familyId?: string;
  /** Provider id. */
  providerId?: string;
  /** Model tags. */
  tags?: ModelTag[];
  /** Model capabilities. */
  capabilities?: AiModelCapabilities;
  /** Allow extra fields from SaaS. */
  [key: string]: unknown;
};

export type ModelCapabilities = AiModelCapabilities;

export type ModelCapabilityCommon = NonNullable<ModelCapabilities["common"]>;
export type ModelCapabilityParams = NonNullable<ModelCapabilities["params"]>;
export type ModelCapabilityInput = NonNullable<ModelCapabilities["input"]>;
export type ModelCapabilityOutput = NonNullable<ModelCapabilities["output"]>;

export type ModelParameterDefinition =
  NonNullable<ModelCapabilityParams["fields"]>[number];
export type ModelParameterFeature =
  NonNullable<ModelCapabilityParams["features"]>[number];
export type ModelParameterType = ModelParameterDefinition["type"];

// 标签显示文案映射。
export const MODEL_TAG_LABELS: Record<ModelTag, string> = AI_MODEL_TAG_LABELS;

export type ProviderDefinition = Omit<AiProviderTemplate, "models"> & {
  /** Adapter id — defaults to provider id. */
  adapterId: string;
  /** Auth type: apiKey (default) or hmac. */
  authType?: string;
  /** Auth config template for UI. */
  authConfig?: Record<string, unknown>;
  /** Models with local extensions. */
  models: ModelDefinition[];
};
