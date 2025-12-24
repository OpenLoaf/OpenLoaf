import { ModelCatalog, type ModelDefinition } from "../modelTypes";

export const GOOGLE_API_URL = "https://generativelanguage.googleapis.com/v1beta";

// Google 模型清单。
export const GOOGLE_MODELS: ModelDefinition[] = [
  {
    id: "gemini-3-pro-image-preview",
    capability: [
      "text_input",
      "text_output",
      "image_input",
      "image_output",
      "reasoning",
    ],
    maxContextK: 0,
    priceTextInputPerMillion: 2,
    priceTextOutputPerMillion: 12,
    priceImageInputPerMillion: 2,
    priceImageOutputPerMillion: 120,
    cachedTextInputPerMillion: 2,
    cachedImageInputPerMillion: 2,
    currencySymbol: "$",
  },
  {
    id: "gemini-3-flash-preview",
    capability: ["text_input", "text_output", "image_input", "video_input", "audio_input"],
    maxContextK: 0,
    priceTextInputPerMillion: 0.5,
    priceTextOutputPerMillion: 3,
    priceImageInputPerMillion: 0.5,
    priceVideoInputPerMillion: 0.5,
    priceAudioInputPerMillion: 1,
    cachedTextInputPerMillion: 0.05,
    cachedImageInputPerMillion: 0.05,
    cachedVideoInputPerMillion: 0.05,
    cachedAudioInputPerMillion: 0.1,
    currencySymbol: "$",
  },
];

export const GOOGLE_MODEL_CATALOG = new ModelCatalog({
  providerId: "google",
  apiUrl: GOOGLE_API_URL,
  models: GOOGLE_MODELS,
});
