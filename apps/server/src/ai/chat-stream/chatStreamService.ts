import { generateImage, type UIMessage } from "ai";
import type { ModelDefinition } from "@tenas-ai/api/common";
import type { TenasUIMessage, TokenUsage } from "@tenas-ai/api/types/message";
import { createMasterAgentRunner } from "@/ai";
import { resolveChatModel } from "@/ai/resolveChatModel";
import { resolveImageModel } from "@/ai/resolveImageModel";
import {
  setChatModel,
  setAbortSignal,
  setCodexOptions,
  getWorkspaceId,
  getProjectId,
} from "@/ai/chat-stream/requestContext";
import { logger } from "@/common/logger";
import { normalizePromptForImageEdit } from "./imageEditNormalizer";
import { resolveImagePrompt } from "./imagePrompt";
import { saveGeneratedImages } from "./imageStorage";
import {
  createChatImageErrorResult,
  formatImageErrorMessage,
  formatInvalidRequestMessage,
  initRequestContext,
  loadAndPrepareMessageChain,
  saveLastMessageAndResolveParent,
} from "./chatStreamHelpers";
import { resolveCodexRequestOptions, resolveImageGenerateOptions } from "./messageOptionResolver";
import {
  resolveExplicitModelDefinition,
  resolvePreviousChatModelId,
  resolveRequiredInputTags,
} from "./modelResolution";
import type { ChatStreamRequest } from "./chatStreamTypes";
import {
  clearSessionErrorMessage,
  resolveRightmostLeafId,
  saveMessage,
  setSessionErrorMessage,
} from "./messageStore";
import type { ChatImageRequest, ChatImageRequestResult } from "./chatImageTypes";
import { buildTimingMetadata } from "./metadataBuilder";
import {
  createChatStreamResponse,
  createErrorStreamResponse,
  createImageStreamResponse,
} from "./streamOrchestrator";

type ImageModelRequest = {
  /** Session id. */
  sessionId: string;
  /** Incoming UI messages. */
  messages: UIMessage[];
  /** Abort signal for image generation. */
  abortSignal: AbortSignal;
  /** Image model id. */
  chatModelId?: string;
  /** Optional model definition. */
  modelDefinition?: ModelDefinition | null;
};

type ImageModelResult = {
  /** Image parts for immediate response. */
  imageParts: Array<{ type: "file"; url: string; mediaType: string }>;
  /** Persisted image parts for message storage. */
  persistedImageParts: Array<{ type: "file"; url: string; mediaType: string }>;
  /** Revised prompt text. */
  revisedPrompt?: string;
  /** Agent metadata for persistence. */
  agentMetadata: Record<string, unknown>;
  /** Token usage for metadata. */
  totalUsage?: TokenUsage;
};

/** Error with HTTP status for image requests. */
class ChatImageRequestError extends Error {
  /** HTTP status code. */
  status: number;

  /** Create a request error with HTTP status. */
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Run chat stream and return SSE response. */
export async function runChatStream(input: {
  /** Chat request payload. */
  request: ChatStreamRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
}): Promise<Response> {
  const {
    sessionId,
    messages: incomingMessages,
    messageId,
    clientId,
    tabId,
    chatModelId,
    chatModelSource,
    workspaceId,
    projectId,
  } = input.request;

  const { abortController, assistantMessageId, requestStartAt } = initRequestContext({
    sessionId,
    cookies: input.cookies,
    clientId,
    tabId,
    workspaceId,
    projectId,
    requestSignal: input.requestSignal,
    messageId,
  });

  const lastMessage = incomingMessages.at(-1) as TenasUIMessage | undefined;
  if (!lastMessage || !lastMessage.role || !lastMessage.id) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: "请求无效：缺少最后一条消息。",
    });
  }

  // 流程：保存最后一条消息 -> 补全历史链路 -> 解析模型 -> 启动 SSE stream 并落库 assistant。
  const saveResult = await saveLastMessageAndResolveParent({
    sessionId,
    lastMessage,
    requestStartAt,
    formatInvalid: (message) => `请求无效：${message}`,
    formatSaveError: (message) => `请求失败：${message}`,
  });
  if (!saveResult.ok) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: saveResult.errorText,
    });
  }

  const { leafMessageId, assistantParentUserId } = saveResult;
  const chainResult = await loadAndPrepareMessageChain({
    sessionId,
    leafMessageId,
    assistantParentUserId,
    formatError: (message) => `请求失败：${message}`,
  });
  if (!chainResult.ok) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: assistantParentUserId ?? (await resolveRightmostLeafId(sessionId)),
      errorText: chainResult.errorText,
    });
  }

  const { messages, modelMessages } = chainResult;
  setCodexOptions(resolveCodexRequestOptions(messages as UIMessage[]));

  if (!assistantParentUserId) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: "请求失败：找不到父消息。",
    });
  }
  const parentMessageId = assistantParentUserId;

  let agentMetadata: Record<string, unknown> = {};
  let masterAgent: ReturnType<typeof createMasterAgentRunner>;

  try {
    logger.debug(
      {
        sessionId,
        chatModelId,
        chatModelSource,
      },
      "[chat] resolve explicit model definition",
    );
    const explicitModelDefinition = await resolveExplicitModelDefinition(chatModelId);
    logger.debug(
      {
        sessionId,
        chatModelId,
        explicitModelId: explicitModelDefinition?.id,
        explicitProviderId: explicitModelDefinition?.providerId,
        explicitTags: explicitModelDefinition?.tags,
      },
      "[chat] explicit model resolved",
    );
    if (
      explicitModelDefinition?.tags?.includes("image_generation") ||
      explicitModelDefinition?.tags?.includes("image_edit")
    ) {
      logger.debug(
        {
          sessionId,
          chatModelId,
          tags: explicitModelDefinition.tags,
        },
        "[chat] route to image stream",
      );
      return await runImageModelStream({
        sessionId,
        assistantMessageId,
        parentMessageId,
        requestStartAt,
        messages: modelMessages as UIMessage[],
        abortSignal: abortController.signal,
        chatModelId: chatModelId ?? undefined,
        modelDefinition: explicitModelDefinition,
      });
    }

    // 按输入能力与历史偏好选择模型，失败时直接返回错误流。
    const requiredTags = !chatModelId ? resolveRequiredInputTags(messages as UIMessage[]) : [];
    const preferredChatModelId = !chatModelId
      ? resolvePreviousChatModelId(messages as UIMessage[])
      : null;
    const resolved = await resolveChatModel({
      chatModelId,
      chatModelSource,
      requiredTags,
      preferredChatModelId,
    });
    masterAgent = createMasterAgentRunner({
      model: resolved.model,
      modelInfo: resolved.modelInfo,
    });
    setChatModel(resolved.model);
    agentMetadata = {
      id: masterAgent.frame.agentId,
      name: masterAgent.frame.name,
      kind: masterAgent.frame.kind,
      model: masterAgent.frame.model,
      chatModelId: resolved.chatModelId,
      modelDefinition: resolved.modelDefinition,
    };
  } catch (err) {
    logger.error(
      {
        err,
        sessionId,
        chatModelId,
        chatModelSource,
      },
      "[chat] resolve chat model failed",
    );
    const errorText = err instanceof Error ? `请求失败：${err.message}` : "请求失败：模型解析失败。";
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId,
      errorText,
    });
  }

  return createChatStreamResponse({
    sessionId,
    assistantMessageId,
    parentMessageId,
    requestStartAt,
    modelMessages: modelMessages as UIMessage[],
    agentRunner: masterAgent,
    agentMetadata,
    abortController,
  });
}

/** Run chat image request and return JSON-friendly result. */
export async function runChatImageRequest(input: {
  /** Chat request payload. */
  request: ChatImageRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
}): Promise<ChatImageRequestResult> {
  const {
    sessionId,
    messages: incomingMessages,
    messageId,
    clientId,
    tabId,
    chatModelId,
    workspaceId,
    projectId,
    boardId,
  } = input.request;

  const { abortController, assistantMessageId, requestStartAt } = initRequestContext({
    sessionId,
    cookies: input.cookies,
    clientId,
    tabId,
    workspaceId,
    projectId,
    boardId,
    requestSignal: input.requestSignal,
    messageId,
  });

  const lastMessage = incomingMessages.at(-1) as TenasUIMessage | undefined;
  if (!lastMessage || !lastMessage.role || !lastMessage.id) {
    const errorText = formatInvalidRequestMessage("缺少最后一条消息。");
    await setSessionErrorMessage({ sessionId, errorMessage: errorText });
    return createChatImageErrorResult(400, errorText);
  }

  // 流程：
  // 1) 保存最后一条消息并确定父消息
  // 2) 加载消息链并替换图片输入
  // 3) 解析图片模型并生成图片
  // 4) 保存图片与 assistant 消息，返回完整 message
  const saveResult = await saveLastMessageAndResolveParent({
    sessionId,
    lastMessage,
    requestStartAt,
    formatInvalid: formatInvalidRequestMessage,
    formatSaveError: formatImageErrorMessage,
  });
  if (!saveResult.ok) {
    await setSessionErrorMessage({ sessionId, errorMessage: saveResult.errorText });
    return createChatImageErrorResult(saveResult.status, saveResult.errorText);
  }

  const { leafMessageId, assistantParentUserId } = saveResult;
  const chainResult = await loadAndPrepareMessageChain({
    sessionId,
    leafMessageId,
    assistantParentUserId,
    formatError: formatImageErrorMessage,
  });
  if (!chainResult.ok) {
    await setSessionErrorMessage({ sessionId, errorMessage: chainResult.errorText });
    return createChatImageErrorResult(400, chainResult.errorText);
  }
  const { messages, modelMessages } = chainResult;

  try {
    const explicitModelDefinition = await resolveExplicitModelDefinition(chatModelId);
    const imageResult = await generateImageModelResult({
      sessionId,
      messages: modelMessages as UIMessage[],
      abortSignal: abortController.signal,
      chatModelId,
      modelDefinition: explicitModelDefinition,
    });

    const timingMetadata = buildTimingMetadata({
      startedAt: requestStartAt,
      finishedAt: new Date(),
    });
    const usageMetadata = imageResult.totalUsage ? { totalUsage: imageResult.totalUsage } : {};
    const mergedMetadata: Record<string, unknown> = {
      ...usageMetadata,
      ...timingMetadata,
      ...(Object.keys(imageResult.agentMetadata).length > 0
        ? { agent: imageResult.agentMetadata }
        : {}),
    };

    const revisedPromptPart = imageResult.revisedPrompt
      ? [
          {
            type: "data-revised-prompt" as const,
            data: { text: imageResult.revisedPrompt },
          },
        ]
      : [];
    const messageParts = [...imageResult.persistedImageParts, ...revisedPromptPart];

    const message: TenasUIMessage = {
      id: assistantMessageId,
      role: "assistant",
      parts: messageParts,
      parentMessageId: assistantParentUserId,
      metadata: mergedMetadata,
    };

    await saveMessage({
      sessionId,
      message,
      parentMessageId: assistantParentUserId,
      allowEmpty: false,
      createdAt: requestStartAt,
    });
    await clearSessionErrorMessage({ sessionId });

    return { ok: true, response: { sessionId, message } };
  } catch (err) {
    logger.error({ err, sessionId, chatModelId }, "[chat] image request failed");
    if (err instanceof ChatImageRequestError) {
      const errorText = formatImageErrorMessage(err);
      await setSessionErrorMessage({ sessionId, errorMessage: errorText });
      return createChatImageErrorResult(err.status, errorText);
    }
    const errorText = formatImageErrorMessage(err);
    await setSessionErrorMessage({ sessionId, errorMessage: errorText });
    return createChatImageErrorResult(500, errorText);
  }
}

/** Generate image result for chat image flows. */
async function generateImageModelResult(input: ImageModelRequest): Promise<ImageModelResult> {
  const resolvedPrompt = resolveImagePrompt(input.messages);
  if (!resolvedPrompt) {
    throw new ChatImageRequestError("缺少图片生成提示词。", 400);
  }
  const modelId = input.chatModelId?.trim() ?? "";
  if (!modelId) {
    throw new ChatImageRequestError("未指定图片模型。", 400);
  }

  setAbortSignal(input.abortSignal);
  const resolved = await resolveImageModel({ imageModelId: modelId });
  let prompt = resolvedPrompt.prompt;
  if (resolvedPrompt.hasMask && typeof prompt !== "string") {
    prompt = await normalizePromptForImageEdit({
      prompt,
      images: resolvedPrompt.images,
      mask: resolvedPrompt.mask,
      sessionId: input.sessionId,
      modelProviderId: resolved.modelInfo.provider,
      modelAdapterId: resolved.modelInfo.adapterId,
      abortSignal: input.abortSignal,
    });
  }
  const promptTextLength =
    typeof prompt === "string" ? prompt.length : prompt.text?.length ?? 0;
  const promptImageCount = typeof prompt === "string" ? 0 : prompt.images.length;
  const promptHasMask = typeof prompt === "string" ? false : Boolean(prompt.mask);
  logger.debug(
    {
      sessionId: input.sessionId,
      chatModelId: modelId,
      modelDefinitionId: input.modelDefinition?.id,
      modelProviderId: input.modelDefinition?.providerId,
      modelTags: input.modelDefinition?.tags,
      promptLength: promptTextLength,
      imageCount: promptImageCount,
      hasMask: promptHasMask,
    },
    "[chat] start image stream",
  );
  const imageOptions = resolveImageGenerateOptions(input.messages as UIMessage[]);
  const requestedCount = imageOptions?.n ?? 1;
  const maxImagesPerCall =
    typeof (resolved.model as any).maxImagesPerCall === "number"
      ? Math.max(1, Math.floor((resolved.model as any).maxImagesPerCall))
      : undefined;
  // 中文注释：模型可能限制单次图片数量，超出则向下裁剪。
  const safeCount = maxImagesPerCall
    ? Math.min(Math.max(1, requestedCount), maxImagesPerCall)
    : Math.max(1, requestedCount);
  const { n: _ignoredCount, size: rawSize, aspectRatio: rawAspectRatio, ...restImageOptions } =
    imageOptions ?? {};
  // 中文注释：SDK 需要 size 为 "{number}x{number}" 模板字面量类型，运行时仍用正则兜底。
  const safeSize =
    typeof rawSize === "string" && /^\d+x\d+$/u.test(rawSize)
      ? (rawSize as `${number}x${number}`)
      : undefined;
  // 中文注释：SDK 需要 aspectRatio 为 "{number}:{number}" 模板字面量类型，运行时仍用正则兜底。
  const safeAspectRatio =
    typeof rawAspectRatio === "string" && /^\d+:\d+$/u.test(rawAspectRatio)
      ? (rawAspectRatio as `${number}:${number}`)
      : undefined;
  const result = await generateImage({
    model: resolved.model,
    prompt,
    n: safeCount,
    ...(restImageOptions ?? {}),
    ...(safeSize ? { size: safeSize } : {}),
    ...(safeAspectRatio ? { aspectRatio: safeAspectRatio } : {}),
    abortSignal: input.abortSignal,
  });
  const revisedPrompt = resolveRevisedPrompt(result.providerMetadata);
  const imageParts = result.images.flatMap((image) => {
    const mediaType = image.mediaType || "image/png";
    const base64 = image.base64?.trim();
    if (!base64) return [];
    const url = base64.startsWith("data:")
      ? base64
      : `data:${mediaType};base64,${base64}`;
    return [
      {
        type: "file" as const,
        url,
        mediaType,
      },
    ];
  });
  logger.debug(
    {
      sessionId: input.sessionId,
      chatModelId: modelId,
      revisedPromptLength: revisedPrompt?.length ?? 0,
      imageCount: imageParts.length,
      mediaTypes: imageParts.map((part) => part.mediaType),
      urlPrefixes: imageParts.map((part) => part.url.slice(0, 30)),
    },
    "[chat] image parts prepared",
  );
  if (imageParts.length === 0) {
    throw new Error("图片生成结果为空。");
  }

  const usage = result.usage ?? undefined;
  const totalUsage: TokenUsage | undefined =
    usage && (usage.inputTokens ?? usage.outputTokens ?? usage.totalTokens) != null
      ? {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        }
      : undefined;
  const workspaceId = getWorkspaceId();
  if (!workspaceId) {
    throw new Error("workspaceId 缺失，无法保存图片");
  }
  const projectId = getProjectId();
  // 保存到本地磁盘，落库使用 tenas-file。
  const persistedImageParts = await saveGeneratedImages({
    images: result.images,
    workspaceId,
    sessionId: input.sessionId,
    projectId: projectId || undefined,
  });
  logger.debug(
    {
      sessionId: input.sessionId,
      chatModelId: modelId,
      persistedImageCount: persistedImageParts.length,
      urlPrefixes: persistedImageParts.map((part) => part.url.slice(0, 30)),
    },
    "[chat] image attachments saved",
  );

  const agentMetadata = {
    id: "master-agent",
    name: "MasterAgent",
    kind: "master",
    model: resolved.modelInfo,
    chatModelId: resolved.imageModelId,
    modelDefinition: resolved.modelDefinition ?? input.modelDefinition,
  };

  return {
    imageParts,
    persistedImageParts,
    revisedPrompt,
    agentMetadata,
    totalUsage,
  };
}

/** 生成图片并返回 SSE 响应。 */
async function runImageModelStream(input: {
  sessionId: string;
  assistantMessageId: string;
  parentMessageId: string;
  requestStartAt: Date;
  messages: UIMessage[];
  abortSignal: AbortSignal;
  chatModelId?: string;
  modelDefinition?: ModelDefinition;
}): Promise<Response> {
  try {
    const imageResult = await generateImageModelResult({
      sessionId: input.sessionId,
      messages: input.messages,
      abortSignal: input.abortSignal,
      chatModelId: input.chatModelId,
      modelDefinition: input.modelDefinition,
    });
    return await createImageStreamResponse({
      sessionId: input.sessionId,
      assistantMessageId: input.assistantMessageId,
      parentMessageId: input.parentMessageId,
      requestStartAt: input.requestStartAt,
      imageParts: imageResult.imageParts,
      persistedImageParts: imageResult.persistedImageParts,
      revisedPrompt: imageResult.revisedPrompt,
      agentMetadata: imageResult.agentMetadata,
      totalUsage: imageResult.totalUsage,
    });
  } catch (err) {
    const modelId = input.chatModelId?.trim() ?? "";
    logger.error({ err, sessionId: input.sessionId, chatModelId: modelId }, "[chat] image stream failed");
    const errorText = formatImageErrorMessage(err);
    return createErrorStreamResponse({
      sessionId: input.sessionId,
      assistantMessageId: input.assistantMessageId,
      parentMessageId: input.parentMessageId,
      errorText,
    });
  }
}

/** 解析图片生成的 revised prompt。 */
function resolveRevisedPrompt(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const providers = Object.values(metadata as Record<string, any>);
  for (const provider of providers) {
    const images = provider?.images;
    if (!Array.isArray(images)) continue;
    for (const image of images) {
      if (!image || typeof image !== "object") continue;
      const revisedPrompt =
        typeof image.revisedPrompt === "string"
          ? image.revisedPrompt
          : typeof image.revised_prompt === "string"
            ? image.revised_prompt
            : "";
      const trimmed = revisedPrompt.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}
