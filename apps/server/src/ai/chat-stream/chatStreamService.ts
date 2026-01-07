import { Buffer } from "node:buffer";
import { generateId, generateImage, type GeneratedFile, type UIMessage } from "ai";
import type { ModelDefinition, ModelTag } from "@teatime-ai/api/common";
import type { ImageGenerateOptions } from "@teatime-ai/api/types/image";
import type { TeatimeUIMessage } from "@teatime-ai/api/types/message";
import { createMasterAgentRunner } from "@/ai";
import { resolveChatModel } from "@/ai/resolveChatModel";
import { resolveImageModel } from "@/ai/resolveImageModel";
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
import { getModelDefinition } from "@/ai/models/modelRegistry";
import type { ChatStreamRequest } from "./chatStreamTypes";
import { loadMessageChain } from "./messageChainLoader";
import { buildFilePartFromTeatimeUrl, saveChatImageAttachment } from "./attachmentResolver";
import { resolveRightmostLeafId, saveMessage } from "./messageStore";
import {
  createChatStreamResponse,
  createErrorStreamResponse,
  createImageStreamResponse,
} from "./streamOrchestrator";

/** Max messages to load for a chain. */
const MAX_CHAIN_MESSAGES = 80;

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
    if (explicitModelDefinition?.tags?.includes("image_output")) {
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
        messages: messages as UIMessage[],
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
  const prompt = resolveImagePrompt(input.messages);
  if (!prompt) {
    return createErrorStreamResponse({
      sessionId: input.sessionId,
      assistantMessageId: input.assistantMessageId,
      parentMessageId: input.parentMessageId,
      errorText: "请求失败：缺少图片生成提示词。",
    });
  }
  const modelId = input.chatModelId?.trim() ?? "";
  if (!modelId) {
    return createErrorStreamResponse({
      sessionId: input.sessionId,
      assistantMessageId: input.assistantMessageId,
      parentMessageId: input.parentMessageId,
      errorText: "请求失败：未指定图片模型。",
    });
  }

  try {
    logger.debug(
      {
        sessionId: input.sessionId,
        chatModelId: modelId,
        modelDefinitionId: input.modelDefinition?.id,
        modelProviderId: input.modelDefinition?.providerId,
        modelTags: input.modelDefinition?.tags,
        promptLength: prompt.length,
      },
      "[chat] start image stream",
    );
    setAbortSignal(input.abortSignal);
    const resolved = await resolveImageModel({ imageModelId: modelId });
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
    const { n: _ignoredCount, ...restImageOptions } = imageOptions ?? {};
    const result = await generateImage({
      model: resolved.model,
      prompt,
      n: safeCount,
      ...(restImageOptions ?? {}),
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
      return createErrorStreamResponse({
        sessionId: input.sessionId,
        assistantMessageId: input.assistantMessageId,
        parentMessageId: input.parentMessageId,
        errorText: "请求失败：图片生成结果为空。",
      });
    }

    const usage = result.usage ?? undefined;
    const totalUsage =
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

    return await createImageStreamResponse({
      sessionId: input.sessionId,
      assistantMessageId: input.assistantMessageId,
      parentMessageId: input.parentMessageId,
      requestStartAt: input.requestStartAt,
      imageParts,
      persistedImageParts,
      revisedPrompt,
      agentMetadata,
      totalUsage,
    });
  } catch (err) {
    logger.error({ err, sessionId: input.sessionId, chatModelId: modelId }, "[chat] image stream failed");
    const errorText = err instanceof Error ? `请求失败：${err.message}` : "请求失败：图片生成失败。";
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

/** 解析图片生成提示词。 */
function resolveImagePrompt(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as any;
    if (!message || message.role !== "user") continue;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const text = parts
      .filter((part: any) => part?.type === "text" && typeof part.text === "string")
      .map((part: any) => part.text)
      .join("")
      .trim();
    if (text) return text;
  }
  return "";
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
      // 按协议区分本地图片与图片链接能力。
      if (/^https?:\/\//i.test(url)) {
        required.add("image_url_input");
      } else if (url.startsWith("teatime-file://")) {
        required.add("image_input");
      }
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
