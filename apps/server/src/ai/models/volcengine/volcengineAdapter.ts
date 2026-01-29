import type {
  ProviderAdapter,
  ProviderRequest,
  ProviderRequestInput,
  ProviderTaskResult,
} from "@/ai/models/providerAdapters";
import { buildVolcengineRequest } from "./volcengineClient";
import { resolveVolcengineConfig } from "./volcengineConfig";
import { buildVolcengineImageModel } from "./volcengineImageModel";

/** Submit action name for Volcengine. */
const VOLCENGINE_ACTION_SUBMIT = "CVSync2AsyncSubmitTask";

/** Map model ids to req_key values. */
const VOLCENGINE_MODEL_REQ_KEYS = {
  jimeng_t2i_v40: "jimeng_t2i_v40",
  jimeng_t2i_v31: "jimeng_t2i_v31",
  jimeng_image2image_dream_inpaint: "jimeng_image2image_dream_inpaint",
  i2i_material_extraction: "i2i_material_extraction",
  jimeng_ti2v_v30_pro: "jimeng_ti2v_v30_pro",
} as const;

/** Map model ids to supported request kind. */
const VOLCENGINE_MODEL_KINDS: Record<
  keyof typeof VOLCENGINE_MODEL_REQ_KEYS,
  ProviderRequestInput["kind"]
> = {
  jimeng_t2i_v40: "textToImage",
  jimeng_t2i_v31: "textToImage",
  jimeng_image2image_dream_inpaint: "inpaint",
  i2i_material_extraction: "materialExtract",
  jimeng_ti2v_v30_pro: "videoGenerate",
};

type VolcengineResponse<T> = {
  /** Gateway metadata. */
  ResponseMetadata?: {
    /** Error payload. */
    Error?: { Code?: string; Message?: string };
  } | null;
  /** Business code. */
  code?: number;
  /** Business message. */
  message?: string;
  /** Data payload. */
  data?: T | null;
};

/** Parse Volcengine submit response and return task id. */
async function parseVolcengineSubmitResponse(response: Response): Promise<ProviderTaskResult> {
  const json = (await response.json()) as VolcengineResponse<{ task_id?: string }>;
  const data = unwrapVolcengineResponse(json);
  const taskId = data?.task_id?.trim() ?? "";
  if (!taskId) throw new Error("提交任务失败：task_id 为空");
  return { taskId };
}

/** Unwrap Volcengine response or throw on errors. */
function unwrapVolcengineResponse<T>(response: VolcengineResponse<T>): T | null {
  if (response.ResponseMetadata?.Error?.Code) {
    const message = response.ResponseMetadata.Error.Message ?? "网关错误";
    throw new Error(`Volcengine网关错误: ${message}`);
  }
  if (response.code !== 10000) {
    const message = response.message ?? "服务返回失败";
    throw new Error(`Volcengine请求失败: ${message}`);
  }
  return response.data ?? null;
}

/** Build Volcengine payload based on model and input. */
function buildVolcenginePayload(modelId: string, input: ProviderRequestInput) {
  const reqKey = VOLCENGINE_MODEL_REQ_KEYS[modelId as keyof typeof VOLCENGINE_MODEL_REQ_KEYS];
  if (!reqKey) throw new Error("不支持的即梦模型");

  const expectedKind = VOLCENGINE_MODEL_KINDS[modelId as keyof typeof VOLCENGINE_MODEL_REQ_KEYS];
  if (input.kind !== expectedKind) {
    throw new Error("模型能力与请求类型不匹配");
  }

  if (input.kind === "textToImage") {
    const payload = input.payload;
    return {
      req_key: reqKey,
      image_urls: payload.imageUrls,
      prompt: payload.prompt,
      size: payload.size,
      width: payload.width,
      height: payload.height,
      scale: payload.scale,
      force_single: payload.forceSingle,
      min_ratio: payload.minRatio,
      max_ratio: payload.maxRatio,
      seed: payload.seed,
    };
  }

  if (input.kind === "inpaint") {
    const payload = input.payload;
    // 中文注释：必须提供原图+mask 两张图，二选一即可。
    if (
      (!payload.imageUrls || payload.imageUrls.length !== 2) &&
      (!payload.binaryDataBase64 || payload.binaryDataBase64.length !== 2)
    ) {
      throw new Error("Inpaint 输入需包含 2 张图片（原图+mask）");
    }
    return {
      req_key: reqKey,
      image_urls: payload.imageUrls,
      binary_data_base64: payload.binaryDataBase64,
      prompt: payload.prompt,
      seed: payload.seed,
    };
  }

  if (input.kind === "materialExtract") {
    const payload = input.payload;
    // 中文注释：素材提取仅需 1 张图片，二选一即可。
    if (
      (!payload.imageUrls || payload.imageUrls.length !== 1) &&
      (!payload.binaryDataBase64 || payload.binaryDataBase64.length !== 1)
    ) {
      throw new Error("素材提取输入需包含 1 张图片");
    }
    return {
      req_key: reqKey,
      image_urls: payload.imageUrls,
      binary_data_base64: payload.binaryDataBase64,
      image_edit_prompt: payload.imageEditPrompt,
      lora_weight: payload.loraWeight,
      width: payload.width,
      height: payload.height,
      seed: payload.seed,
    };
  }

  if (input.kind === "videoGenerate") {
    const payload = input.payload;
    const parameters = payload.parameters ?? {};
    // 中文注释：即梦使用 frames 计数，按秒数换算为 24 * n + 1。
    const durationValue =
      typeof parameters.duration === "number" ? parameters.duration : undefined;
    const frames =
      typeof durationValue === "number" ? Math.round(durationValue * 24 + 1) : payload.frames;
    const aspectRatio =
      typeof parameters.aspectRatio === "string" ? parameters.aspectRatio : payload.aspectRatio;
    // 中文注释：文生视频必须有 prompt，图生视频必须有首帧图。
    if (!payload.prompt && !payload.imageUrls?.length && !payload.binaryDataBase64?.length) {
      throw new Error("视频生成需要 prompt 或首帧图片");
    }
    return {
      req_key: reqKey,
      prompt: payload.prompt,
      image_urls: payload.imageUrls,
      binary_data_base64: payload.binaryDataBase64,
      seed: payload.seed,
      frames,
      aspect_ratio: aspectRatio,
    };
  }

  throw new Error("不支持的请求类型");
}

export const volcengineAdapter: ProviderAdapter = {
  id: "volcengine",
  buildAiSdkModel: () => null,
  buildImageModel: (input) => buildVolcengineImageModel(input),
  buildRequest: ({ provider, providerDefinition, modelId, input }): ProviderRequest | null => {
    const config = resolveVolcengineConfig({ provider, providerDefinition });
    const payload = buildVolcenginePayload(modelId, input);
    const request = buildVolcengineRequest(config, VOLCENGINE_ACTION_SUBMIT, payload);
    return {
      ...request,
      parseResponse: parseVolcengineSubmitResponse,
    };
  },
};
