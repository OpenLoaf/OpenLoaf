export type ChatModelSource = "local" | "cloud";

export type ModelTag =
  | "text_generation"
  | "image_input"
  | "image_generation"
  | "image_multi_input"
  | "image_multi_generation"
  | "image_edit"
  | "video_generation"
  | "tool_call"
  | "code"
  | "web_search"
  | "speech_generation";

export type ModelParameterFeature =
  | "prompt"
  | "image_url_only"
  | "audio_url_only"
  | "last_frame_support";

export type ModelParameterType = "select" | "number" | "boolean" | "text";

export type ModelParameterDefinition = {
  /** Parameter key for request. */
  key: string;
  /** Display title for UI. */
  title: string;
  /** Helper text for UI. */
  description?: string;
  /** Parameter input type. */
  type: ModelParameterType;
  /** Display unit. */
  unit?: string;
  /** Selectable values for select type. */
  values?: Array<string | number | boolean>;
  /** Min value for number type. */
  min?: number;
  /** Max value for number type. */
  max?: number;
  /** Step for number type. */
  step?: number;
  /** Default value for parameter. */
  default?: string | number | boolean;
  /** Whether the parameter is required. */
  request: boolean;
};

// 标签显示文案映射。
export const MODEL_TAG_LABELS: Record<ModelTag, string> = {
  text_generation: "文字生成",
  image_input: "图片输入",
  image_generation: "文生图",
  image_multi_input: "多图输入",
  image_multi_generation: "多图生成",
  image_edit: "图片编辑",
  video_generation: "视频生成",
  tool_call: "工具调用",
  code: "代码",
  web_search: "网络搜索",
  speech_generation: "语音生成",
};

export type ModelDefinition = {
  /** Unique model id. */
  id: string;
  /** Display name for UI. */
  name?: string;
  /** Model family id. */
  familyId: string;
  /** Provider id owning the model. */
  providerId: string;
  /** Icon name for UI display. */
  icon?: string;
  /** Tags for filtering. */
  tags: ModelTag[];
  /** Max context window (K). */
  maxContextK: number;
  /** Parameter definitions for the model. */
  parameters?: {
    /** Feature flags for canvas behaviors. */
    features: ModelParameterFeature[];
    /** Field definitions for UI and validation. */
    fields: ModelParameterDefinition[];
  };
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
