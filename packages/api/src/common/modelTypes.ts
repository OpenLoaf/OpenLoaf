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

// 标签显示文案映射。
export const MODEL_TAG_LABELS: Record<ModelTag, string> = {
  text_generation: "文字生成",
  image_input: "图片输入",
  image_generation: "图片生成",
  image_multi_input: "多图输入",
  image_multi_generation: "多图生成",
  image_edit: "图片编辑",
  video_generation: "视频生成",
  tool_call: "工具调用",
  code: "代码",
  web_search: "网络搜索",
  speech_generation: "语音生成",
};

export type PriceTier = {
  /** Minimum context window (K) for this tier. */
  minContextK: number;
  /** Input token price per 1M. */
  input: number;
  /** Cached input token price per 1M. */
  inputCache: number;
  /** Output token price per 1M. */
  output: number;
};

export type ModelDefinition = {
  /** Unique model id. */
  id: string;
  /** Model family id. */
  familyId: string;
  /** Provider id owning the model. */
  providerId: string;
  /** Tags for filtering. */
  tags: ModelTag[];
  /** Max context window (K) used for pricing tier selection. */
  maxContextK: number;
  /** Pricing strategy id. */
  priceStrategyId: string;
  /** Pricing tiers for the strategy. */
  priceTiers: PriceTier[];
  /** Currency symbol for price display. */
  currencySymbol?: string;
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

export type Usage = {
  /** Current context size (K). */
  contextK: number;
  /** Input tokens (non-cached). */
  inputTokens: number;
  /** Cached input tokens. */
  inputCacheTokens: number;
  /** Output tokens. */
  outputTokens: number;
};

export type PriceResult = {
  /** Input cost. */
  inputCost: number;
  /** Cached input cost. */
  inputCacheCost: number;
  /** Output cost. */
  outputCost: number;
  /** Total cost. */
  total: number;
};

export type PricingStrategy = {
  /** Strategy id. */
  id: string;
  /** Estimate price cost by usage. */
  estimate: (definition: ModelDefinition, usage: Usage) => PriceResult;
};
