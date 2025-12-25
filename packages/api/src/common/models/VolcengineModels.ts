import { ModelCapabilityId, ModelCatalog, type ModelDefinition } from "../modelTypes";

export const VOLCENGINE_MODELS: ModelDefinition[] = [
  {
    id: "volcengine.t2i.v40",
    label: "即梦文生图 4.0",
    capability: [ModelCapabilityId.TextInput, ModelCapabilityId.ImageOutput],
    maxContextK: 1,
    prices: [
      { capabilityId: ModelCapabilityId.TextInput, price: 0 },
      { capabilityId: ModelCapabilityId.ImageOutput, price: 0 },
    ],
    currencySymbol: "¥",
  },
  {
    id: "volcengine.inpaint.v1",
    label: "即梦局部重绘/消除笔",
    capability: [
      ModelCapabilityId.TextInput,
      ModelCapabilityId.ImageInput,
      ModelCapabilityId.ImageOutput,
    ],
    maxContextK: 1,
    prices: [
      { capabilityId: ModelCapabilityId.TextInput, price: 0 },
      { capabilityId: ModelCapabilityId.ImageInput, price: 0 },
      { capabilityId: ModelCapabilityId.ImageOutput, price: 0 },
    ],
    currencySymbol: "¥",
  },
  {
    id: "volcengine.material.v1",
    label: "即梦素材提取",
    capability: [
      ModelCapabilityId.TextInput,
      ModelCapabilityId.ImageInput,
      ModelCapabilityId.ImageOutput,
    ],
    maxContextK: 1,
    prices: [
      { capabilityId: ModelCapabilityId.TextInput, price: 0 },
      { capabilityId: ModelCapabilityId.ImageInput, price: 0 },
      { capabilityId: ModelCapabilityId.ImageOutput, price: 0 },
    ],
    currencySymbol: "¥",
  },
  {
    id: "volcengine.video.v30pro",
    label: "即梦视频 3.0 Pro",
    capability: [
      ModelCapabilityId.TextInput,
      ModelCapabilityId.ImageInput,
      ModelCapabilityId.VideoOutput,
    ],
    maxContextK: 1,
    prices: [
      { capabilityId: ModelCapabilityId.TextInput, price: 0 },
      { capabilityId: ModelCapabilityId.ImageInput, price: 0 },
      { capabilityId: ModelCapabilityId.VideoOutput, price: 0 },
    ],
    currencySymbol: "¥",
  },
];

export const VOLCENGINE_MODEL_CATALOG = new ModelCatalog({
  providerId: "volcengine",
  apiUrl: "https://visual.volcengineapi.com",
  models: VOLCENGINE_MODELS,
});
