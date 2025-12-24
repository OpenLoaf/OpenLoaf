export type ModelCapabilityId =
  | "text_input" // 文本输入
  | "text_output" // 文本输出
  | "image_input" // 图片输入
  | "image_output" // 图片输出
  | "video_input" // 视频输入
  | "video_output" // 视频输出
  | "audio_input" // 音频输入
  | "audio_output" // 音频输出
  | "reasoning" // 推理
  | "tools" // 工具
  | "rerank" // 重排
  | "embedding" // 嵌入
  | "structured_output"; // 结构化输出

export type ChatModelSource = "local" | "cloud";

export type ModelDefinition = {
  id: string;
  capability: ModelCapabilityId[];
  maxContextK: number;
  priceTextInputPerMillion: number;
  priceTextOutputPerMillion: number;
  priceImageInputPerMillion?: number;
  priceImageOutputPerMillion?: number;
  priceVideoInputPerMillion?: number;
  priceVideoOutputPerMillion?: number;
  priceAudioInputPerMillion?: number;
  priceAudioOutputPerMillion?: number;
  cachedTextInputPerMillion?: number;
  cachedImageInputPerMillion?: number;
  cachedVideoInputPerMillion?: number;
  cachedAudioInputPerMillion?: number;
  currencySymbol: string;
};

export type ModelCatalogOptions = {
  providerId: string;
  apiUrl: string;
  models: ModelDefinition[];
};

export class ModelCatalog {
  readonly providerId: string;
  readonly apiUrl: string;
  readonly models: ModelDefinition[];

  /** Create a catalog with API URL and models. */
  constructor(options: ModelCatalogOptions) {
    // 统一入口，便于后续扩展校验逻辑。
    this.providerId = options.providerId;
    this.apiUrl = options.apiUrl;
    this.models = options.models;
  }

  /** Get provider id. */
  getProviderId() {
    return this.providerId;
  }

  /** Get API URL. */
  getApiUrl() {
    return this.apiUrl;
  }

  /** Get model list. */
  getModels() {
    return this.models;
  }
}
