import { type UIMessage } from "ai";
import { type ChatModelSource, type ModelDefinition } from "@tenas-ai/api/common";
import type { ImageGenerateOptions, TenasImageMetadataV1 } from "@tenas-ai/api/types/image";
import type { AiImageRequest } from "@tenas-saas/sdk";
import type { TenasUIMessage, TokenUsage } from "@tenas-ai/api/types/message";
import { createMasterAgentRunner } from "@/ai";
import { resolveChatModel } from "@/ai/models/resolveChatModel";
import {
  setChatModel,
  setAbortSignal,
  setCodexOptions,
  setParentProjectRootPaths,
  setAssistantParentMessageId,
  getWorkspaceId,
  getProjectId,
} from "@/ai/shared/context/requestContext";
import { logger } from "@/common/logger";
import { downloadImageData, resolveParentProjectRootPaths } from "@/ai/shared/util";
import { parseCommandAtStart } from "@/ai/tools/CommandParser";
import { buildSessionPrefaceText } from "@/ai/shared/prefaceBuilder";
import { resolveImagePrompt, type GenerateImagePrompt } from "@/ai/services/image/imagePrompt";
import { saveChatImageAttachment } from "@/ai/services/image/attachmentResolver";
import {
  resolveBaseNameFromUrl,
  resolveImageExtension,
  resolveImageInputBuffer,
  resolveImageSaveDirectory,
  resolveMediaTypeFromDataUrl,
  saveImageUrlsToDirectory,
} from "@/ai/services/image/imageStorage";
import { getSaasClient } from "@/modules/saas";
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
import type { ChatStreamRequest } from "@/ai/services/chat/types";
import {
  clearSessionErrorMessage,
  ensureSessionPreface,
  resolveRightmostLeafId,
  saveMessage,
  setSessionErrorMessage,
} from "@/ai/services/chat/repositories/messageStore";
import type { ChatImageRequest, ChatImageRequestResult } from "@/ai/services/image/types";
import { buildTimingMetadata } from "./metadataBuilder";
import {
  createChatStreamResponse,
  createErrorStreamResponse,
  createImageStreamResponse,
} from "./streamOrchestrator";

/** Max wait time for SaaS image tasks (ms). */
const SAAS_IMAGE_TASK_TIMEOUT_MS = 5 * 60 * 1000;
/** Poll interval for SaaS image tasks (ms). */
const SAAS_IMAGE_TASK_POLL_MS = 1500;

type ImageModelRequest = {
  /** Session id. */
  sessionId: string;
  /** Incoming UI messages. */
  messages: UIMessage[];
  /** Raw UI messages for metadata. */
  metadataMessages?: UIMessage[];
  /** Abort signal for image generation. */
  abortSignal: AbortSignal;
  /** Image model id. */
  chatModelId?: string;
  /** Image model source. */
  chatModelSource?: ChatModelSource;
  /** Optional model definition. */
  modelDefinition?: ModelDefinition | null;
  /** Optional request message id. */
  requestMessageId?: string;
  /** Optional response message id. */
  responseMessageId?: string;
  /** Optional trigger source. */
  trigger?: string;
  /** Optional board id. */
  boardId?: string | null;
  /** Optional image save directory uri. */
  imageSaveDir?: string;
  /** SaaS access token for media generation. */
  saasAccessToken?: string;
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

/** Normalize selected skills input. */
function normalizeSelectedSkills(input?: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const candidates = input.filter((value): value is string => typeof value === "string");
  // 逻辑：只保留非空字符串，并按输入顺序去重。
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of candidates) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

/** Extract plain text from UI message parts. */
function extractTextFromParts(parts: unknown[]): string {
  const items = Array.isArray(parts) ? (parts as any[]) : [];
  return items
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n")
    .trim();
}

/** Check whether the message is a compact command request. */
function isCompactCommandMessage(message: TenasUIMessage | undefined): boolean {
  if (!message || message.role !== "user") return false;
  if ((message as any)?.messageKind === "compact_prompt") return true;
  const text = extractTextFromParts(message.parts ?? []);
  const command = parseCommandAtStart(text);
  return command?.id === "summary-history";
}

/** Build the compact prompt text sent to the model. */
function buildCompactPromptText(): string {
  return [
    "# 任务",
    "请对当前对话进行压缩摘要，供后续继续对话使用。",
    "要求：",
    "- 保留明确需求、约束、决策、关键事实。",
    "- 保留重要数据、参数、文件路径、命令、接口信息。",
    "- 标注未完成事项与风险。",
    "- 用精简要点，不要展开推理过程。",
    "输出格式：",
    "## 摘要",
    "## 关键决策",
    "## 待办",
    "## 风险/疑点",
    "## 涉及文件",
  ].join("\n");
}

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
  /** SaaS access token from request header. */
  saasAccessToken?: string;
}): Promise<Response> {
  const {
    sessionId,
    messages: incomingMessages,
    messageId,
    clientId,
    timezone,
    tabId,
    chatModelId,
    chatModelSource,
    workspaceId,
    projectId,
    boardId,
    trigger,
  } = input.request;

  const selectedSkills = normalizeSelectedSkills((input.request as any)?.selectedSkills);
  const { abortController, assistantMessageId, requestStartAt } = initRequestContext({
    sessionId,
    cookies: input.cookies,
    clientId,
    timezone,
    tabId,
    workspaceId,
    projectId,
    boardId,
    selectedSkills,
    toolApprovalPayloads: input.request.toolApprovalPayloads,
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

  // 逻辑：在首条用户消息前确保 preface 已落库。
  const parentProjectRootPaths = await resolveParentProjectRootPaths(projectId);
  const resolvedWorkspaceId = getWorkspaceId() ?? workspaceId ?? undefined;
  const resolvedProjectId = getProjectId() ?? projectId ?? undefined;
  await ensureSessionPreface({
    sessionId,
    text: await buildSessionPrefaceText({
      sessionId,
      workspaceId: resolvedWorkspaceId,
      projectId: resolvedProjectId,
      selectedSkills,
      parentProjectRootPaths,
      timezone,
    }),
    createdAt: requestStartAt,
    workspaceId: resolvedWorkspaceId,
    projectId: resolvedProjectId,
    boardId: boardId ?? undefined,
  });

  const isCompactCommand = isCompactCommandMessage(lastMessage);
  let leafMessageId = "";
  let assistantParentUserId: string | null = null;
  let includeCompactPrompt = false;

  if (isCompactCommand) {
    // 中文注释：/summary-history 指令走压缩流程，先写 compact_prompt 再生成 summary。
    if (!lastMessage || lastMessage.role !== "user") {
      return createErrorStreamResponse({
        sessionId,
        assistantMessageId,
        parentMessageId: await resolveRightmostLeafId(sessionId),
        errorText: "请求无效：压缩指令必须来自用户消息。",
      });
    }

    const explicitParent =
      typeof lastMessage.parentMessageId === "string" || lastMessage.parentMessageId === null
        ? (lastMessage.parentMessageId as string | null)
        : undefined;
    const parentMessageId =
      explicitParent === undefined
        ? await resolveRightmostLeafId(sessionId)
        : explicitParent;
    if (!parentMessageId) {
      return createErrorStreamResponse({
        sessionId,
        assistantMessageId,
        parentMessageId: await resolveRightmostLeafId(sessionId),
        errorText: "请求失败：找不到可压缩的对话节点。",
      });
    }

    const compactPromptMessage: TenasUIMessage = {
      id: lastMessage.id,
      role: "user",
      parentMessageId,
      messageKind: "compact_prompt",
      parts: [{ type: "text", text: buildCompactPromptText() }],
    };

    try {
      const saved = await saveMessage({
        sessionId,
        message: compactPromptMessage,
        parentMessageId,
        createdAt: requestStartAt,
      });
      leafMessageId = saved.id;
      assistantParentUserId = saved.id;
      includeCompactPrompt = true;
    } catch (err) {
      logger.error({ err }, "[chat] save compact prompt failed");
      return createErrorStreamResponse({
        sessionId,
        assistantMessageId,
        parentMessageId,
        errorText: "请求失败：保存压缩指令出错。",
      });
    }
  } else {
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

    leafMessageId = saveResult.leafMessageId;
    assistantParentUserId = saveResult.assistantParentUserId;
  }

  const chainResult = await loadAndPrepareMessageChain({
    sessionId,
    leafMessageId,
    assistantParentUserId,
    includeCompactPrompt,
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
  setParentProjectRootPaths(parentProjectRootPaths);

  if (!assistantParentUserId) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: "请求失败：找不到父消息。",
    });
  }
  const parentMessageId = assistantParentUserId;
  setAssistantParentMessageId(parentMessageId);

  let agentMetadata: Record<string, unknown> = {};
  let masterAgent: ReturnType<typeof createMasterAgentRunner>;

  try {
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
      saasAccessToken: input.saasAccessToken,
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
    workspaceId: resolvedWorkspaceId ?? workspaceId ?? undefined,
    modelMessages: modelMessages as UIMessage[],
    agentRunner: masterAgent,
    agentMetadata,
    abortController,
    assistantMessageKind: isCompactCommand ? "compact_summary" : undefined,
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
  /** SaaS access token from request header. */
  saasAccessToken?: string;
}): Promise<ChatImageRequestResult> {
  const {
    sessionId,
    messages: incomingMessages,
    messageId,
    clientId,
    timezone,
    tabId,
    chatModelId,
    chatModelSource,
    workspaceId,
    projectId,
    boardId,
    imageSaveDir,
    trigger,
  } = input.request;

  const selectedSkills = normalizeSelectedSkills((input.request as any)?.selectedSkills);
  const { abortController, assistantMessageId, requestStartAt } = initRequestContext({
    sessionId,
    cookies: input.cookies,
    clientId,
    timezone,
    tabId,
    workspaceId,
    projectId,
    boardId,
    selectedSkills,
    requestSignal: input.requestSignal,
    messageId,
  });

  const lastMessage = incomingMessages.at(-1) as TenasUIMessage | undefined;
  if (!lastMessage || !lastMessage.role || !lastMessage.id) {
    const errorText = formatInvalidRequestMessage("缺少最后一条消息。");
    await setSessionErrorMessage({ sessionId, errorMessage: errorText });
    return createChatImageErrorResult(400, errorText);
  }

  // 逻辑：在首条用户消息前确保 preface 已落库。
  const parentProjectRootPaths = await resolveParentProjectRootPaths(projectId);
  const resolvedWorkspaceId = getWorkspaceId() ?? workspaceId ?? undefined;
  const resolvedProjectId = getProjectId() ?? projectId ?? undefined;
  await ensureSessionPreface({
    sessionId,
    text: await buildSessionPrefaceText({
      sessionId,
      workspaceId: resolvedWorkspaceId,
      projectId: resolvedProjectId,
      selectedSkills,
      parentProjectRootPaths,
      timezone,
    }),
    createdAt: requestStartAt,
    workspaceId: resolvedWorkspaceId,
    projectId: resolvedProjectId,
    boardId: boardId ?? undefined,
  });

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
      metadataMessages: messages as UIMessage[],
      abortSignal: abortController.signal,
      chatModelId,
      chatModelSource,
      modelDefinition: explicitModelDefinition,
      requestMessageId: assistantParentUserId ?? undefined,
      responseMessageId: assistantMessageId,
      trigger,
      boardId,
      imageSaveDir,
      saasAccessToken: input.saasAccessToken,
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
  const rawModelId = input.chatModelId?.trim() ?? "";
  if (!rawModelId) {
    throw new ChatImageRequestError("未指定图片模型。", 400);
  }
  const accessToken = input.saasAccessToken?.trim() ?? "";
  if (!accessToken) {
    throw new ChatImageRequestError("缺少 SaaS 访问令牌。", 401);
  }

  setAbortSignal(input.abortSignal);
  const resolvedModelId = resolveChatModelSuffix(rawModelId);
  const prompt = resolvedPrompt.prompt;
  const promptText = resolvePromptText(prompt);
  const promptTextLength =
    typeof prompt === "string" ? prompt.length : prompt.text?.length ?? 0;
  const promptImageCount = resolvedPrompt.images.length;
  const promptHasMask = Boolean(resolvedPrompt.mask);
  logger.debug(
    {
      promptLength: promptTextLength,
      imageCount: promptImageCount,
      hasMask: promptHasMask,
    },
    "[chat] start image stream",
  );
  const imageOptions = resolveImageGenerateOptions(input.messages as UIMessage[]);
  const output = resolveSaasImageOutput(imageOptions);
  const { style, negativePrompt, parameters } = resolveSaasImageParameters(imageOptions);
  const inputs = await resolveSaasImageInputs({
    images: resolvedPrompt.images,
    mask: resolvedPrompt.mask,
    abortSignal: input.abortSignal,
  });
  const payload: AiImageRequest = {
    modelId: resolvedModelId,
    prompt: promptText,
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(style ? { style } : {}),
    ...(inputs ? { inputs } : {}),
    ...(output ? { output } : {}),
    ...(parameters ? { parameters } : {}),
  };

  const client = getSaasClient(accessToken);
  const submitResult = await client.ai.image(payload);
  if (!submitResult || submitResult.success !== true || !submitResult.data?.taskId) {
    const fallbackMessage = "图片任务创建失败。";
    const message =
      submitResult && submitResult.success === false
        ? submitResult.message
        : fallbackMessage;
    throw new ChatImageRequestError(message, 502);
  }
  const taskId = submitResult.data.taskId;
  const taskResult = await waitForSaasImageTask({
    client,
    taskId,
    abortSignal: input.abortSignal,
  });
  const resultUrls = (taskResult.resultUrls ?? [])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  if (resultUrls.length === 0) {
    throw new Error("图片生成结果为空。");
  }

  // 逻辑：生成图片元信息用于持久化与预览查询。
  const metadataPayload = buildImageMetadata({
    sessionId: input.sessionId,
    prompt: promptText,
    modelId: resolvedModelId,
    chatModelId: input.chatModelId,
    chatModelSource: input.chatModelSource,
    providerId: "tenas-saas",
    requestMessageId: input.requestMessageId,
    responseMessageId: input.responseMessageId,
    trigger: input.trigger,
    boardId: input.boardId,
    imageOptions: imageOptions
      ? {
          n: imageOptions.n,
          size: imageOptions.size,
          aspectRatio: imageOptions.aspectRatio,
        }
      : undefined,
    messages: input.metadataMessages ?? input.messages,
  });
  const workspaceId = getWorkspaceId();
  if (!workspaceId) {
    throw new Error("workspaceId 缺失，无法保存图片");
  }
  const projectId = getProjectId();
  const imageSaveDirRaw =
    typeof input.imageSaveDir === "string" ? input.imageSaveDir.trim() : "";
  if (imageSaveDirRaw) {
    const resolvedSaveDir = await resolveImageSaveDirectory({
      imageSaveDir: imageSaveDirRaw,
      workspaceId,
      projectId: projectId || undefined,
    });
    if (!resolvedSaveDir) {
      throw new ChatImageRequestError("imageSaveDir 无效。", 400);
    }
    await saveImageUrlsToDirectory({
      urls: resultUrls,
      directory: resolvedSaveDir,
    });
  }
  const persistedImageParts: Array<{ type: "file"; url: string; mediaType: string }> = [];
  for (const [index, url] of resultUrls.entries()) {
    const downloaded = await downloadImageWithType({
      url,
      abortSignal: input.abortSignal,
    });
    const baseName = resolveBaseNameFromUrl(url, `image-${index + 1}`);
    const ext = resolveImageExtension(downloaded.mediaType);
    const fileName = `${baseName}.${ext}`;
    const saved = await saveChatImageAttachment({
      workspaceId,
      projectId: projectId || undefined,
      sessionId: input.sessionId,
      fileName,
      mediaType: downloaded.mediaType,
      buffer: downloaded.buffer,
      metadata: metadataPayload,
    });
    persistedImageParts.push({
      type: "file",
      url: saved.url,
      mediaType: saved.mediaType,
    });
  }
  logger.debug(
    {
      persistedImageCount: persistedImageParts.length,
    },
    "[chat] image attachments saved",
  );

  const agentMetadata = {
    id: "master-agent",
    name: "MasterAgent",
    kind: "master",
    model: {
      provider: "tenas-saas",
      modelId: resolvedModelId,
    },
    chatModelId: input.chatModelId,
    modelDefinition: input.modelDefinition,
  };

  return {
    imageParts: persistedImageParts,
    persistedImageParts,
    agentMetadata,
  };
}

/** 生成图片并返回 SSE 响应。 */
async function runImageModelStream(input: {
  sessionId: string;
  assistantMessageId: string;
  parentMessageId: string;
  requestStartAt: Date;
  messages: UIMessage[];
  /** Raw UI messages for metadata. */
  metadataMessages?: UIMessage[];
  abortSignal: AbortSignal;
  chatModelId?: string;
  chatModelSource?: ChatModelSource;
  modelDefinition?: ModelDefinition;
  requestMessageId?: string;
  responseMessageId?: string;
  trigger?: string;
  boardId?: string | null;
  saasAccessToken?: string;
}): Promise<Response> {
  try {
    const imageResult = await generateImageModelResult({
      sessionId: input.sessionId,
      messages: input.messages,
      metadataMessages: input.metadataMessages,
      abortSignal: input.abortSignal,
      chatModelId: input.chatModelId,
      chatModelSource: input.chatModelSource,
      modelDefinition: input.modelDefinition,
      requestMessageId: input.requestMessageId,
      responseMessageId: input.responseMessageId,
      trigger: input.trigger,
      boardId: input.boardId,
      saasAccessToken: input.saasAccessToken,
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

type SanitizedRequestParts = {
  /** Sanitized parts for metadata. */
  parts: Array<{ type: string; text?: string; url?: string; mediaType?: string }>;
  /** Metadata flags derived from sanitization. */
  flags: { hasDataUrlOmitted?: boolean; hasBinaryOmitted?: boolean };
  /** Warning messages for logs. */
  warnings: string[];
};

/** Resolve prompt text from image prompt payload. */
function resolvePromptText(prompt: GenerateImagePrompt): string {
  if (typeof prompt === "string") return prompt.trim();
  return typeof prompt.text === "string" ? prompt.text.trim() : "";
}

/** Resolve model id suffix from chatModelId. */
function resolveChatModelSuffix(chatModelId: string): string {
  const trimmed = chatModelId.trim();
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) return trimmed;
  return trimmed.slice(separatorIndex + 1).trim() || trimmed;
}

/** Map size/aspectRatio to SaaS aspectRatio enum. */
function resolveSaasAspectRatio(options?: ImageGenerateOptions): "1:1" | "16:9" | "9:16" | "4:3" | undefined {
  const rawSize = typeof options?.size === "string" ? options?.size.trim() : "";
  if (rawSize && /^\d+x\d+$/u.test(rawSize)) {
    const [widthText, heightText] = rawSize.split("x");
    const width = Number(widthText);
    const height = Number(heightText);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      if (width === height) return "1:1";
      if (width * 9 === height * 16) return "16:9";
      if (width * 16 === height * 9) return "9:16";
      if (width * 3 === height * 4) return "4:3";
    }
  }
  const rawAspectRatio = typeof options?.aspectRatio === "string" ? options?.aspectRatio.trim() : "";
  if (
    rawAspectRatio === "1:1" ||
    rawAspectRatio === "16:9" ||
    rawAspectRatio === "9:16" ||
    rawAspectRatio === "4:3"
  ) {
    return rawAspectRatio;
  }
  return undefined;
}

/** Build SaaS image output payload. */
function resolveSaasImageOutput(
  options?: ImageGenerateOptions,
): AiImageRequest["output"] | undefined {
  const count = typeof options?.n === "number" ? options.n : undefined;
  const aspectRatio = resolveSaasAspectRatio(options);
  const qualityRaw = options?.providerOptions?.openai?.quality?.trim();
  const quality =
    qualityRaw === "standard" || qualityRaw === "hd" ? qualityRaw : undefined;
  if (count === undefined && !aspectRatio && !quality) return undefined;
  return {
    ...(count !== undefined ? { count } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(quality ? { quality } : {}),
  };
}

/** Resolve SaaS optional parameters and style. */
function resolveSaasImageParameters(
  options?: ImageGenerateOptions,
): { style?: string; negativePrompt?: string; parameters?: Record<string, unknown> } {
  const style = options?.providerOptions?.openai?.style?.trim() || undefined;
  const negativePrompt = options?.providerOptions?.qwen?.negative_prompt?.trim() || undefined;
  const parameters: Record<string, unknown> = {};
  if (typeof options?.seed === "number" && Number.isFinite(options.seed)) {
    parameters.seed = options.seed;
  }
  if (options?.providerOptions && Object.keys(options.providerOptions).length > 0) {
    parameters.providerOptions = options.providerOptions;
  }
  return {
    ...(style ? { style } : {}),
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
  };
}

/** Resolve prompt images into SaaS inputs. */
async function resolveSaasImageInputs(input: {
  images: Array<{ data: unknown; mediaType?: string }>;
  mask?: { data: unknown; mediaType?: string };
  abortSignal: AbortSignal;
}): Promise<AiImageRequest["inputs"] | undefined> {
  if (input.images.length === 0 && !input.mask) return undefined;
  const workspaceId = getWorkspaceId();
  const projectId = getProjectId();
  const resolvedImages = await Promise.all(
    input.images.map((image, index) =>
      resolveImageInputBuffer({
        data: image.data as any,
        mediaType: image.mediaType,
        fallbackName: `image-${index + 1}`,
        projectId: projectId || undefined,
        workspaceId: workspaceId || undefined,
        abortSignal: input.abortSignal,
      }).then((resolved) => ({
        base64: resolved.buffer.toString("base64"),
        mediaType: resolved.mediaType,
      })),
    ),
  );
  const resolvedMask = input.mask
    ? await resolveImageInputBuffer({
        data: input.mask.data as any,
        mediaType: input.mask.mediaType,
        fallbackName: "mask",
        projectId: projectId || undefined,
        workspaceId: workspaceId || undefined,
        abortSignal: input.abortSignal,
      }).then((resolved) => ({
        base64: resolved.buffer.toString("base64"),
        mediaType: resolved.mediaType,
      }))
    : undefined;
  return {
    ...(resolvedImages.length > 0 ? { images: resolvedImages } : {}),
    ...(resolvedMask ? { mask: resolvedMask } : {}),
  };
}

/** Sleep for a short duration or abort early. */
async function sleepWithAbort(ms: number, abortSignal: AbortSignal): Promise<void> {
  if (abortSignal.aborted) {
    throw new ChatImageRequestError("请求已取消。", 499);
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      abortSignal.removeEventListener("abort", onAbort);
      reject(new ChatImageRequestError("请求已取消。", 499));
    };
    const timer = setTimeout(() => {
      abortSignal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    abortSignal.addEventListener("abort", onAbort);
  });
}

/** Poll SaaS image task until completion. */
async function waitForSaasImageTask(input: {
  client: ReturnType<typeof getSaasClient>;
  taskId: string;
  abortSignal: AbortSignal;
}): Promise<{
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  resultUrls?: string[];
  error?: { message?: string; code?: string };
}> {
  const startAt = Date.now();
  while (true) {
    if (input.abortSignal.aborted) {
      try {
        await input.client.ai.cancelTask(input.taskId);
      } catch {
        // 忽略取消失败。
      }
      throw new ChatImageRequestError("请求已取消。", 499);
    }
    const response = await input.client.ai.task(input.taskId);
    if (!response || response.success !== true) {
      const message = response?.message || "任务查询失败。";
      throw new ChatImageRequestError(message, 502);
    }
    const data = response.data;
    if (data.status === "succeeded") {
      return {
        status: data.status,
        resultUrls: data.resultUrls ?? undefined,
        error: data.error ?? undefined,
      };
    }
    if (data.status === "failed" || data.status === "canceled") {
      const message = data.error?.message || "图片生成失败。";
      throw new ChatImageRequestError(message, 502);
    }
    if (Date.now() - startAt > SAAS_IMAGE_TASK_TIMEOUT_MS) {
      throw new ChatImageRequestError("图片生成超时。", 504);
    }
    await sleepWithAbort(SAAS_IMAGE_TASK_POLL_MS, input.abortSignal);
  }
}

/** Download image data and resolve media type. */
async function downloadImageWithType(input: {
  url: string;
  abortSignal: AbortSignal;
}): Promise<{ buffer: Buffer; mediaType: string }> {
  if (input.url.startsWith("data:")) {
    const mediaType = resolveMediaTypeFromDataUrl(input.url) || "image/png";
    const bytes = await downloadImageData(input.url, input.abortSignal);
    return { buffer: Buffer.from(bytes), mediaType };
  }
  const response = await fetch(input.url, { signal: input.abortSignal });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`下载图片失败: ${response.status} ${text}`.trim());
  }
  const mediaType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mediaType };
}

/** Resolve the latest user message in a message list. */
function resolveLatestUserMessage(messages: UIMessage[]): UIMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as UIMessage;
    if (message?.role === "user") return message;
  }
  return null;
}

/** Sanitize request parts for metadata persistence. */
function sanitizeRequestParts(parts: unknown[]): SanitizedRequestParts {
  const sanitized: Array<{ type: string; text?: string; url?: string; mediaType?: string }> = [];
  const warnings: string[] = [];
  const flags: { hasDataUrlOmitted?: boolean; hasBinaryOmitted?: boolean } = {};
  let dataUrlCount = 0;
  let binaryCount = 0;

  for (const rawPart of parts) {
    if (!rawPart || typeof rawPart !== "object") continue;
    const part = rawPart as Record<string, unknown>;
    const type = typeof part.type === "string" ? part.type : "";
    if (type === "text") {
      if (typeof part.text === "string" && part.text.trim()) {
        sanitized.push({ type: "text", text: part.text });
      }
      continue;
    }
    if (type === "file") {
      const mediaType = typeof part.mediaType === "string" ? part.mediaType : undefined;
      const url = typeof part.url === "string" ? part.url : "";
      if (url.startsWith("data:")) {
        // 逻辑：data url 不写入元信息，改为占位符。
        dataUrlCount += 1;
        flags.hasDataUrlOmitted = true;
        sanitized.push({ type: "file", url: "[data-url-omitted]", mediaType });
        continue;
      }
      if (!url) {
        // 逻辑：未知二进制内容不写入元信息，改为占位符。
        binaryCount += 1;
        flags.hasBinaryOmitted = true;
        sanitized.push({ type: "file", url: "[binary-omitted]", mediaType });
        continue;
      }
      sanitized.push({ type: "file", url, mediaType });
    }
  }

  if (dataUrlCount > 0) {
    warnings.push(`metadata omitted ${dataUrlCount} data url(s)`);
  }
  if (binaryCount > 0) {
    warnings.push(`metadata omitted ${binaryCount} binary part(s)`);
  }

  return { parts: sanitized, flags, warnings };
}

/** Build image metadata payload for persistence. */
function buildImageMetadata(input: {
  sessionId: string;
  prompt: string;
  revisedPrompt?: string;
  modelId: string;
  chatModelId?: string;
  chatModelSource?: ChatModelSource;
  providerId?: string;
  requestMessageId?: string;
  responseMessageId?: string;
  trigger?: string;
  boardId?: string | null;
  imageOptions?: { n?: number; size?: string; aspectRatio?: string };
  messages: UIMessage[];
}): TenasImageMetadataV1 {
  const latestUser = resolveLatestUserMessage(input.messages);
  const rawParts = Array.isArray((latestUser as any)?.parts) ? ((latestUser as any).parts as unknown[]) : [];
  const sanitized = sanitizeRequestParts(rawParts);
  if (sanitized.warnings.length > 0) {
    logger.warn(
      { sessionId: input.sessionId, warnings: sanitized.warnings },
      "[chat] image metadata sanitized",
    );
  }
  const workspaceId = getWorkspaceId();
  const projectId = getProjectId();

  return {
    version: 1,
    chatSessionId: input.sessionId,
    prompt: input.prompt,
    revised_prompt: input.revisedPrompt,
    modelId: input.modelId,
    chatModelId: input.chatModelId,
    modelSource: input.chatModelSource,
    providerId: input.providerId,
    workspaceId: workspaceId || undefined,
    projectId: projectId || undefined,
    boardId: input.boardId || undefined,
    trigger: input.trigger,
    requestMessageId:
      input.requestMessageId ?? (typeof (latestUser as any)?.id === "string" ? (latestUser as any).id : undefined),
    responseMessageId: input.responseMessageId,
    createdAt: new Date().toISOString(),
    imageOptions: input.imageOptions,
    request: {
      parts: sanitized.parts,
      metadata: (latestUser as any)?.metadata,
    },
    flags: sanitized.flags,
    warnings: sanitized.warnings.length > 0 ? sanitized.warnings : undefined,
  };
}
