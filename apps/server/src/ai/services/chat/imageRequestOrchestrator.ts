/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { type UIMessage } from 'ai'
import type { ChatModelSource, ModelDefinition } from '@openloaf/api/common'
import type { OpenLoafUIMessage, TokenUsage } from '@openloaf/api/types/message'
import {
  setAbortSignal,
  getProjectId,
} from '@/ai/shared/context/requestContext'
import { logger } from '@/common/logger'
import { resolveParentProjectRootPaths } from '@/ai/shared/util'
import { resolveImagePrompt } from '@/ai/services/image/imagePrompt'
import { saveChatImageAttachment } from '@/ai/services/image/attachmentResolver'
import {
  resolveBaseNameFromUrl,
  resolveImageExtension,
  resolveImageSaveDirectory,
  saveImageUrlsToDirectory,
} from '@/ai/services/image/imageStorage'
import { submitV3Generate } from '@/modules/saas/modules/media/client'
import {
  createChatImageErrorResult,
  formatImageErrorMessage,
  formatInvalidRequestMessage,
  initRequestContext,
  loadAndPrepareMessageChain,
  saveLastMessageAndResolveParent,
} from './chatStreamHelpers'
import { resolveImageGenerateOptions } from './messageOptionResolver'
import { resolveExplicitModelDefinition } from './modelResolution'
import type { ChatImageRequest, ChatImageRequestResult } from '@/ai/services/image/types'
import {
  clearSessionErrorMessage,
  ensureSessionPreface,
  resolveSessionPrefaceText,
  saveMessage,
  setSessionErrorMessage,
} from '@/ai/services/chat/repositories/messageStore'
import { buildTimingMetadata } from './metadataBuilder'
import { buildSessionPrefaceText } from '@/ai/shared/prefaceBuilder'
import { resolveAgentModelIds, resolveAgentSkills } from './agentConfigResolver'
import {
  ChatImageRequestError,
  resolveChatModelSuffix,
  resolvePromptText,
  resolveSaasImageOutput,
  resolveSaasImageParameters,
  resolveSaasImageInputs,
  waitForSaasImageTask,
  downloadImageWithType,
  buildImageMetadata,
} from './saasImageHelpers'
import {
  createErrorStreamResponse,
  createImageStreamResponse,
} from './streamOrchestrator'

type ImageModelRequest = {
  /** Session id. */
  sessionId: string
  /** Incoming UI messages. */
  messages: UIMessage[]
  /** Raw UI messages for metadata. */
  metadataMessages?: UIMessage[]
  /** Abort signal for image generation. */
  abortSignal: AbortSignal
  /** Image model id. */
  chatModelId?: string
  /** Image model source. */
  chatModelSource?: ChatModelSource
  /** Optional model definition. */
  modelDefinition?: ModelDefinition | null
  /** Optional request message id. */
  requestMessageId?: string
  /** Optional response message id. */
  responseMessageId?: string
  /** Optional trigger source. */
  trigger?: string
  /** Optional board id. */
  boardId?: string | null
  /** Optional image save directory uri. */
  imageSaveDir?: string
  /** SaaS access token for media generation. */
  saasAccessToken?: string
}

type ImageModelResult = {
  /** Image parts for immediate response. */
  imageParts: Array<{ type: 'file'; url: string; mediaType: string }>
  /** Persisted image parts for message storage. */
  persistedImageParts: Array<{ type: 'file'; url: string; mediaType: string }>
  /** Revised prompt text. */
  revisedPrompt?: string
  /** Agent metadata for persistence. */
  agentMetadata: Record<string, unknown>
  /** Token usage for metadata. */
  totalUsage?: TokenUsage
}

/** Run chat image request and return JSON-friendly result. */
export async function runChatImageRequest(input: {
  /** Chat request payload. */
  request: ChatImageRequest
  /** Cookies from request. */
  cookies: Record<string, string>
  /** Raw request signal. */
  requestSignal: AbortSignal
  /** SaaS access token from request header. */
  saasAccessToken?: string
}): Promise<ChatImageRequestResult> {
  const {
    sessionId,
    messages: incomingMessages,
    messageId,
    clientId,
    timezone,
    tabId,
    projectId,
    boardId,
    imageSaveDir,
    trigger,
  } = input.request

  // 逻辑：从 master agent 配置读取模型，不再依赖请求参数。
  const imageAgentModelIds = resolveAgentModelIds({ projectId })
  const chatModelId = imageAgentModelIds.chatModelId
  const chatModelSource = imageAgentModelIds.chatModelSource

  const selectedSkills = resolveAgentSkills({ projectId })
  const { abortController, assistantMessageId, requestStartAt } = initRequestContext({
    sessionId,
    cookies: input.cookies,
    clientId,
    timezone,
    tabId,
    projectId,
    boardId,
    selectedSkills,
    requestSignal: input.requestSignal,
    messageId,
    saasAccessToken: input.saasAccessToken,
    clientPlatform: input.request.clientPlatform,
    webVersion: input.request.webVersion,
    serverVersion: input.request.serverVersion,
    desktopVersion: input.request.desktopVersion,
    pageContext: input.request.pageContext,
  })

  const lastMessage = incomingMessages.at(-1) as OpenLoafUIMessage | undefined
  if (!lastMessage || !lastMessage.role || !lastMessage.id) {
    const errorText = formatInvalidRequestMessage('缺少最后一条消息。')
    await setSessionErrorMessage({ sessionId, errorMessage: errorText })
    return createChatImageErrorResult(400, errorText)
  }

  // 逻辑：首条消息时构建 preface 并落库；已有 preface 时复用。
  const parentProjectRootPaths = await resolveParentProjectRootPaths(projectId)
  const resolvedProjectId = getProjectId() ?? projectId ?? undefined
  const existingPreface = await resolveSessionPrefaceText(sessionId)
  if (!existingPreface) {
    const result = await buildSessionPrefaceText({
      sessionId,
      projectId: resolvedProjectId,
      selectedSkills,
      parentProjectRootPaths,
      timezone,
      clientPlatform: input.request.clientPlatform,
    })
    await ensureSessionPreface({
      sessionId,
      text: result.prefaceText,
      createdAt: requestStartAt,
      projectId: resolvedProjectId,
      boardId: boardId ?? undefined,
    })
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
  })
  if (!saveResult.ok) {
    await setSessionErrorMessage({ sessionId, errorMessage: saveResult.errorText })
    return createChatImageErrorResult(saveResult.status, saveResult.errorText)
  }

  const { leafMessageId, assistantParentUserId } = saveResult
  const chainResult = await loadAndPrepareMessageChain({
    sessionId,
    leafMessageId,
    assistantParentUserId,
    formatError: formatImageErrorMessage,
  })
  if (!chainResult.ok) {
    await setSessionErrorMessage({ sessionId, errorMessage: chainResult.errorText })
    return createChatImageErrorResult(400, chainResult.errorText)
  }
  const { messages, modelMessages } = chainResult

  try {
    const explicitModelDefinition = await resolveExplicitModelDefinition(chatModelId)
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
    })

    const timingMetadata = buildTimingMetadata({
      startedAt: requestStartAt,
      finishedAt: new Date(),
    })
    const usageMetadata = imageResult.totalUsage ? { totalUsage: imageResult.totalUsage } : {}
    const mergedMetadata: Record<string, unknown> = {
      ...usageMetadata,
      ...timingMetadata,
      ...(Object.keys(imageResult.agentMetadata).length > 0
        ? { agent: imageResult.agentMetadata }
        : {}),
    }

    const revisedPromptPart = imageResult.revisedPrompt
      ? [
          {
            type: 'data-revised-prompt' as const,
            data: { text: imageResult.revisedPrompt },
          },
        ]
      : []
    const messageParts = [...imageResult.persistedImageParts, ...revisedPromptPart]

    const message: OpenLoafUIMessage = {
      id: assistantMessageId,
      role: 'assistant',
      parts: messageParts,
      parentMessageId: assistantParentUserId,
      metadata: mergedMetadata,
    }

    await saveMessage({
      sessionId,
      message,
      parentMessageId: assistantParentUserId,
      allowEmpty: false,
      createdAt: requestStartAt,
    })
    await clearSessionErrorMessage({ sessionId })

    return { ok: true, response: { sessionId, message } }
  } catch (err) {
    logger.error({ err, sessionId, chatModelId }, '[chat] image request failed')
    if (err instanceof ChatImageRequestError) {
      const errorText = formatImageErrorMessage(err)
      await setSessionErrorMessage({ sessionId, errorMessage: errorText })
      return createChatImageErrorResult(err.status, errorText)
    }
    const errorText = formatImageErrorMessage(err)
    await setSessionErrorMessage({ sessionId, errorMessage: errorText })
    return createChatImageErrorResult(500, errorText)
  }
}

/** Generate image result for chat image flows. */
export async function generateImageModelResult(
  input: ImageModelRequest,
): Promise<ImageModelResult> {
  const resolvedPrompt = resolveImagePrompt(input.messages)
  if (!resolvedPrompt) {
    throw new ChatImageRequestError('缺少图片生成提示词。', 400)
  }
  const rawModelId = input.chatModelId?.trim() ?? ''
  if (!rawModelId) {
    throw new ChatImageRequestError('未指定图片模型。', 400)
  }
  const accessToken = input.saasAccessToken?.trim() ?? ''
  if (!accessToken) {
    throw new ChatImageRequestError('缺少 SaaS 访问令牌。', 401)
  }

  setAbortSignal(input.abortSignal)
  const resolvedModelId = resolveChatModelSuffix(rawModelId)
  const prompt = resolvedPrompt.prompt
  const promptText = resolvePromptText(prompt)
  const promptTextLength =
    typeof prompt === 'string' ? prompt.length : prompt.text?.length ?? 0
  const promptImageCount = resolvedPrompt.images.length
  const promptHasMask = Boolean(resolvedPrompt.mask)
  logger.debug(
    {
      promptLength: promptTextLength,
      imageCount: promptImageCount,
      hasMask: promptHasMask,
    },
    '[chat] start image stream',
  )
  const imageOptions = resolveImageGenerateOptions(input.messages as UIMessage[])
  const output = resolveSaasImageOutput(imageOptions)
  const { style, negativePrompt, parameters } = resolveSaasImageParameters(imageOptions)
  const inputs = await resolveSaasImageInputs({
    images: resolvedPrompt.images,
    mask: resolvedPrompt.mask,
    abortSignal: input.abortSignal,
  })
  const v3Payload: Record<string, unknown> = {
    feature: 'imageGenerate',
    variant: 'OL-IG-001',
    inputs: {
      prompt: promptText,
      ...(inputs?.images ? { images: inputs.images } : {}),
      ...(inputs?.mask ? { mask: inputs.mask } : {}),
    },
    params: {
      ...(negativePrompt ? { negativePrompt } : {}),
      ...(style ? { style } : {}),
      ...(output?.aspectRatio ? { aspectRatio: output.aspectRatio } : {}),
      ...(output?.quality ? { quality: output.quality } : {}),
      ...(parameters ? { ...parameters } : {}),
    },
    ...(output?.count ? { count: output.count } : {}),
  }

  const submitResult = await submitV3Generate(v3Payload, accessToken)
  if (!submitResult?.data || !('taskId' in submitResult.data)) {
    throw new ChatImageRequestError('图片任务创建失败。', 502)
  }
  const taskId = submitResult.data.taskId
  const taskResult = await waitForSaasImageTask({
    accessToken,
    taskId,
    abortSignal: input.abortSignal,
  })
  const resultUrls = (taskResult.resultUrls ?? [])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
  if (resultUrls.length === 0) {
    throw new Error('图片生成结果为空。')
  }

  // 逻辑：生成图片元信息用于持久化与预览查询。
  const metadataPayload = buildImageMetadata({
    sessionId: input.sessionId,
    prompt: promptText,
    modelId: resolvedModelId,
    chatModelId: input.chatModelId,
    chatModelSource: input.chatModelSource,
    providerId: 'openloaf-saas',
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
  })
  const projectId = getProjectId()
  const imageSaveDirRaw =
    typeof input.imageSaveDir === 'string' ? input.imageSaveDir.trim() : ''
  if (imageSaveDirRaw) {
    const resolvedSaveDir = await resolveImageSaveDirectory({
      imageSaveDir: imageSaveDirRaw,
      projectId: projectId || undefined,
    })
    if (!resolvedSaveDir) {
      throw new ChatImageRequestError('imageSaveDir 无效。', 400)
    }
    await saveImageUrlsToDirectory({
      urls: resultUrls,
      directory: resolvedSaveDir,
    })
  }
  const persistedImageParts: Array<{ type: 'file'; url: string; mediaType: string }> = []
  for (const [index, url] of resultUrls.entries()) {
    const downloaded = await downloadImageWithType({
      url,
      abortSignal: input.abortSignal,
    })
    const baseName = resolveBaseNameFromUrl(url, `image-${index + 1}`)
    const ext = resolveImageExtension(downloaded.mediaType)
    const fileName = `${baseName}.${ext}`
    const saved = await saveChatImageAttachment({
      projectId: projectId || undefined,
      boardId: input.boardId || undefined,
      sessionId: input.sessionId,
      fileName,
      mediaType: downloaded.mediaType,
      buffer: downloaded.buffer,
      metadata: metadataPayload,
    })
    persistedImageParts.push({
      type: 'file',
      url: saved.url,
      mediaType: saved.mediaType,
    })
  }
  logger.debug(
    {
      persistedImageCount: persistedImageParts.length,
    },
    '[chat] image attachments saved',
  )

  const agentMetadata = {
    id: 'master-agent',
    name: 'MasterAgent',
    kind: 'master',
    model: {
      provider: 'openloaf-saas',
      modelId: resolvedModelId,
      ...(input.modelDefinition?.familyId
        ? { familyId: input.modelDefinition.familyId }
        : {}),
      ...(input.modelDefinition?.name ? { name: input.modelDefinition.name } : {}),
    },
    chatModelId: input.chatModelId,
  }

  return {
    imageParts: persistedImageParts,
    persistedImageParts,
    agentMetadata,
  }
}

/** 生成图片并返回 SSE 响应。 */
export async function runImageModelStream(input: {
  sessionId: string
  assistantMessageId: string
  parentMessageId: string
  requestStartAt: Date
  messages: UIMessage[]
  /** Raw UI messages for metadata. */
  metadataMessages?: UIMessage[]
  abortSignal: AbortSignal
  chatModelId?: string
  chatModelSource?: ChatModelSource
  modelDefinition?: ModelDefinition
  requestMessageId?: string
  responseMessageId?: string
  trigger?: string
  boardId?: string | null
  saasAccessToken?: string
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
    })
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
    })
  } catch (err) {
    const modelId = input.chatModelId?.trim() ?? ''
    logger.error(
      { err, sessionId: input.sessionId, chatModelId: modelId },
      '[chat] image stream failed',
    )
    const errorText = formatImageErrorMessage(err)
    return createErrorStreamResponse({
      sessionId: input.sessionId,
      assistantMessageId: input.assistantMessageId,
      parentMessageId: input.parentMessageId,
      errorText,
    })
  }
}
