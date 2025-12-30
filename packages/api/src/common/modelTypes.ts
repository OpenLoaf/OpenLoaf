export type ChatModelSource = "local" | "cloud";

export type IOType = "text" | "image" | "audio" | "video";

export type ModelTag =
  | "text_to_image"
  | "image_to_image"
  | "image_to_text"
  | "image_edit"
  | "text_generation"
  | "video_generation"
  | "web_search"
  | "asr"
  | "tts"
  | "code"
  | "tool_call";

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
  /** Supported input types. */
  input: IOType[];
  /** Supported output types. */
  output: IOType[];
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
