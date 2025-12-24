import { ModelCatalog, type ModelDefinition } from "../modelTypes";

export const DEEPSEEK_API_URL = "https://api.deepseek.com";

export const DEEPSEEK_MODELS: ModelDefinition[] = [
  {
    id: "deepseek-chat",
    capability: ["text"],
    maxContextK: 128,
    priceInPerMillion: 2,
    priceOutPerMillion: 3,
    cachedInputPerMillion: 0.2,
    currencySymbol: "¥",
  },
  {
    id: "deepseek-reasoner",
    capability: ["text"],
    maxContextK: 128,
    priceInPerMillion: 2,
    priceOutPerMillion: 3,
    cachedInputPerMillion: 0.2,
    currencySymbol: "¥",
  },
];

export const DEEPSEEK_MODEL_CATALOG = new ModelCatalog({
  providerId: "deepseek",
  apiUrl: DEEPSEEK_API_URL,
  models: DEEPSEEK_MODELS,
});
