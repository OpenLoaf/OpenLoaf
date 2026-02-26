import {
  AI_MODEL_TAG_LABELS,
  type AiModelCapabilities,
  type AiModelTag,
} from "@openloaf-saas/sdk";

export type ChatModelSource = "local" | "cloud";

export type ModelTag = AiModelTag | "chat" | "code" | "tool_call" | "reasoning";

export type ModelCapabilityCommon = {
  maxContextK?: number;
  supportsWebSearch?: boolean;
  [key: string]: unknown;
};

export type ModelParameterType =
  | "select"
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | (string & {});

export type ModelParameterDefinition = {
  key: string;
  type: ModelParameterType;
  title?: string;
  description?: string;
  request?: boolean;
  unit?: string;
  values?: Array<string | number | boolean>;
  default?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
};

export type ModelParameterFeature = string;

export type ModelCapabilityParams = {
  fields?: ModelParameterDefinition[];
  features?: ModelParameterFeature[];
};

export type ModelCapabilities = AiModelCapabilities & {
  common?: ModelCapabilityCommon;
  params?: ModelCapabilityParams;
};

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
  capabilities?: ModelCapabilities;
  /** Allow extra fields from SaaS. */
  [key: string]: unknown;
};

export type ModelCapabilityInput = NonNullable<ModelCapabilities["input"]>;
export type ModelCapabilityOutput = NonNullable<ModelCapabilities["output"]>;

// Tag label mapping for UI.
export const MODEL_TAG_LABELS: Record<ModelTag, string> = {
  ...AI_MODEL_TAG_LABELS,
  chat: "Chat",
  code: "Code",
  tool_call: "Tool Call",
  reasoning: "Reasoning",
};

export type ProviderDefinition = {
  /** Provider id. */
  id: string;
  /** Provider label for UI display. */
  label?: string;
  /** Optional provider name. */
  name?: string;
  /** Provider category (e.g. provider / s3Provider). */
  category?: string;
  /** Default API base URL, if any. */
  apiUrl?: string;
  /** Adapter id - defaults to provider id. */
  adapterId: string;
  /** Auth type: apiKey (default) or hmac. */
  authType?: string;
  /** Auth config template for UI. */
  authConfig?: Record<string, unknown>;
  /** Models with local extensions. */
  models: ModelDefinition[];
  /** Allow extra fields from SaaS. */
  [key: string]: unknown;
};
