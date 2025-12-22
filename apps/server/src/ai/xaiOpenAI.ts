import { createOpenAI } from "@ai-sdk/openai";

// 使用 OpenAI 兼容协议访问 xAI 接口。
export const xaiOpenAI = createOpenAI({
  baseURL: "https://api.x.ai/v1",
  apiKey: process.env.XAI_API_KEY,
  name: "xai",
});
