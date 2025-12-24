import { ModelCatalog, type ModelDefinition } from "../modelTypes";

export const XAI_API_URL = "https://api.x.ai/v1";

// xAI 模型清单，默认均支持工具调用。
export const XAI_MODELS: ModelDefinition[] = [
  {
    id: "grok-4-1-fast-reasoning",
    capability: ["text", "vision_input"],
    maxContextK: 2000,
    priceInPerMillion: 0.2,
    priceOutPerMillion: 0.5,
    cachedInputPerMillion: 0.02,
    currencySymbol: "$",
  },
  {
    id: "grok-4-1-fast-non-reasoning",
    capability: ["text", "vision_input"],
    maxContextK: 2000,
    priceInPerMillion: 0.2,
    priceOutPerMillion: 0.5,
    cachedInputPerMillion: 0.02,
    currencySymbol: "$",
  },
  {
    id: "grok-code-fast-1",
    capability: ["text"],
    maxContextK: 256,
    priceInPerMillion: 0.2,
    priceOutPerMillion: 1.5,
    cachedInputPerMillion: 0.02,
    currencySymbol: "$",
  },
  {
    id: "grok-4-fast-reasoning",
    capability: ["text", "vision_input"],
    maxContextK: 2000,
    priceInPerMillion: 0.2,
    priceOutPerMillion: 0.5,
    cachedInputPerMillion: 0.02,
    currencySymbol: "$",
  },
  {
    id: "grok-4-fast-non-reasoning",
    capability: ["text", "vision_input"],
    maxContextK: 2000,
    priceInPerMillion: 0.2,
    priceOutPerMillion: 0.5,
    cachedInputPerMillion: 0.02,
    currencySymbol: "$",
  },
];

export const XAI_MODEL_CATALOG = new ModelCatalog({
  providerId: "xai",
  apiUrl: XAI_API_URL,
  models: XAI_MODELS,
});
