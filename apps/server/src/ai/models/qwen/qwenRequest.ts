export type QwenRequestInput = {
  /** Prompt text. */
  prompt?: string;
  /** Image edit prompt. */
  imageEditPrompt?: string;
  /** Image URL list. */
  imageUrls?: string[];
  /** Base64 image list. */
  binaryDataBase64?: string[];
  /** Output width. */
  width?: number;
  /** Output height. */
  height?: number;
  /** Random seed. */
  seed?: number;
  /** Video parameters. */
  parameters?: Record<string, string | number | boolean>;
};

type QwenContentPart = { image: string } | { text: string };

type QwenImageOutput = {
  /** Generated image URLs. */
  imageUrls: string[];
  /** Returned prompt text. */
  promptText?: string;
  /** Reasoning text. */
  reasoningText?: string;
  /** Token usage. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

/** Qwen generation endpoint path. */
const QWEN_GENERATION_PATH = "/services/aigc/multimodal-generation/generation";
/** Qwen video generation endpoint path. */
const QWEN_VIDEO_GENERATION_PATH = "/services/aigc/video-generation/video-synthesis";

/** Build Qwen API request URL. */
export function buildQwenRequestUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/$/, "");
  url.pathname = `${basePath}${QWEN_GENERATION_PATH}`;
  return url.toString();
}

/** Build Qwen video API request URL. */
export function buildQwenVideoRequestUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/$/, "");
  url.pathname = `${basePath}${QWEN_VIDEO_GENERATION_PATH}`;
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

/** Resolve prompt text. */
function resolvePrompt(input: QwenRequestInput) {
  if (typeof input.prompt === "string") return input.prompt;
  if (typeof input.imageEditPrompt === "string") return input.imageEditPrompt;
  return "";
}

/** Resolve image inputs. */
function resolveImages(input: QwenRequestInput): string[] {
  if (Array.isArray(input.imageUrls) && input.imageUrls.length > 0) {
    return input.imageUrls.filter((item) => typeof item === "string" && item.trim());
  }
  if (Array.isArray(input.binaryDataBase64) && input.binaryDataBase64.length > 0) {
    return input.binaryDataBase64.filter((item) => typeof item === "string" && item.trim());
  }
  return [];
}

/** Resolve size string. */
function resolveSize(input: QwenRequestInput, separator: string) {
  if (!input.width || !input.height) return undefined;
  return `${input.width}${separator}${input.height}`;
}

/** 按需挑选参数，避免透传无关字段。 */
function pickParameters(
  parameters: Record<string, string | number | boolean> | undefined,
  keys: string[],
) {
  if (!parameters) return undefined;
  const picked: Record<string, string | number | boolean> = {};
  for (const key of keys) {
    const value = parameters[key];
    if (value === undefined) continue;
    picked[key] = value;
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
}

/** Build Qwen message content array. */
function buildContent(images: string[], prompt: string): QwenContentPart[] {
  const content: QwenContentPart[] = images.map((image) => ({ image }));
  if (prompt) content.push({ text: prompt });
  return content;
}

/** Build Qwen request payload. */
export function buildQwenRequestPayload(modelId: string, input: QwenRequestInput) {
  const prompt = resolvePrompt(input);
  const images = resolveImages(input);
  const rawParameters = input.parameters;

  if (modelId === "qwen-image-edit-plus") {
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
        seed: input.seed,
      }),
    });
  }

  if (modelId === "wan2.5" || modelId === "z-image-turbo") {
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
        seed: input.seed,
      }),
    });
  }

  if (modelId === "qwen-image-plus" || modelId === "qwen-image") {
    if (!prompt) throw new Error("Qwen 文生图需要提示词");
    if (images.length > 0) throw new Error("Qwen 文生图不支持输入图片");
    const size = resolveSize(input, "*");
    const parameters = pickParameters(rawParameters, [
      "negative_prompt",
      "prompt_extend",
      "watermark",
    ]);
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
        ...(parameters ?? {}),
        size,
      }),
    });
  }

  if (modelId === "wan2.6-t2i") {
    if (!prompt) throw new Error("Qwen 文生图需要提示词");
    if (images.length > 0) throw new Error("Qwen 文生图不支持输入图片");
    const size = resolveSize(input, "*");
    const parameters = pickParameters(rawParameters, [
      "negative_prompt",
      "prompt_extend",
      "watermark",
      "n",
    ]);
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
        ...(parameters ?? {}),
        size,
        seed: input.seed,
      }),
    });
  }

  if (modelId === "wan2.6-image") {
    if (!prompt) throw new Error("Qwen 图像生成需要提示词");
    const size = resolveSize(input, "*");
    const enableInterleave = rawParameters?.enable_interleave === true;
    const imageLimit = enableInterleave ? 1 : 4;
    const parameters = pickParameters(rawParameters, [
      "negative_prompt",
      "prompt_extend",
      "watermark",
      "n",
      "enable_interleave",
      "max_images",
      "stream",
    ]);
    return cleanPayload({
      model: modelId,
      input: {
        messages: [
          {
            role: "user",
            content: buildContent(images.slice(0, imageLimit), prompt),
          },
        ],
      },
      parameters: cleanPayload({
        ...(parameters ?? {}),
        size,
        seed: input.seed,
      }),
    });
  }

  if (modelId === "wan2.6-i2v-flash" || modelId === "wan2.6-i2v") {
    if (images.length === 0) throw new Error("Qwen 视频生成需要首帧图片");
    const params = input.parameters ?? {};
    return cleanPayload({
      model: modelId,
      input: cleanPayload({
        prompt,
        img_url: images[0],
      }),
      parameters: cleanPayload({
        resolution: params.resolution,
        duration: params.duration,
        seed: input.seed,
      }),
    });
  }

  throw new Error("不支持的 Qwen 模型");
}

/** Parse Qwen image response output. */
export function parseQwenImageOutput(payload: unknown): QwenImageOutput {
  const images: string[] = [];
  let promptText: string | undefined;
  let reasoningText: string | undefined;
  let usage: QwenImageOutput["usage"];

  if (payload && typeof payload === "object") {
    const raw = payload as any;
    const output = raw.output;
    const choices = Array.isArray(output?.choices) ? output.choices : [];
    const message = choices[0]?.message;
    const content = Array.isArray(message?.content) ? message.content : [];
    for (const item of content) {
      if (item?.image && typeof item.image === "string") images.push(item.image);
      if (!promptText && item?.text && typeof item.text === "string") {
        promptText = item.text;
      }
    }
    if (typeof message?.reasoning_content === "string") {
      reasoningText = message.reasoning_content;
    }

    const rawUsage = raw.usage ?? {};
    const toNumber = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) ? value : undefined;
    usage = {
      inputTokens: toNumber(rawUsage.input_tokens),
      outputTokens: toNumber(rawUsage.output_tokens),
      totalTokens: toNumber(rawUsage.total_tokens),
    };
    if (usage && Object.values(usage).every((value) => value === undefined)) {
      usage = undefined;
    }
  }

  return {
    imageUrls: images,
    promptText,
    reasoningText,
    usage,
  };
}
