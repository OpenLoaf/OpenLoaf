import { ModelCapabilityId, ModelCatalog, type ModelDefinition } from "../modelTypes";

export const GOOGLE_API_URL = "https://generativelanguage.googleapis.com/v1beta";

// Google 模型清单。
export const GOOGLE_MODELS: ModelDefinition[] = [
  {
    id: "gemini-3-pro-image-preview",
    capability: [
      ModelCapabilityId.TextInput,
      ModelCapabilityId.TextOutput,
      ModelCapabilityId.ImageInput,
      ModelCapabilityId.ImageOutput,
      ModelCapabilityId.Reasoning,
    ],
    maxContextK: 0,
    prices: [
      { capabilityId: ModelCapabilityId.TextInput, price: 2 },
      { capabilityId: ModelCapabilityId.TextOutput, price: 12 },
      { capabilityId: ModelCapabilityId.ImageInput, price: 2 },
      { capabilityId: ModelCapabilityId.ImageOutput, price: 120 },
      { capabilityId: ModelCapabilityId.TextInput, price: 2, isCache: true },
      { capabilityId: ModelCapabilityId.ImageInput, price: 2, isCache: true },
    ],
    currencySymbol: "$",
  },
  {
    id: "gemini-3-flash-preview",
    capability: [
      ModelCapabilityId.TextInput,
      ModelCapabilityId.TextOutput,
      ModelCapabilityId.ImageInput,
      ModelCapabilityId.VideoInput,
      ModelCapabilityId.AudioInput,
    ],
    maxContextK: 0,
    prices: [
      { capabilityId: ModelCapabilityId.TextInput, price: 0.5 },
      { capabilityId: ModelCapabilityId.TextOutput, price: 3 },
      { capabilityId: ModelCapabilityId.ImageInput, price: 0.5 },
      { capabilityId: ModelCapabilityId.VideoInput, price: 0.5 },
      { capabilityId: ModelCapabilityId.AudioInput, price: 1 },
      { capabilityId: ModelCapabilityId.TextInput, price: 0.05, isCache: true },
      { capabilityId: ModelCapabilityId.ImageInput, price: 0.05, isCache: true },
      { capabilityId: ModelCapabilityId.VideoInput, price: 0.05, isCache: true },
      { capabilityId: ModelCapabilityId.AudioInput, price: 0.1, isCache: true },
    ],
    currencySymbol: "$",
  },
];

export const GOOGLE_MODEL_CATALOG = new ModelCatalog({
  providerId: "google",
  apiUrl: GOOGLE_API_URL,
  models: GOOGLE_MODELS,
});
