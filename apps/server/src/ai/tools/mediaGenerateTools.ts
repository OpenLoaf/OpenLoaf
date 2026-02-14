import { tool, zodSchema } from 'ai'
import type { UIMessageStreamWriter } from 'ai'
import { imageGenerateToolDef, videoGenerateToolDef } from '@tenas-ai/api/types/tools/mediaGenerate'
import { logger } from '@/common/logger'
import {
  getAbortSignal,
  getMediaModelId,
  getSaasAccessToken,
  getSessionId,
  getUiWriter,
  getWorkspaceId,
  getProjectId,
} from '@/ai/shared/context/requestContext'
import {
  submitMediaTask,
  pollMediaTask,
  cancelMediaTask,
} from '@/modules/saas/modules/media/client'
import { saveChatImageAttachment } from '@/ai/services/image/attachmentResolver'

/** Task poll interval. */
const POLL_INTERVAL_MS = 1500
/** Task timeout. */
const TASK_TIMEOUT_MS = 5 * 60 * 1000

/** Write a typed data event to the UI stream. */
function writeDataEvent(
  writer: UIMessageStreamWriter<any> | undefined,
  type: string,
  data: Record<string, unknown>,
) {
  if (!writer) return
  writer.write({ type, data } as any)
}

/** Throw a media generation error after pushing an error event to the UI. */
function throwMediaError(input: {
  writer: UIMessageStreamWriter<any> | undefined
  toolCallId: string
  kind: 'image' | 'video'
  errorCode: string
  message: string
}): never {
  writeDataEvent(input.writer, 'data-media-generate-error', {
    toolCallId: input.toolCallId,
    kind: input.kind,
    errorCode: input.errorCode,
  })
  throw new Error(input.message)
}

/** Sleep with abort support. */
function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('请求已取消。'))
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(new Error('请求已取消。'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort)
  })
}

/** Wait for a SaaS media task to complete, pushing progress events. */
async function waitForMediaTask(input: {
  taskId: string
  accessToken: string
  abortSignal: AbortSignal
  writer: UIMessageStreamWriter<any> | undefined
  toolCallId: string
  kind: 'image' | 'video'
}): Promise<{ urls: string[] }> {
  const startAt = Date.now()
  while (true) {
    if (input.abortSignal.aborted) {
      try {
        await cancelMediaTask(input.taskId, input.accessToken)
      } catch {
        // 忽略取消失败。
      }
      throw new Error('请求已取消。')
    }
    const result = await pollMediaTask(input.taskId, input.accessToken)
    if (result.progress != null) {
      writeDataEvent(input.writer, 'data-media-generate-progress', {
        toolCallId: input.toolCallId,
        progress: result.progress,
      })
    }
    if (result.status === 'succeeded') {
      return { urls: result.resultUrls ?? [] }
    }
    if (result.status === 'failed' || result.status === 'canceled') {
      const message = result.error?.message || '生成失败。'
      const errorCode = result.error?.code === 'insufficient_credits'
        ? 'insufficient_credits'
        : 'generation_failed'
      throwMediaError({
        writer: input.writer,
        toolCallId: input.toolCallId,
        kind: input.kind,
        errorCode,
        message,
      })
    }
    if (Date.now() - startAt > TASK_TIMEOUT_MS) {
      throwMediaError({
        writer: input.writer,
        toolCallId: input.toolCallId,
        kind: input.kind,
        errorCode: 'generation_failed',
        message: '生成超时。',
      })
    }
    await sleepWithAbort(POLL_INTERVAL_MS, input.abortSignal)
  }
}

/** Download image from URL and save as chat attachment. */
async function downloadAndSaveImage(input: {
  url: string
  sessionId: string
  workspaceId: string
  projectId?: string
  abortSignal: AbortSignal
}): Promise<{ url: string; mediaType: string }> {
  const response = await fetch(input.url, { signal: input.abortSignal })
  if (!response.ok) {
    throw new Error(`下载图片失败: ${response.status}`)
  }
  const mediaType = response.headers.get('content-type') || 'image/png'
  const buffer = Buffer.from(await response.arrayBuffer())
  const fileName = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
  return saveChatImageAttachment({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    fileName,
    mediaType,
    buffer,
  })
}

/** Core media generate logic shared by image and video tools. */
async function executeMediaGenerate(input: {
  kind: 'image' | 'video'
  toolCallId: string
  prompt: string
  negativePrompt?: string
  aspectRatio?: string
  count?: number
  duration?: number
}) {
  const writer = getUiWriter()
  const accessToken = getSaasAccessToken()
  const modelId = getMediaModelId(input.kind)
  const sessionId = getSessionId()
  const workspaceId = getWorkspaceId()
  const projectId = getProjectId()
  const abortSignal = getAbortSignal()

  // 逻辑：校验前置条件。
  if (!accessToken) {
    throwMediaError({
      writer,
      toolCallId: input.toolCallId,
      kind: input.kind,
      errorCode: 'login_required',
      message: '需要登录 Tenas 云端账户才能生成' + (input.kind === 'image' ? '图片' : '视频') + '。',
    })
  }
  if (!modelId) {
    throwMediaError({
      writer,
      toolCallId: input.toolCallId,
      kind: input.kind,
      errorCode: 'no_model',
      message: '未选择' + (input.kind === 'image' ? '图片' : '视频') + '生成模型。',
    })
  }

  // 逻辑：推送开始事件。
  writeDataEvent(writer, 'data-media-generate-start', {
    toolCallId: input.toolCallId,
    kind: input.kind,
    prompt: input.prompt.slice(0, 100),
  })

  // 逻辑：构建 SaaS payload 并提交任务。
  const payload: Record<string, unknown> = {
    modelId,
    prompt: input.prompt,
  }
  if (input.negativePrompt) payload.negativePrompt = input.negativePrompt
  if (input.aspectRatio) {
    payload.output = { aspectRatio: input.aspectRatio }
  }
  if (input.kind === 'image' && input.count && input.count > 1) {
    payload.output = { ...(payload.output as any), count: input.count }
  }
  if (input.kind === 'video' && input.duration) {
    payload.parameters = { duration: input.duration }
  }

  logger.info({ kind: input.kind, modelId, promptLength: input.prompt.length }, '[media-tool] submit task')

  const submitResult = await submitMediaTask({ kind: input.kind, payload }, accessToken)
  if (!submitResult || (submitResult as any).success !== true || !(submitResult as any).data?.taskId) {
    const message = (submitResult as any)?.message || '任务创建失败。'
    const errorCode = message.includes('积分') || message.includes('credit')
      ? 'insufficient_credits'
      : 'generation_failed'
    throwMediaError({
      writer,
      toolCallId: input.toolCallId,
      kind: input.kind,
      errorCode,
      message,
    })
  }

  const taskId = (submitResult as any).data.taskId as string
  const signal = abortSignal ?? new AbortController().signal

  // 逻辑：轮询等待任务完成。
  const taskResult = await waitForMediaTask({
    taskId,
    accessToken,
    abortSignal: signal,
    writer,
    toolCallId: input.toolCallId,
    kind: input.kind,
  })

  // 逻辑：图片结果下载并保存为 chat 附件。
  let resultUrls = taskResult.urls
  if (input.kind === 'image' && sessionId && workspaceId && resultUrls.length > 0) {
    try {
      const saved = await Promise.all(
        resultUrls.map((url) =>
          downloadAndSaveImage({
            url,
            sessionId,
            workspaceId,
            projectId,
            abortSignal: signal,
          }),
        ),
      )
      resultUrls = saved.map((s) => s.url)
    } catch (err) {
      logger.warn({ err }, '[media-tool] save image attachment failed, using remote urls')
    }
  }

  // 逻辑：推送完成事件。
  writeDataEvent(writer, 'data-media-generate-end', {
    toolCallId: input.toolCallId,
    kind: input.kind,
    urls: resultUrls,
  })

  return {
    success: true,
    kind: input.kind,
    urls: resultUrls,
    count: resultUrls.length,
  }
}

export const imageGenerateTool = tool({
  description: imageGenerateToolDef.description,
  inputSchema: zodSchema(imageGenerateToolDef.parameters),
  execute: async (params, { toolCallId }) => {
    return executeMediaGenerate({
      kind: 'image',
      toolCallId,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      aspectRatio: params.aspectRatio,
      count: params.count,
    })
  },
})

export const videoGenerateTool = tool({
  description: videoGenerateToolDef.description,
  inputSchema: zodSchema(videoGenerateToolDef.parameters),
  execute: async (params, { toolCallId }) => {
    return executeMediaGenerate({
      kind: 'video',
      toolCallId,
      prompt: params.prompt,
      aspectRatio: params.aspectRatio,
      duration: params.duration,
    })
  },
})
