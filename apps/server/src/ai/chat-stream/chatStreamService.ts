import { Buffer } from "node:buffer";
import path from "node:path";
import sharp from "sharp";
import { generateId, generateImage, type DataContent, type GeneratedFile, type UIMessage } from "ai";
import type { ModelDefinition, ModelTag } from "@teatime-ai/api/common";
import type { ImageGenerateOptions } from "@teatime-ai/api/types/image";
import type { TeatimeUIMessage, TokenUsage } from "@teatime-ai/api/types/message";
import { createMasterAgentRunner } from "@/ai";
import { resolveChatModel } from "@/ai/resolveChatModel";
import { resolveImageModel } from "@/ai/resolveImageModel";
import { downloadImageData } from "@/ai/utils/image-download";
import {
  setAssistantMessageId,
  setChatModel,
  setAbortSignal,
  setRequestContext,
  getWorkspaceId,
  getProjectId,
} from "@/ai/chat-stream/requestContext";
import { logger } from "@/common/logger";
import { getProviderSettings } from "@/modules/settings/settingsService";
import { readBasicConf, readS3Providers } from "@/modules/settings/teatimeConfStore";
import { createS3StorageService, resolveS3ProviderConfig } from "@/modules/storage/s3StorageService";
import { getModelDefinition } from "@/ai/models/modelRegistry";
import type { ChatStreamRequest } from "./chatStreamTypes";
import { loadMessageChain } from "./messageChainLoader";
import { buildFilePartFromTeatimeUrl, loadTeatimeImageBuffer, saveChatImageAttachment } from "./attachmentResolver";
import { resolveRightmostLeafId, saveMessage } from "./messageStore";
import type { ChatImageRequest, ChatImageRequestResult } from "./chatImageTypes";
import { buildTimingMetadata } from "./metadataBuilder";
import {
  createChatStreamResponse,
  createErrorStreamResponse,
  createImageStreamResponse,
} from "./streamOrchestrator";

/** Max messages to load for a chain. */
const MAX_CHAIN_MESSAGES = 80;

/** Format invalid request errors for client display. */
function formatInvalidRequestMessage(message: string): string {
  const trimmed = message.trim() || "Invalid request.";
  if (trimmed.startsWith("请求无效：")) return trimmed;
  return `请求无效：${trimmed}`;
}

/** Format image errors for client display. */
function formatImageErrorMessage(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "图片生成失败。";
  const trimmed = message.trim() || "图片生成失败。";
  if (trimmed.startsWith("请求失败：")) return trimmed;
  return `请求失败：${trimmed}`;
}

/** Build an error result for image requests. */
function createChatImageErrorResult(status: number, error: string): ChatImageRequestResult {
  return { ok: false, status, error };
}

type GenerateImagePromptObject = {
  images: Array<DataContent>;
  text?: string;
  mask?: DataContent;
};

type GenerateImagePrompt = string | GenerateImagePromptObject;

type PromptImageInput = {
  /** Raw image data or url. */
  data: DataContent;
  /** Optional media type hint. */
  mediaType?: string;
};

type ResolvedImageInput = {
  /** Image buffer for upload. */
  buffer: Buffer;
  /** Media type of the image. */
  mediaType: string;
  /** Base name derived from url or fallback. */
  baseName: string;
};

type ResolvedImagePrompt = {
  /** Prompt payload for AI SDK. */
  prompt: GenerateImagePrompt;
  /** Whether the prompt includes a mask. */
  hasMask: boolean;
  /** Image inputs for upload conversion. */
  images: PromptImageInput[];
  /** Mask input for upload conversion. */
  mask?: PromptImageInput;
};

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

type MaskFormat = "alpha" | "grey";

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

  setRequestContext({
    sessionId,
    cookies: input.cookies,
    clientId: clientId || undefined,
    tabId: tabId || undefined,
    workspaceId: workspaceId || undefined,
    projectId: projectId || undefined,
  });

  const abortController = new AbortController();
  input.requestSignal.addEventListener("abort", () => {
    abortController.abort();
  });

  const requestStartAt = new Date();
  const assistantMessageId = typeof messageId === "string" && messageId ? messageId : generateId();
  setAssistantMessageId(assistantMessageId);

  const lastMessage = incomingMessages.at(-1) as TeatimeUIMessage | undefined;
  if (!lastMessage || !lastMessage.role || !lastMessage.id) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: "请求无效：缺少最后一条消息。",
    });
  }

  // 流程：保存最后一条消息 -> 补全历史链路 -> 解析模型 -> 启动 SSE stream 并落库 assistant。
  let leafMessageId = String(lastMessage.id);
  let assistantParentUserId: string | null = null;

  try {
    if (lastMessage.role === "user") {
      const explicitParent =
        typeof lastMessage.parentMessageId === "string" || lastMessage.parentMessageId === null
          ? (lastMessage.parentMessageId as string | null)
          : undefined;
      const parentMessageIdToUse =
        explicitParent === undefined ? await resolveRightmostLeafId(sessionId) : explicitParent;

      const saved = await saveMessage({
        sessionId,
        message: lastMessage as any,
        parentMessageId: parentMessageIdToUse ?? null,
        createdAt: requestStartAt,
      });
      leafMessageId = saved.id;
      assistantParentUserId = saved.id;
    } else if (lastMessage.role === "assistant") {
      const parentId = typeof lastMessage.parentMessageId === "string" ? lastMessage.parentMessageId : null;
      if (!parentId) {
        return createErrorStreamResponse({
          sessionId,
          assistantMessageId,
          parentMessageId: await resolveRightmostLeafId(sessionId),
          errorText: "请求无效：assistant 缺少 parentMessageId。",
        });
      }
      assistantParentUserId = parentId;

      await saveMessage({
        sessionId,
        message: lastMessage as any,
        parentMessageId: parentId,
        allowEmpty: true,
        createdAt: requestStartAt,
      });
      leafMessageId = String(lastMessage.id);
    } else {
      return createErrorStreamResponse({
        sessionId,
        assistantMessageId,
        parentMessageId: await resolveRightmostLeafId(sessionId),
        errorText: "请求无效：不支持的消息角色。",
      });
    }
  } catch (err) {
    logger.error({ err }, "[chat] save last message failed");
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: "请求失败：保存消息出错。",
    });
  }

  const messages = await loadMessageChain({
    sessionId,
    leafMessageId,
    maxMessages: MAX_CHAIN_MESSAGES,
  });
  logger.debug(
    {
      sessionId,
      leafMessageId,
      messageCount: Array.isArray(messages) ? messages.length : null,
    },
    "[chat] load message chain",
  );

  const modelMessages = await replaceTeatimeFileParts(messages as UIMessage[]);
  if (messages.length === 0) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: assistantParentUserId ?? (await resolveRightmostLeafId(sessionId)),
      errorText: "请求失败：历史消息不存在。",
    });
  }
  if (!assistantParentUserId) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: "请求失败：找不到父消息。",
    });
  }

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
        parentMessageId: assistantParentUserId,
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
      parentMessageId: assistantParentUserId,
      errorText,
    });
  }

  return createChatStreamResponse({
    sessionId,
    assistantMessageId,
    parentMessageId: assistantParentUserId,
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

  setRequestContext({
    sessionId,
    cookies: input.cookies,
    clientId: clientId || undefined,
    tabId: tabId || undefined,
    workspaceId: workspaceId || undefined,
    projectId: projectId || undefined,
    boardId: typeof boardId === "string" && boardId.trim() ? boardId.trim() : undefined,
  });

  const abortController = new AbortController();
  input.requestSignal.addEventListener("abort", () => {
    abortController.abort();
  });

  const requestStartAt = new Date();
  const assistantMessageId = typeof messageId === "string" && messageId ? messageId : generateId();
  setAssistantMessageId(assistantMessageId);

  const lastMessage = incomingMessages.at(-1) as TeatimeUIMessage | undefined;
  if (!lastMessage || !lastMessage.role || !lastMessage.id) {
    return createChatImageErrorResult(400, formatInvalidRequestMessage("缺少最后一条消息。"));
  }

  // 流程：
  // 1) 保存最后一条消息并确定父消息
  // 2) 加载消息链并替换图片输入
  // 3) 解析图片模型并生成图片
  // 4) 保存图片与 assistant 消息，返回完整 message
  let leafMessageId = String(lastMessage.id);
  let assistantParentUserId: string | null = null;

  try {
    if (lastMessage.role === "user") {
      const explicitParent =
        typeof lastMessage.parentMessageId === "string" || lastMessage.parentMessageId === null
          ? (lastMessage.parentMessageId as string | null)
          : undefined;
      const parentMessageIdToUse =
        explicitParent === undefined ? await resolveRightmostLeafId(sessionId) : explicitParent;

      const saved = await saveMessage({
        sessionId,
        message: lastMessage as any,
        parentMessageId: parentMessageIdToUse ?? null,
        createdAt: requestStartAt,
      });
      leafMessageId = saved.id;
      assistantParentUserId = saved.id;
    } else if (lastMessage.role === "assistant") {
      const parentId = typeof lastMessage.parentMessageId === "string" ? lastMessage.parentMessageId : null;
      if (!parentId) {
        return createChatImageErrorResult(400, formatInvalidRequestMessage("assistant 缺少 parentMessageId。"));
      }
      assistantParentUserId = parentId;

      await saveMessage({
        sessionId,
        message: lastMessage as any,
        parentMessageId: parentId,
        allowEmpty: true,
        createdAt: requestStartAt,
      });
      leafMessageId = String(lastMessage.id);
    } else {
      return createChatImageErrorResult(400, formatInvalidRequestMessage("不支持的消息角色。"));
    }
  } catch (err) {
    logger.error({ err }, "[chat] save last message failed");
    return createChatImageErrorResult(500, formatImageErrorMessage("保存消息出错。"));
  }

  const messages = await loadMessageChain({
    sessionId,
    leafMessageId,
    maxMessages: MAX_CHAIN_MESSAGES,
  });
  logger.debug(
    {
      sessionId,
      leafMessageId,
      messageCount: Array.isArray(messages) ? messages.length : null,
    },
    "[chat] load message chain",
  );

  const modelMessages = await replaceTeatimeFileParts(messages as UIMessage[]);
  if (messages.length === 0) {
    return createChatImageErrorResult(400, formatImageErrorMessage("历史消息不存在。"));
  }
  if (!assistantParentUserId) {
    return createChatImageErrorResult(400, formatImageErrorMessage("找不到父消息。"));
  }

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

    const message: TeatimeUIMessage = {
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

    return { ok: true, response: { sessionId, message } };
  } catch (err) {
    logger.error({ err, sessionId, chatModelId }, "[chat] image request failed");
    if (err instanceof ChatImageRequestError) {
      return createChatImageErrorResult(err.status, formatImageErrorMessage(err));
    }
    return createChatImageErrorResult(500, formatImageErrorMessage(err));
  }
}

/** Replace teatime-file parts with data urls. */
async function replaceTeatimeFileParts(messages: UIMessage[]): Promise<UIMessage[]> {
  const next: UIMessage[] = [];
  for (const message of messages) {
    const parts = Array.isArray((message as any).parts) ? (message as any).parts : [];
    const replaced: any[] = [];
    for (const part of parts) {
      if (!part || typeof part !== "object") {
        replaced.push(part);
        continue;
      }
      if ((part as any).type !== "file") {
        replaced.push(part);
        continue;
      }
      const url = typeof (part as any).url === "string" ? (part as any).url : "";
      if (!url || !url.startsWith("teatime-file://")) {
        replaced.push(part);
        continue;
      }
      const mediaType =
        typeof (part as any).mediaType === "string" ? (part as any).mediaType : undefined;
      try {
        const filePart = await buildFilePartFromTeatimeUrl({ url, mediaType });
        if (filePart) replaced.push(filePart);
      } catch {
        // 读取或压缩失败时直接跳过该图片，避免阻断对话。
      }
    }
    next.push({ ...message, parts: replaced } as UIMessage);
  }
  return next;
}

/** Resolve explicit model definition from chatModelId. */
async function resolveExplicitModelDefinition(
  chatModelId?: string | null,
): Promise<ModelDefinition | null> {
  const normalized = typeof chatModelId === "string" ? chatModelId.trim() : "";
  if (!normalized) {
    logger.debug({ chatModelId }, "[chat] explicit model skipped");
    return null;
  }
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
    logger.debug({ chatModelId: normalized }, "[chat] explicit model id invalid");
    return null;
  }
  const profileId = normalized.slice(0, separatorIndex).trim();
  const modelId = normalized.slice(separatorIndex + 1).trim();
  if (!profileId || !modelId) {
    logger.debug({ chatModelId: normalized }, "[chat] explicit model id empty");
    return null;
  }

  const providers = await getProviderSettings();
  const providerEntry = providers.find((entry) => entry.id === profileId);
  if (!providerEntry) {
    const registryModel = getModelDefinition(profileId, modelId) ?? null;
    logger.debug(
      {
        profileId,
        modelId,
        registryProviderId: registryModel?.providerId,
        registryTags: registryModel?.tags,
      },
      "[chat] explicit model from registry",
    );
    return registryModel;
  }
  const fromConfig = providerEntry.models[modelId];
  logger.debug(
    {
      profileId,
      modelId,
      providerId: providerEntry.providerId,
      hasConfigModel: Boolean(fromConfig),
    },
    "[chat] explicit model from provider config",
  );
  if (!fromConfig) {
    const registryModel = getModelDefinition(providerEntry.providerId, modelId) ?? null;
    logger.debug(
      {
        profileId,
        modelId,
        registryProviderId: registryModel?.providerId,
        registryTags: registryModel?.tags,
      },
      "[chat] explicit model fallback to registry",
    );
    return registryModel;
  }
  if (Array.isArray(fromConfig.tags) && fromConfig.tags.length > 0) {
    logger.debug(
      {
        profileId,
        modelId,
        providerId: providerEntry.providerId,
        tags: fromConfig.tags,
      },
      "[chat] explicit model use config tags",
    );
    return fromConfig;
  }
  const registryModel = getModelDefinition(providerEntry.providerId, modelId) ?? fromConfig;
  logger.debug(
    {
      profileId,
      modelId,
      providerId: providerEntry.providerId,
      registryProviderId: registryModel?.providerId,
      registryTags: registryModel?.tags,
    },
    "[chat] explicit model merge registry",
  );
  return registryModel;
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
  // 保存到本地磁盘，落库使用 teatime-file。
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

/** Check if value is a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** Normalize image count into a safe integer range. */
function normalizeImageCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.floor(value);
  if (rounded < 1 || rounded > 4) return undefined;
  return rounded;
}

/** Normalize size string into a safe format. */
function normalizeSize(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+x\d+$/u.test(trimmed)) return undefined;
  return trimmed;
}

/** Normalize aspect ratio string into a safe format. */
function normalizeAspectRatio(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+:\d+$/u.test(trimmed)) return undefined;
  return trimmed;
}

/** Normalize OpenAI image provider options. */
function normalizeOpenAiOptions(value: unknown): { quality?: string; style?: string } | undefined {
  if (!isRecord(value)) return undefined;
  const quality = typeof value.quality === "string" ? value.quality.trim() : "";
  const style = typeof value.style === "string" ? value.style.trim() : "";
  if (!quality && !style) return undefined;
  return {
    ...(quality ? { quality } : {}),
    ...(style ? { style } : {}),
  };
}

/** Resolve image generation options from message metadata. */
function resolveImageGenerateOptions(messages: UIMessage[]): ImageGenerateOptions | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as any;
    if (!message || message.role !== "user") continue;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const text = parts
      .filter((part: any) => part?.type === "text" && typeof part.text === "string")
      .map((part: any) => part.text)
      .join("")
      .trim();
    if (!text) continue;
    // 仅使用与 prompt 对应的 user 消息配置，避免旧消息覆盖。
    const metadata = message.metadata;
    if (!isRecord(metadata)) return undefined;
    const rawOptions = metadata.imageOptions;
    if (!isRecord(rawOptions)) return undefined;

    // 仅信任白名单字段，避免 metadata 注入未支持参数。
    const count = normalizeImageCount(rawOptions.n);
    const size = normalizeSize(rawOptions.size);
    const aspectRatio = size ? undefined : normalizeAspectRatio(rawOptions.aspectRatio);
    const seed =
      typeof rawOptions.seed === "number" && Number.isFinite(rawOptions.seed)
        ? rawOptions.seed
        : undefined;
    const providerOptionsRaw = isRecord(rawOptions.providerOptions)
      ? rawOptions.providerOptions
      : undefined;
    const openaiOptions = normalizeOpenAiOptions(providerOptionsRaw?.openai);
    const providerOptions = openaiOptions ? { openai: openaiOptions } : undefined;

    if (count === undefined && !size && !aspectRatio && seed === undefined && !providerOptions) {
      return undefined;
    }

    return {
      ...(count !== undefined ? { n: count } : {}),
      ...(size ? { size } : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(seed !== undefined ? { seed } : {}),
      ...(providerOptions ? { providerOptions } : {}),
    };
  }
  return undefined;
}

/** Resolve active S3 storage service. */
function resolveActiveS3Storage() {
  const basic = readBasicConf();
  const activeId = basic.activeS3Id;
  if (!activeId) return null;
  const provider = readS3Providers().find((entry) => entry.id === activeId);
  if (!provider) return null;
  return createS3StorageService(resolveS3ProviderConfig(provider));
}

/** Normalize filename for S3 object keys. */
function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Strip extension from a file name. */
function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[a-zA-Z0-9]+$/, "");
}

/** Resolve media type from data url. */
function resolveMediaTypeFromDataUrl(value: string): string {
  const match = value.match(/^data:([^;]+);/);
  return match?.[1]?.toLowerCase() ?? "";
}

/** Resolve base name from url path. */
function resolveBaseNameFromUrl(value: string, fallback: string): string {
  if (value.startsWith("data:")) return fallback;
  try {
    const parsed = new URL(value);
    const fileName = decodeURIComponent(parsed.pathname);
    const baseName = stripFileExtension(path.basename(fileName));
    const sanitized = sanitizeFileName(baseName);
    return sanitized || fallback;
  } catch {
    return fallback;
  }
}

/** Resolve extension from media type. */
function resolveImageExtension(mediaType: string): string {
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  return "png";
}

/** Resolve image input into buffer + meta. */
async function resolveImageInputBuffer(input: {
  data: DataContent;
  mediaType?: string;
  fallbackName: string;
  abortSignal: AbortSignal;
}): Promise<ResolvedImageInput> {
  const mediaTypeHint = input.mediaType?.trim() || "";
  const fallbackName = sanitizeFileName(input.fallbackName);
  if (typeof input.data === "string") {
    const raw = input.data.trim();
    const dataUrlType = raw.startsWith("data:") ? resolveMediaTypeFromDataUrl(raw) : "";
    const resolvedType = dataUrlType || mediaTypeHint || "image/png";
    if (raw.startsWith("teatime-file://")) {
      const payload = await loadTeatimeImageBuffer({ url: raw, mediaType: resolvedType });
      if (!payload) {
        throw new Error("图片读取失败");
      }
      return {
        buffer: payload.buffer,
        mediaType: payload.mediaType,
        baseName: resolveBaseNameFromUrl(raw, fallbackName),
      };
    }
    const bytes = await downloadImageData(raw, input.abortSignal);
    return {
      buffer: Buffer.from(bytes),
      mediaType: resolvedType,
      baseName: resolveBaseNameFromUrl(raw, fallbackName),
    };
  }
  if (Buffer.isBuffer(input.data)) {
    return {
      buffer: input.data,
      mediaType: mediaTypeHint || "image/png",
      baseName: fallbackName,
    };
  }
  if (input.data instanceof Uint8Array) {
    return {
      buffer: Buffer.from(input.data),
      mediaType: mediaTypeHint || "image/png",
      baseName: fallbackName,
    };
  }
  if (input.data instanceof ArrayBuffer) {
    return {
      buffer: Buffer.from(input.data),
      mediaType: mediaTypeHint || "image/png",
      baseName: fallbackName,
    };
  }
  throw new Error("图片输入格式不支持");
}

/** Resolve target image size. */
async function resolveImageSize(primary: Buffer, fallback?: Buffer) {
  const meta = await sharp(primary).metadata();
  if (meta.width && meta.height) {
    return { width: meta.width, height: meta.height };
  }
  if (fallback) {
    const fallbackMeta = await sharp(fallback).metadata();
    if (fallbackMeta.width && fallbackMeta.height) {
      return { width: fallbackMeta.width, height: fallbackMeta.height };
    }
  }
  throw new Error("无法解析图片尺寸");
}

/** Build binary mask map from a transparent stroke image. */
async function buildMaskMap(buffer: Buffer, width: number, height: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const useAlpha = Boolean(meta.hasAlpha);
  const { data, info } = await sharp(buffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const mask = Buffer.alloc(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4;
    const alpha = data[offset + 3];
    const luminance = data[offset] + data[offset + 1] + data[offset + 2];
    // 透明背景 + 笔刷颜色，透明处为 0，笔刷处为 255。
    const isMarked = useAlpha ? alpha > 0 : luminance > 0;
    mask[i] = isMarked ? 255 : 0;
  }
  return mask;
}

/** Build grayscale mask png. */
async function buildGreyMask(mask: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(mask, {
    raw: { width, height, channels: 1 },
  })
    .png()
    .toBuffer();
}

/** Build alpha image from base + mask (transparent = editable). */
async function buildAlphaMaskFromBase(
  base: Buffer,
  mask: Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  const { data, info } = await sharp(base)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const rgba = Buffer.alloc(pixelCount * 4);
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4;
    // 逻辑：保留原图颜色，笔刷区域透明，其余区域不透明。
    rgba[offset] = data[offset];
    rgba[offset + 1] = data[offset + 1];
    rgba[offset + 2] = data[offset + 2];
    rgba[offset + 3] = mask[i] > 0 ? 0 : 255;
  }
  return sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

/** Resolve mask format based on provider id or adapter id. */
function resolveMaskFormatByModel(providerId: string, adapterId?: string): MaskFormat {
  if (providerId === "volcengine" || adapterId === "volcengine") return "grey";
  return "alpha";
}

/** Normalize prompt into S3 urls for image editing. */
async function normalizePromptForImageEdit(input: {
  prompt: GenerateImagePromptObject;
  images: PromptImageInput[];
  mask?: PromptImageInput;
  sessionId: string;
  modelProviderId: string;
  modelAdapterId: string;
  abortSignal: AbortSignal;
}): Promise<GenerateImagePrompt> {
  // 图像编辑统一转为 S3 URL，避免混用输入格式。
  const storage = resolveActiveS3Storage();
  if (!storage) {
    throw new Error("需要配置 S3 存储服务");
  }
  if (input.images.length === 0) {
    throw new Error("图片编辑缺少原图");
  }
  if (!input.mask) {
    throw new Error("图片编辑缺少遮罩");
  }

  const resolvedImages = await Promise.all(
    input.images.map((image, index) =>
      resolveImageInputBuffer({
        data: image.data,
        mediaType: image.mediaType,
        fallbackName: `image-${index + 1}`,
        abortSignal: input.abortSignal,
      }),
    ),
  );
  const baseImage = resolvedImages[0];
  const resolvedMask = await resolveImageInputBuffer({
    data: input.mask.data,
    mediaType: input.mask.mediaType,
    fallbackName: `${baseImage.baseName || "image"}_mask`,
    abortSignal: input.abortSignal,
  });
  const { width, height } = await resolveImageSize(baseImage.buffer, resolvedMask.buffer);
  const maskFormat = resolveMaskFormatByModel(input.modelProviderId, input.modelAdapterId);
  const maskMap = await buildMaskMap(resolvedMask.buffer, width, height);
  // 按模型要求输出 alpha/grey 遮罩文件。
  const maskBuffer =
    maskFormat === "alpha"
      ? await buildAlphaMaskFromBase(baseImage.buffer, maskMap, width, height)
      : await buildGreyMask(maskMap, width, height);

  const imageUrls: string[] = [];
  for (const image of resolvedImages) {
    const baseName = sanitizeFileName(image.baseName || "image");
    const ext = resolveImageExtension(image.mediaType);
    const fileName = `${baseName}.${ext}`;
    const key = `ai-temp/chat/${input.sessionId}/${fileName}`;
    const result = await storage.putObject({
      key,
      body: image.buffer,
      contentType: image.mediaType,
      contentLength: image.buffer.byteLength,
    });
    imageUrls.push(result.url);
  }

  const baseName = sanitizeFileName(baseImage.baseName || "image");
  const maskFileName = `${baseName}_${maskFormat}.png`;
  const maskKey = `ai-temp/chat/${input.sessionId}/${maskFileName}`;
  const maskResult = await storage.putObject({
    key: maskKey,
    body: maskBuffer,
    contentType: "image/png",
    contentLength: maskBuffer.byteLength,
  });

  return {
    images: imageUrls,
    ...(typeof input.prompt.text === "string" && input.prompt.text.trim()
      ? { text: input.prompt.text }
      : {}),
    mask: maskResult.url,
  };
}

/** 解析图片生成提示词。 */
function resolveImagePrompt(messages: UIMessage[]): ResolvedImagePrompt | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as any;
    if (!message || message.role !== "user") continue;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const images: PromptImageInput[] = [];
    let mask: PromptImageInput | undefined;
    let text = "";
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "text" && typeof part.text === "string") {
        text += part.text;
        continue;
      }
      if (part.type === "file" && typeof part.url === "string" && part.url.trim()) {
        const payload = { data: part.url, mediaType: part.mediaType as string | undefined };
        if (part.purpose === "mask") {
          if (!mask) mask = payload;
        } else {
          images.push(payload);
        }
      }
    }

    const trimmedText = text.trim();
    if (images.length > 0 || mask) {
      return {
        prompt: {
          images: images.map((item) => item.data),
          ...(trimmedText ? { text: trimmedText } : {}),
          ...(mask ? { mask: mask.data } : {}),
        },
        hasMask: Boolean(mask),
        images,
        mask,
      };
    }

    if (trimmedText) {
      return {
        prompt: trimmedText,
        hasMask: false,
        images: [],
      };
    }
  }
  return null;
}

/** 保存生成图片到磁盘并返回落库 parts。 */
async function saveGeneratedImages(input: {
  images: GeneratedFile[];
  workspaceId: string;
  sessionId: string;
  projectId?: string;
}): Promise<Array<{ type: "file"; url: string; mediaType: string }>> {
  const parts: Array<{ type: "file"; url: string; mediaType: string }> = [];
  for (const [index, image] of input.images.entries()) {
    const mediaType = image.mediaType || "image/png";
    const buffer = Buffer.from(image.uint8Array);
    const fileName = buildImageFileName(index, mediaType);
    const saved = await saveChatImageAttachment({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      fileName,
      mediaType,
      buffer,
    });
    parts.push({ type: "file", url: saved.url, mediaType: saved.mediaType });
  }
  return parts;
}

/** 构建图片文件名。 */
function buildImageFileName(index: number, mediaType: string): string {
  const ext =
    mediaType === "image/jpeg" ? "jpg" : mediaType === "image/webp" ? "webp" : "png";
  return `image-${index + 1}.${ext}`;
}

/** Resolve required input tags from message parts. */
function resolveRequiredInputTags(messages: UIMessage[]): ModelTag[] {
  const required = new Set<ModelTag>();
  for (const message of messages) {
    const parts = Array.isArray((message as any).parts) ? (message as any).parts : [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      if ((part as any).type !== "file") continue;
      const url = typeof (part as any).url === "string" ? (part as any).url : "";
      if (!url) continue;
      const purpose = typeof (part as any).purpose === "string" ? (part as any).purpose : "";
      if (purpose === "mask") {
        required.add("image_edit");
        continue;
      }
      // 中文注释：存在图片输入时统一走图片编辑能力。
      required.add("image_edit");
    }
  }
  return Array.from(required);
}

/** Resolve last used chat model id from assistant metadata. */
function resolvePreviousChatModelId(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as any;
    if (!message || message.role !== "assistant") continue;
    const metadata = message.metadata;
    if (!metadata || typeof metadata !== "object") continue;
    const agent = (metadata as any).agent;
    const chatModelId = typeof agent?.chatModelId === "string" ? agent.chatModelId : "";
    if (chatModelId) return chatModelId;
  }
  return null;
}
