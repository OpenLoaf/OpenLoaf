import { ModelCapabilityId, ModelCatalog, type ModelDefinition } from "../modelTypes";

export const XAI_API_URL = "https://api.x.ai/v1";

// xAI 模型清单，默认均支持工具调用。
export const XAI_MODELS: ModelDefinition[] = [
  {
    id: "grok-4-1-fast-reasoning",
    capability: [
      ModelCapabilityId.TextInput,
      ModelCapabilityId.TextOutput,
      ModelCapabilityId.ImageInput,
    ],
    maxContextK: 2000,
    prices: [
      { capabilityId: ModelCapabilityId.TextInput, price: 0.2 },
      { capabilityId: ModelCapabilityId.TextOutput, price: 0.5 },
      { capabilityId: ModelCapabilityId.TextInput, price: 0.02, isCache: true },
    ],
    currencySymbol: "$",
  },
  {
    id: "grok-4-1-fast-non-reasoning",
    capability: [
      ModelCapabilityId.TextInput,
      ModelCapabilityId.TextOutput,
      ModelCapabilityId.ImageInput,
    ],
    maxContextK: 2000,
    prices: [
      { capabilityId: ModelCapabilityId.TextInput, price: 0.2 },
      { capabilityId: ModelCapabilityId.TextOutput, price: 0.5 },
      { capabilityId: ModelCapabilityId.TextInput, price: 0.02, isCache: true },
    ],
    currencySymbol: "$",
  },
  {
    id: "grok-code-fast-1",
    capability: [ModelCapabilityId.TextInput, ModelCapabilityId.TextOutput],
    maxContextK: 256,
    prices: [
      { capabilityId: ModelCapabilityId.TextInput, price: 0.2 },
      { capabilityId: ModelCapabilityId.TextOutput, price: 1.5 },
      { capabilityId: ModelCapabilityId.TextInput, price: 0.02, isCache: true },
    ],
    currencySymbol: "$",
  },
  {
    id: "grok-4-fast-reasoning",
    capability: [
      ModelCapabilityId.TextInput,
      ModelCapabilityId.TextOutput,
      ModelCapabilityId.ImageInput,
    ],
    maxContextK: 2000,
    prices: [
      { capabilityId: ModelCapabilityId.TextInput, price: 0.2 },
      { capabilityId: ModelCapabilityId.TextOutput, price: 0.5 },
      { capabilityId: ModelCapabilityId.TextInput, price: 0.02, isCache: true },
    ],
    currencySymbol: "$",
  },
  {
    id: "grok-4-fast-non-reasoning",
    capability: [
      ModelCapabilityId.TextInput,
      ModelCapabilityId.TextOutput,
      ModelCapabilityId.ImageInput,
    ],
    maxContextK: 2000,
    prices: [
      { capabilityId: ModelCapabilityId.TextInput, price: 0.2 },
      { capabilityId: ModelCapabilityId.TextOutput, price: 0.5 },
      { capabilityId: ModelCapabilityId.TextInput, price: 0.02, isCache: true },
    ],
    currencySymbol: "$",
  },
];

export const XAI_MODEL_CATALOG = new ModelCatalog({
  providerId: "xai",
  apiUrl: XAI_API_URL,
  models: XAI_MODELS,
});
