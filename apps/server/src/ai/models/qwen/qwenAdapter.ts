import type {
  ProviderAdapter,
  ProviderRequest,
  ProviderRequestInput,
  ProviderTaskResult,
} from "@/ai/models/providerAdapters";
import { logger } from "@/common/logger";
import { resolveQwenConfig } from "./qwenConfig";
import {
  buildQwenRequestPayload,
  buildQwenRequestUrl,
  buildQwenVideoRequestUrl,
  type QwenRequestInput,
} from "./qwenRequest";
import { buildQwenImageModel } from "./qwenImageModel";

type QwenResponse = {
  /** Request id. */
  request_id?: string;
  /** Request id in camel case. */
  requestId?: string;
  /** Output payload. */
  output?: { task_id?: string } | null;
};

/** Parse Qwen task response. */
async function parseQwenResponse(response: Response): Promise<ProviderTaskResult> {
  const json = (await response.json()) as QwenResponse;
  const taskId = json.output?.task_id?.trim() || json.request_id || json.requestId || "";
  if (!taskId) throw new Error("Qwen 返回缺少 task_id");
  return { taskId };
}

export const qwenAdapter: ProviderAdapter = {
  id: "qwen",
  buildAiSdkModel: () => null,
  buildImageModel: (input) => buildQwenImageModel(input),
  buildRequest: ({ provider, providerDefinition, modelId, input }): ProviderRequest | null => {
    const config = resolveQwenConfig({ provider, providerDefinition });
    const payload = input.payload as QwenRequestInput;
    const isVideoModel = modelId === "wan2.6-i2v-flash" || modelId === "wan2.6-i2v";
    const promptLength =
      typeof payload?.prompt === "string"
        ? payload.prompt.length
        : typeof payload?.imageEditPrompt === "string"
          ? payload.imageEditPrompt.length
          : 0;
    const imageCount =
      Array.isArray(payload?.imageUrls) && payload.imageUrls.length > 0
        ? payload.imageUrls.length
        : Array.isArray(payload?.binaryDataBase64)
          ? payload.binaryDataBase64.length
          : 0;
    const requestUrl = isVideoModel
      ? buildQwenVideoRequestUrl(config.apiUrl)
      : buildQwenRequestUrl(config.apiUrl);
    logger.debug(
      {
        modelId,
        providerId: provider.providerId,
        requestUrl,
        promptLength,
        imageCount,
      },
      "[qwen] build request",
    );
    const body = JSON.stringify(buildQwenRequestPayload(modelId, payload));
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    };
    // 中文注释：wan2.5 仅支持异步调用，需要添加异步请求头。
    if (modelId === "wan2.5" || isVideoModel) {
      headers["X-DashScope-Async"] = "enable";
    }
    return {
      url: requestUrl,
      method: "POST",
      headers,
      body,
      parseResponse: parseQwenResponse,
    };
  },
};
