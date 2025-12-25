import { ModelCapabilityId, ModelCatalog, type ModelDefinition } from "../modelTypes";

export const DEEPSEEK_API_URL = "https://api.deepseek.com";

export const DEEPSEEK_MODELS: ModelDefinition[] = [
  {
    id: "deepseek-chat",
    capability: [ModelCapabilityId.TextInput, ModelCapabilityId.TextOutput],
    maxContextK: 128,
    prices: [
      { capabilityId: ModelCapabilityId.TextInput, price: 2 },
      { capabilityId: ModelCapabilityId.TextOutput, price: 3 },
      { capabilityId: ModelCapabilityId.TextInput, price: 0.2, isCache: true },
    ],
    currencySymbol: "¥",
  },
  {
    id: "deepseek-reasoner",
    capability: [ModelCapabilityId.TextInput, ModelCapabilityId.TextOutput],
    maxContextK: 128,
    prices: [
      { capabilityId: ModelCapabilityId.TextInput, price: 2 },
      { capabilityId: ModelCapabilityId.TextOutput, price: 3 },
      { capabilityId: ModelCapabilityId.TextInput, price: 0.2, isCache: true },
    ],
    currencySymbol: "¥",
  },
];

export const DEEPSEEK_MODEL_CATALOG = new ModelCatalog({
  providerId: "deepseek",
  apiUrl: DEEPSEEK_API_URL,
  models: DEEPSEEK_MODELS,
});
