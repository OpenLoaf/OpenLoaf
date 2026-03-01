/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
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
  chat: "对话",
  code: "代码",
  tool_call: "工具调用",
  reasoning: "推理",
  image_generation: "图像生成",
  image_input: "图片理解",
  image_multi_input: "多图输入",
  image_multi_generation: "多图生成",
  image_edit: "图像编辑",
  image_analysis: "图像分析",
  video_generation: "视频生成",
  video_analysis: "视频理解",
  audio_analysis: "音频分析",
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
