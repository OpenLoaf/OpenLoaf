import { ModelCatalog, type ModelDefinition } from "../modelTypes";

export const DEEPSEEK_API_URL = "https://api.deepseek.com";

export const DEEPSEEK_MODELS: ModelDefinition[] = [
  {
    id: "deepseek-chat",
    capability: ["text_input", "text_output"],
    maxContextK: 128,
    priceTextInputPerMillion: 2,
    priceTextOutputPerMillion: 3,
    cachedTextInputPerMillion: 0.2,
    currencySymbol: "¥",
  },
  {
    id: "deepseek-reasoner",
    capability: ["text_input", "text_output"],
    maxContextK: 128,
    priceTextInputPerMillion: 2,
    priceTextOutputPerMillion: 3,
    cachedTextInputPerMillion: 0.2,
    currencySymbol: "¥",
  },
];

export const DEEPSEEK_MODEL_CATALOG = new ModelCatalog({
  providerId: "deepseek",
  apiUrl: DEEPSEEK_API_URL,
  models: DEEPSEEK_MODELS,
});
