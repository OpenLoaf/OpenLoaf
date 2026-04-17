/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { AiModelCapabilities } from "@openloaf-saas/sdk";

export type ChatModelSource = "local" | "cloud" | "saas";

/**
 * Canonical model capability tags for OpenLoaf.
 *
 * Previously split between SDK-provided media tags and OpenLoaf-local chat tags.
 * Since @openloaf-saas/sdk v0.2.0 dropped AI_MODEL_TAGS and variant.tags, all
 * tags are now owned locally; variants coming from SaaS are translated via
 * cloudModelMapper (inputSlots + capabilities → tags).
 */
export const MODEL_TAGS = [
  // Media input/analysis tags used by attachmentTagExpander and model-capabilities.
  "image_input",
  "image_analysis",
  "video_analysis",
  "audio_analysis",
  // Chat-side behavioral tags.
  "chat",
  "code",
  "tool_call",
  "reasoning",
] as const;

export type ModelTag = (typeof MODEL_TAGS)[number];

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
