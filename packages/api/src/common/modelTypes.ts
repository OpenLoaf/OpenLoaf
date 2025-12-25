export enum ModelCapabilityId {
  TextInput = "text_input",
  TextOutput = "text_output",
  ImageInput = "image_input",
  ImageOutput = "image_output",
  VideoInput = "video_input",
  VideoOutput = "video_output",
  AudioInput = "audio_input",
  AudioOutput = "audio_output",
  Reasoning = "reasoning",
  Tools = "tools",
  Rerank = "rerank",
  Embedding = "embedding",
  StructuredOutput = "structured_output",
}

export type ChatModelSource = "local" | "cloud";

export type ModelPrice = {
  /** 价格对应的能力类型 */
  capabilityId: ModelCapabilityId;
  /** 价格数值（按每 1,000,000 tokens 或按能力单位计） */
  price: number;
  /** 是否为缓存价格 */
  isCache?: boolean;
};

export type ModelDefinition = {
  /** 模型唯一 ID */
  id: string;
  /** 模型展示名称（可为空） */
  label?: string;
  /** 模型能力列表 */
  capability: ModelCapabilityId[];
  /** 上下文窗口大小（K） */
  maxContextK: number;
  /** 价格列表 */
  prices: ModelPrice[];
  /** 货币符号 */
  currencySymbol: string;
};

export type ModelCatalogOptions = {
  providerId: string;
  apiUrl: string;
  models: ModelDefinition[];
};

/** Resolve model price by capability and cache flag. */
export function getModelPrice(
  definition: ModelDefinition | undefined,
  capabilityId: ModelCapabilityId,
  options?: { isCache?: boolean },
): number | undefined {
  if (!definition || !Array.isArray(definition.prices)) return;
  const targetCache = options?.isCache ?? false;
  const match = definition.prices.find(
    (item) => item.capabilityId === capabilityId && Boolean(item.isCache) === targetCache,
  );
  return typeof match?.price === "number" ? match.price : undefined;
}

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
