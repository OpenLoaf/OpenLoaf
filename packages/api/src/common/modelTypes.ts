export type ModelCapabilityId =
  | "text" // 文本（输入/输出）
  | "vision_input" // 视觉输入
  | "vision_output" // 视觉输出
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
  priceInPerMillion: number;
  priceOutPerMillion: number;
  cachedInputPerMillion?: number;
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
