import { ModelCapabilityId, ModelCatalog, type ModelDefinition } from "../modelTypes";

// 通义模型默认使用 DashScope API 地址。
export const QWEN_API_URL = "https://dashscope.aliyuncs.com/api/v1";

// 通义图像模型清单（价格待补，先留空以便后续维护）。
export const QWEN_MODELS: ModelDefinition[] = [
  {
    id: "qwen-image-edit-plus",
    capability: [
      ModelCapabilityId.TextInput,
      ModelCapabilityId.ImageInput,
      ModelCapabilityId.ImageOutput,
    ],
    maxContextK: 0,
    prices: [],
    currencySymbol: "¥",
  },
  {
    id: "wan2.5",
    capability: [ModelCapabilityId.TextInput, ModelCapabilityId.ImageOutput],
    maxContextK: 0,
    prices: [],
    currencySymbol: "¥",
  },
  {
    id: "z-image-turbo",
    capability: [ModelCapabilityId.TextInput, ModelCapabilityId.ImageOutput],
    maxContextK: 0,
    prices: [],
    currencySymbol: "¥",
  },
];

// 通义模型目录配置。
export const QWEN_MODEL_CATALOG = new ModelCatalog({
  providerId: "qwen",
  apiUrl: QWEN_API_URL,
  models: QWEN_MODELS,
});
