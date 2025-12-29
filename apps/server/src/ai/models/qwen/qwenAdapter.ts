import type {
  ProviderAdapter,
  ProviderRequest,
  ProviderRequestInput,
  ProviderTaskResult,
} from "@/modules/model/providerAdapters";
import { resolveQwenConfig } from "./qwenConfig";

/** Qwen generation endpoint path. */
const QWEN_GENERATION_PATH = "/services/aigc/multimodal-generation/generation";

type QwenResponse = {
  /** Request id. */
  request_id?: string;
  /** Request id in camel case. */
  requestId?: string;
  /** Output payload. */
  output?: { task_id?: string } | null;
};

/** Build Qwen API url from base url. */
function buildQwenUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/$/, "");
  url.pathname = `${basePath}${QWEN_GENERATION_PATH}`;
  return url.toString();
}

/** Remove undefined fields from payload. */
function cleanPayload(payload: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

/** Resolve prompt text from input payload. */
function resolvePrompt(input: ProviderRequestInput) {
  const payload = input.payload as Record<string, unknown>;
  if (typeof payload.prompt === "string") return payload.prompt;
  if (typeof payload.imageEditPrompt === "string") return payload.imageEditPrompt;
  return "";
}

/** Resolve images from input payload. */
function resolveImages(input: ProviderRequestInput): string[] {
  const payload = input.payload as {
    imageUrls?: string[];
    binaryDataBase64?: string[];
  };
  if (Array.isArray(payload.imageUrls) && payload.imageUrls.length > 0) {
    return payload.imageUrls;
  }
  if (Array.isArray(payload.binaryDataBase64) && payload.binaryDataBase64.length > 0) {
    return payload.binaryDataBase64;
  }
  return [];
}

/** Resolve size string for Qwen parameters. */
function resolveSize(input: ProviderRequestInput, separator: string) {
  const payload = input.payload as { width?: number; height?: number };
  if (!payload.width || !payload.height) return undefined;
  return `${payload.width}${separator}${payload.height}`;
}

/** Build content array for Qwen messages. */
function buildContent(images: string[], prompt: string) {
  const content = images.map((image) => ({ image }));
  if (prompt) content.push({ text: prompt });
  return content;
}

/** Parse Qwen response into task result. */
async function parseQwenResponse(response: Response): Promise<ProviderTaskResult> {
  const json = (await response.json()) as QwenResponse;
  const taskId = json.output?.task_id?.trim() || json.request_id || json.requestId || "";
  if (!taskId) throw new Error("Qwen 返回缺少 task_id");
  return { taskId };
}

/** Build Qwen request for the target model. */
function buildQwenRequest(modelId: string, input: ProviderRequestInput): Record<string, unknown> {
  const prompt = resolvePrompt(input);
  const images = resolveImages(input);
  if (modelId === "qwen-image-edit-plus") {
    // 中文注释：图像编辑必须包含至少一张图片与提示词。
    if (!prompt) throw new Error("Qwen 图像编辑需要提示词");
    if (images.length === 0) throw new Error("Qwen 图像编辑需要输入图片");
    const size = resolveSize(input, "x");
    return cleanPayload({
      model: modelId,
      input: {
        messages: [
          {
            role: "user",
            content: buildContent(images.slice(0, 3), prompt),
          },
        ],
      },
      parameters: cleanPayload({
        size,
        seed: (input.payload as { seed?: number }).seed,
      }),
    });
  }
  if (modelId === "wan2.5" || modelId === "z-image-turbo") {
    // 中文注释：文生图仅允许文本输入。
    if (!prompt) throw new Error("Qwen 文生图需要提示词");
    if (images.length > 0) throw new Error("Qwen 文生图不支持输入图片");
    const size = resolveSize(input, "*");
    return cleanPayload({
      model: modelId,
      input: {
        messages: [
          {
            role: "user",
            content: [{ text: prompt }],
          },
        ],
      },
      parameters: cleanPayload({
        size,
        seed: (input.payload as { seed?: number }).seed,
      }),
    });
  }
  throw new Error("不支持的 Qwen 模型");
}

export const qwenAdapter: ProviderAdapter = {
  id: "qwenAdapter",
  buildAiSdkModel: () => null,
  buildRequest: ({ provider, providerDefinition, modelId, input }): ProviderRequest | null => {
    const config = resolveQwenConfig({ provider, providerDefinition });
    const body = JSON.stringify(buildQwenRequest(modelId, input));
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    };
    // 中文注释：wan2.5 仅支持异步调用，需要添加异步请求头。
    if (modelId === "wan2.5") {
      headers["X-DashScope-Async"] = "enable";
    }
    return {
      url: buildQwenUrl(config.apiUrl),
      method: "POST",
      headers,
      body,
      parseResponse: parseQwenResponse,
    };
  },
};
