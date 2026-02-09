import type {
  AiChatModelTag,
  AiModel,
  AiModelCapabilities,
  AiModelTag,
} from "@tenas-saas/sdk";

export type ChatModelSource = "local" | "cloud";

export type ModelTag = AiModelTag | AiChatModelTag;

export type ModelDefinition = Omit<AiModel, "tags"> & {
  tags?: ModelTag[];
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
export const MODEL_TAG_LABELS: Record<ModelTag, string> = {
  chat: "对话",
  reasoning: "推理",
  tool_call: "工具调用",
  image_analysis: "图片分析",
  video_analysis: "视频分析",
  audio_analysis: "声音分析",
  code: "代码",
  image_input: "图片输入",
  image_multi_input: "多图输入",
  image_generation: "文生图",
  image_multi_generation: "多图生成",
  image_edit: "图片编辑",
  video_generation: "视频生成",
};

export type ProviderDefinition = {
  /** Provider id. */
  id: string;
  /** Display label. */
  label: string;
  /** Adapter id for runtime binding. */
  adapterId: string;
  /** Base API URL. */
  apiUrl: string;
  /** Raw auth config template. */
  authConfig?: Record<string, unknown>;
  /** Provider models (optional). */
  models?: ModelDefinition[];
};
