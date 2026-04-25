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

/** Reasoning (deep-thinking) capability — v3 capabilities 独立字段。 */
export type ModelReasoningCapability = "none" | "always" | "optional";

/** Input slot data type — directly mirrors v3 inputSlot.accept. */
export const MODEL_INPUT_ACCEPTS = [
  "text",
  "image",
  "video",
  "audio",
  "file",
] as const;

export type ModelInputAccept = (typeof MODEL_INPUT_ACCEPTS)[number];

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
  /** Accepted input data types — derived from v3 variant.inputSlots[].accept. */
  inputAccepts?: ModelInputAccept[];
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
  /** Reasoning (deep-thinking) capability state. 缺失视为 "none"。 */
  reasoning?: ModelReasoningCapability;
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
