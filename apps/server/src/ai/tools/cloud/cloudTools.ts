/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Cloud v3 capability tool helpers + task / auth tools.
 *
 * Layout after the C-route refactor:
 *   - Shared helpers (upload, autosave, polling, token, error mapping) live
 *     here and are imported by the named cloud tools in `cloudNamedTools.ts`.
 *   - runV3GenerateAndSave: media pipeline (v3Generate + polling + autosave).
 *   - runV3TextGenerate:    text pipeline (v3TextGenerate, no polling).
 *   - cloudTaskTool / cloudTaskCancelTool / cloudLoginTool / cloudUserInfoTool:
 *     standalone thin wrappers around the SaaS SDK.
 *
 * The progressive-discovery tools (CloudCapBrowse / CloudCapDetail /
 * CloudModelGenerate / CloudTextGenerate) have been removed — the model is
 * expected to reach the capability surface exclusively through the named
 * tools (CloudImageGenerate, CloudImageEdit, CloudVideoGenerate, CloudTTS,
 * CloudSpeechRecognize, CloudImageUnderstand).
 */
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import { extractAttachmentTagPath, stripAttachmentTagWrapper } from '@openloaf/api/common'
import { SaaSHttpError } from '@openloaf-saas/sdk'
import {
  cloudLoginToolDef,
  cloudUserInfoToolDef,
  cloudTaskCancelToolDef,
  cloudTaskToolDef,
} from '@openloaf/api/types/tools/cloud'
import { getSaasClient } from '@/modules/saas/client'
import { expandPathTemplateVars } from '@/ai/tools/toolScope'
import {
  getBoardId,
  getProjectId,
  getSessionId,
} from '@/ai/shared/context/requestContext'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'
import {
  lookupBoardRecord,
  resolveBoardAssetDir,
  resolveBoardScopedRoot,
} from '@openloaf/api/common/boardPaths'
import { logger } from '@/common/logger'
import { addCreditsConsumed } from '@/ai/shared/context/requestContext'
import { createToolProgress, type ToolProgressEmitter } from '@/ai/tools/toolProgress'

// ---------------------------------------------------------------------------
// Task polling constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2_000
const POLL_MAX_DURATION_MS = 10 * 60 * 1000

/** Per-file download timeout — fail fast rather than hang the whole tool call. */
const DOWNLOAD_TIMEOUT_MS = 60_000

/**
 * Thrown by pollTaskUntilDone when POLL_MAX_DURATION_MS elapses without a
 * terminal status. Carries taskId so the caller can return a structured
 * response (mode: 'timeout', taskId) and let the AI continue via CloudTask.
 */
class PollTaskTimeoutError extends Error {
  readonly taskId: string
  constructor(taskId: string, durationMs: number) {
    super(`Task ${taskId} did not complete within ${durationMs / 1000}s`)
    this.name = 'PollTaskTimeoutError'
    this.taskId = taskId
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function requireToken(): Promise<string | { error: string }> {
  const { ensureServerAccessToken } = await import('@/modules/auth/tokenStore')
  const token = (await ensureServerAccessToken()) ?? ''
  if (!token) {
    return {
      error:
        'Cloud access token not available. User must sign in to the cloud platform before invoking cloud capabilities.',
    }
  }
  return token
}

/**
 * 失败结果统一结构：返回 JSON 字符串 `{ ok: false, ... }`，与 runV3TextGenerate
 * 的成功分支 `{ ok: true, ... }` 对称。这样：
 * - AI 模型能直接读到 `ok:false` + `error` + `httpStatus`，清楚知道失败而不是继续重试
 * - 测试 harness 的 detectToolError 能识别为 hasError=true（见 ChatProbeHarness 扩展）
 * - 过去的纯字符串 "Error: ..." 形态会被 AI SDK 当作普通 tool result，掩盖故障
 */
function errorString(label: string, err: unknown): string {
  if (err instanceof SaaSHttpError) {
    const payload = err.payload as
      | { message?: unknown; error?: unknown; code?: unknown }
      | string
      | null
      | undefined
    let detail: string | undefined
    let upstreamCode: string | undefined
    if (typeof payload === 'string') {
      detail = payload.trim() || undefined
    } else if (payload && typeof payload === 'object') {
      if (typeof payload.message === 'string' && payload.message.trim()) {
        detail = payload.message.trim()
      } else if (typeof payload.error === 'string' && payload.error.trim()) {
        detail = payload.error.trim()
      }
      if (typeof payload.code === 'string' && payload.code.trim()) {
        upstreamCode = payload.code.trim()
      }
    }
    const statusPart = `HTTP ${err.status}${err.statusText ? ` ${err.statusText}` : ''}`
    return JSON.stringify({
      ok: false,
      code: upstreamCode ?? `http_${err.status}`,
      httpStatus: err.status,
      error: `${label} — ${statusPart}${detail ? `: ${detail}` : ''}`,
      detail: detail ?? null,
      label,
    })
  }
  const message = err instanceof Error ? err.message : String(err)
  return JSON.stringify({
    ok: false,
    code: 'exception',
    error: `${label} — ${message}`,
    label,
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Auto-save helpers — download cloud result URLs into the chat/board asset dir
// ---------------------------------------------------------------------------

type SavedFile = {
  /** Template-var relative path for use by other tools (Read/Bash/etc.). */
  filePath: string
  /** Absolute path on disk (for diagnostics; the AI should use filePath). */
  absolutePath: string
  /** Local file name. */
  fileName: string
  /** Original cloud-hosted URL (kept as fallback if save failed). */
  sourceUrl: string
  /** Bytes on disk, or 0 if stat failed. */
  fileSize: number
}

type StorageTarget = {
  /** Directory to save files into. */
  saveDirPath: string
  /** 'board' when a board is bound, otherwise 'chat'. */
  destination: 'board' | 'chat'
  /** Session id for chat destination (used to build filePath template var). */
  sessionId?: string
  /** Board id for board destination (used to build filePath template var). */
  boardId?: string
  /** Project id resolved from context/board record. */
  projectId?: string
  /** Root path used to build relative paths for the board destination. */
  rootPath: string
}

/** Resolve where to save cloud output files — board asset dir if bound, else chat asset dir. */
async function resolveStorageTarget(): Promise<StorageTarget | null> {
  let projectId = getProjectId()
  const boardId = getBoardId()

  if (boardId) {
    if (!projectId) {
      const board = await lookupBoardRecord(boardId)
      if (board?.projectId) projectId = board.projectId
    }
    const boardRoot = resolveBoardScopedRoot(projectId)
    return {
      rootPath: boardRoot,
      saveDirPath: resolveBoardAssetDir(boardRoot, boardId),
      destination: 'board',
      boardId,
      projectId,
    }
  }

  const sessionId = getSessionId()
  if (!sessionId) return null
  const assetDir = await resolveSessionAssetDir(sessionId)
  return {
    rootPath: assetDir,
    saveDirPath: assetDir,
    destination: 'chat',
    sessionId,
    projectId,
  }
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
}

function extFromContentType(contentType?: string | null): string | null {
  if (!contentType) return null
  const primary = contentType.toLowerCase().split(';')[0]?.trim() ?? ''
  return EXT_BY_CONTENT_TYPE[primary] ?? null
}

function extFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').pop() ?? ''
    if (!last.includes('.')) return null
    const ext = last.split('.').pop()?.toLowerCase() ?? ''
    return /^[a-z0-9]{1,6}$/.test(ext) ? ext : null
  } catch {
    return null
  }
}

function sanitizeIdForFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64)
}

/**
 * Download one URL and write it to the storage target.
 * Returns null on failure (caller falls back to the raw URL).
 */
async function downloadOne(input: {
  url: string
  target: StorageTarget
  baseName: string
  slug: string
  index: number
}): Promise<SavedFile | null> {
  const { url, target, baseName, slug, index } = input
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    const contentType = response.headers.get('content-type')
    const ext = extFromContentType(contentType) ?? extFromUrl(url) ?? 'bin'
    const fileName = `${baseName}-${slug}-${index}.${ext}`
    const absolutePath = path.join(target.saveDirPath, fileName)
    const buffer = Buffer.from(await response.arrayBuffer())
    await fs.writeFile(absolutePath, buffer)
    const stat = await fs.stat(absolutePath).catch(() => null)

    const filePath =
      target.destination === 'chat'
        ? `\${CURRENT_CHAT_DIR}/${fileName}`
        : path.relative(target.rootPath, absolutePath).split(path.sep).join('/')

    return {
      filePath,
      absolutePath,
      fileName,
      sourceUrl: url,
      fileSize: stat?.size ?? 0,
    }
  } catch (err) {
    logger.warn(
      { url, err: err instanceof Error ? err.message : String(err) },
      '[cloud-tools] auto-save failed; returning original URL',
    )
    return null
  }
}

/**
 * Download every URL in `resultUrls` to the chat/board asset dir.
 * Silently degrades: if storage cannot be resolved (no session and no board),
 * or any individual download fails, returns a mix of saved + pending entries.
 */
async function autoSaveResultUrls(input: {
  resultUrls: string[]
  variantId: string
  progress: ToolProgressEmitter
}): Promise<{ files: SavedFile[]; pending: string[]; target: StorageTarget | null }> {
  const { resultUrls, variantId, progress } = input
  if (!Array.isArray(resultUrls) || resultUrls.length === 0) {
    return { files: [], pending: [], target: null }
  }

  const target = await resolveStorageTarget()
  if (!target) {
    progress.delta('no session/board context — skipping auto-save\n')
    return { files: [], pending: [...resultUrls], target: null }
  }

  await fs.mkdir(target.saveDirPath, { recursive: true })

  progress.delta(`saving ${resultUrls.length} file(s) to ${target.destination} asset dir\n`)
  const baseName = `saas-${sanitizeIdForFilename(variantId)}`
  const slug = randomUUID().replace(/-/g, '').slice(0, 8)

  const results = await Promise.all(
    resultUrls.map((url, i) =>
      downloadOne({ url, target, baseName, slug, index: i + 1 }),
    ),
  )

  const saved: SavedFile[] = []
  const pending: string[] = []
  results.forEach((file, i) => {
    if (file) saved.push(file)
    else pending.push(resultUrls[i]!)
  })

  if (saved.length > 0) {
    progress.delta(`saved ${saved.length}/${resultUrls.length}\n`)
  }
  return { files: saved, pending, target }
}

// ---------------------------------------------------------------------------
// Input normalization — local file paths → uploaded CDN URLs
// ---------------------------------------------------------------------------

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  weba: 'audio/webm',
}

function contentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, '')
  return EXT_TO_CONTENT_TYPE[ext] ?? 'application/octet-stream'
}

/** True when the string *looks* like a filesystem path (and should be probed on disk). */
function looksLikeLocalPath(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  if (/^(https?:|data:|blob:)/i.test(s)) return false
  if (extractAttachmentTagPath(s) !== null) return true
  if (s.startsWith('${')) return true
  if (s.startsWith('/') || s.startsWith('~')) return true
  if (/^[A-Za-z]:[\\/]/.test(s)) return true
  return false
}

/** Strip attachment-tag wrapper then expand template vars like ${CURRENT_CHAT_DIR}. */
function unwrapAndExpand(raw: string): string {
  const s = stripAttachmentTagWrapper(raw)
  return expandPathTemplateVars(s)
}

/**
 * Upload a single local file to the SaaS CDN and return its URL.
 * Throws if the file does not exist, is not a regular file, or the upload fails.
 */
async function uploadLocalFileToCdn(args: {
  // biome-ignore lint/suspicious/noExplicitAny: SaaSClient type is internal to SDK
  client: any
  rawValue: string
  inputKey: string
  progress: ToolProgressEmitter
}): Promise<string> {
  const { client, rawValue, inputKey, progress } = args
  const absPath = path.resolve(unwrapAndExpand(rawValue))

  let stat: Awaited<ReturnType<typeof fs.stat>>
  try {
    stat = await fs.stat(absPath)
  } catch {
    throw new Error(
      `inputs.${inputKey}: file not found — ${rawValue} (resolved: ${absPath})`,
    )
  }
  if (!stat.isFile()) {
    throw new Error(`inputs.${inputKey}: not a regular file — ${absPath}`)
  }

  const fileName = path.basename(absPath)
  progress.delta(`uploading ${inputKey}: ${fileName} (${stat.size} bytes)\n`)

  const buffer = await fs.readFile(absPath)
  const contentType = contentTypeFromPath(absPath)
  const blob = new Blob([new Uint8Array(buffer)], { type: contentType })
  const res = await client.ai.uploadFile(blob, fileName, { expireHours: 24 })
  if (!res || typeof res.url !== 'string' || !res.url) {
    throw new Error(`inputs.${inputKey}: SaaS uploadFile returned no URL`)
  }
  return res.url
}

/**
 * Resolve a `{ url: "local/path" }` or `{ path: "local/path" }` media object
 * by uploading the local file to CDN. Returns null if the value is not a
 * resolvable media object.
 */
async function resolveMediaObject(
  value: unknown,
  parentKey: string,
  index: number | null,
  // biome-ignore lint/suspicious/noExplicitAny: SaaSClient type is internal to SDK
  client: any,
  progress: ToolProgressEmitter,
): Promise<Record<string, unknown> | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>
  const suffix = index !== null ? `[${index}]` : ''

  if (typeof obj.url === 'string' && looksLikeLocalPath(obj.url)) {
    const uploaded = await uploadLocalFileToCdn({
      client,
      rawValue: obj.url,
      inputKey: `${parentKey}${suffix}.url`,
      progress,
    })
    return { ...obj, url: uploaded }
  }

  if (typeof obj.path === 'string' && looksLikeLocalPath(obj.path)) {
    const uploaded = await uploadLocalFileToCdn({
      client,
      rawValue: obj.path,
      inputKey: `${parentKey}${suffix}.path`,
      progress,
    })
    return { url: uploaded }
  }

  return null
}

/**
 * Walk top-level entries of `inputs`, replacing any local-file-path string
 * (or array of such strings) with an uploaded CDN URL. Returns a shallow copy
 * — the caller's object is not mutated.
 */
async function normalizeCloudInputs(args: {
  inputs: Record<string, unknown> | undefined
  // biome-ignore lint/suspicious/noExplicitAny: SaaSClient type is internal to SDK
  client: any
  progress: ToolProgressEmitter
}): Promise<Record<string, unknown> | undefined> {
  const { inputs, client, progress } = args
  if (!inputs || typeof inputs !== 'object') return inputs

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === 'string') {
      out[key] = looksLikeLocalPath(value)
        ? await uploadLocalFileToCdn({ client, rawValue: value, inputKey: key, progress })
        : value
      continue
    }
    if (Array.isArray(value)) {
      out[key] = await Promise.all(
        value.map(async (item, idx) => {
          if (typeof item === 'string' && looksLikeLocalPath(item)) {
            return uploadLocalFileToCdn({
              client,
              rawValue: item,
              inputKey: `${key}[${idx}]`,
              progress,
            })
          }
          const resolved = await resolveMediaObject(item, key, idx, client, progress)
          return resolved ?? item
        }),
      )
      continue
    }
    if (value && typeof value === 'object') {
      const resolved = await resolveMediaObject(value, key, null, client, progress)
      if (resolved) {
        out[key] = resolved
        continue
      }
    }
    out[key] = value
  }
  return out
}

// biome-ignore lint/suspicious/noExplicitAny: SaaSClient type is internal to SDK
async function pollTaskUntilDone(client: any, taskId: string, progress: ToolProgressEmitter) {
  const deadline = Date.now() + POLL_MAX_DURATION_MS
  let lastStatus = ''
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    const res = await client.ai.v3Task(taskId)
    const data = res.data
    if (data.status !== lastStatus) {
      progress.delta(`status: ${data.status}\n`)
      lastStatus = data.status
    }
    if (data.status === 'succeeded' || data.status === 'failed' || data.status === 'canceled') {
      if (data.status === 'failed' && data.error) {
        throw new Error(data.error.message || 'Task failed')
      }
      return data
    }
  }
  // 超时不能抛普通 Error — 会丢掉 taskId，AI 无法继续 CloudTask 轮询/CloudTaskCancel。
  // 抛 PollTaskTimeoutError 让上层识别并返回结构化 { mode: 'timeout', taskId, ... }。
  throw new PollTaskTimeoutError(taskId, POLL_MAX_DURATION_MS)
}

// ---------------------------------------------------------------------------
// Shared generate-and-save pipeline (media)
// ---------------------------------------------------------------------------

export async function runV3GenerateAndSave(args: {
  feature: string
  variant: string
  inputs?: Record<string, unknown>
  params?: Record<string, unknown>
  waitForCompletion?: boolean
  progress: ToolProgressEmitter
  /** Tool name shown in error messages (defaults to the feature id). */
  toolName?: string
}): Promise<string> {
  const {
    feature,
    variant,
    inputs,
    params,
    waitForCompletion = true,
    progress,
    toolName = 'CloudGenerate',
  } = args
  const token = await requireToken()
  if (typeof token !== 'string') {
    progress.error(token.error)
    return JSON.stringify({ ok: false, code: 'token_missing', error: token.error })
  }

  progress.start(`${feature} / ${variant}`)
  try {
    const client = getSaasClient(token)
    const normalizedInputs = await normalizeCloudInputs({ inputs, client, progress })
    const createRes = await client.ai.v3Generate({
      feature,
      variant,
      inputs: normalizedInputs,
      params,
    })

    if ('groupId' in createRes.data) {
      const { groupId, taskIds } = createRes.data
      progress.done(`group ${groupId} with ${taskIds.length} task(s)`)
      return JSON.stringify({
        ok: true,
        mode: 'group',
        groupId,
        taskIds,
        hint: 'Batch submitted. Poll individual tasks with CloudTask(taskId).',
      })
    }

    const taskId = createRes.data.taskId
    progress.delta(`task ${taskId} submitted\n`)

    if (!waitForCompletion) {
      progress.done(`task ${taskId} queued (async)`)
      return JSON.stringify({
        ok: true,
        mode: 'async',
        taskId,
        hint: 'Use CloudTask(taskId) to poll status and retrieve resultUrls.',
      })
    }

    const result = await pollTaskUntilDone(client, taskId, progress)

    const urls = Array.isArray(result.resultUrls) ? result.resultUrls : []
    const { files, pending, target } = await autoSaveResultUrls({
      resultUrls: urls,
      variantId: variant,
      progress,
    })

    if (typeof result.creditsConsumed === 'number' && result.creditsConsumed > 0) {
      addCreditsConsumed(result.creditsConsumed)
    }
    progress.done(`done (${result.creditsConsumed ?? 0} credits)`)
    return JSON.stringify({
      ok: true,
      mode: 'sync',
      feature,
      variant,
      taskId,
      status: result.status,
      files,
      pendingUrls: pending,
      resultText: result.resultText,
      creditsConsumed: result.creditsConsumed,
      destination: target?.destination,
      sessionId: target?.sessionId,
      boardId: target?.boardId,
      projectId: target?.projectId,
      hint:
        files.length > 0
          ? 'Files already saved and the chat UI will auto-preview them — DO NOT call Read on these files just to describe or show them to the user. Only Read them if you need to edit, transform, or run a separate analysis. Reply with one short confirmation line and stop.'
          : pending.length > 0
            ? 'Auto-save failed. The raw cloud URLs are in `pendingUrls` but they may expire — present them to the user quickly or retry. DO NOT Read the URLs.'
            : 'Task completed without result URLs.',
    })
  } catch (err) {
    if (err instanceof PollTaskTimeoutError) {
      progress.done(`timeout — task ${err.taskId} still running`)
      return JSON.stringify({
        ok: true,
        mode: 'timeout',
        feature,
        variant,
        taskId: err.taskId,
        hint:
          'Polling timed out after 10 minutes but the task is still running on the cloud backend. Use CloudTask({ taskId }) to check status later, or CloudTaskCancel({ taskId }) to abort. Credits are consumed only when the task finishes.',
      })
    }
    const message = err instanceof Error ? err.message : String(err)
    progress.error(message)
    return errorString(`${toolName}(${feature}/${variant})`, err)
  }
}

// ---------------------------------------------------------------------------
// Shared text-generate pipeline (sync, no polling)
// ---------------------------------------------------------------------------
//
// Used by named tools that return text directly (CloudImageUnderstand,
// CloudSpeechRecognize). Mirrors runV3GenerateAndSave's signature minus the
// waitForCompletion / autosave knobs.

export async function runV3TextGenerate(args: {
  feature: string
  variant: string
  inputs?: Record<string, unknown>
  params?: Record<string, unknown>
  progress: ToolProgressEmitter
  /** Tool name shown in error messages (defaults to the feature id). */
  toolName?: string
  /**
   * 'streaming' 走 SSE API 并实时 progress.delta 推给 UI，'sync' 走 JSON API。
   * 未传时默认 'sync' —— 历史行为。
   */
  executionMode?: 'streaming' | 'sync' | 'task'
}): Promise<string> {
  const {
    feature, variant, inputs, params, progress,
    toolName = 'CloudTextTool', executionMode = 'sync',
  } = args
  const token = await requireToken()
  if (typeof token !== 'string') {
    progress.error(token.error)
    return JSON.stringify({ ok: false, code: 'token_missing', error: token.error })
  }

  progress.start(`${feature} / ${variant}`)
  try {
    const client = getSaasClient(token)
    const normalizedInputs = await normalizeCloudInputs({ inputs, client, progress })

    if (executionMode === 'streaming') {
      const res = await client.ai.v3TextGenerateStream({
        feature,
        variant,
        inputs: normalizedInputs,
        params,
      })
      const { text, taskId, credits } = await consumeTextGenerateSSE(res, progress)
      if (credits > 0) addCreditsConsumed(credits)
      progress.done(`done (${credits} credits)`)
      return JSON.stringify({
        ok: true,
        feature,
        variant,
        text,
        taskId,
        creditsConsumed: credits,
      })
    }

    const res = await client.ai.v3TextGenerate({
      feature,
      variant,
      inputs: normalizedInputs,
      params,
    })
    const text = res.data.text ?? ''
    const credits = res.data.creditsConsumed ?? 0
    if (credits > 0) {
      addCreditsConsumed(credits)
    }
    progress.done(`done (${credits} credits)`)
    return JSON.stringify({
      ok: true,
      feature,
      variant,
      text,
      taskId: res.data.taskId,
      creditsConsumed: credits,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    progress.error(message)
    return errorString(`${toolName}(${feature}/${variant})`, err)
  }
}

/**
 * 消费 SaaS `/api/ai/v3/text/generate` 的 SSE 响应。
 *
 * 协议（AI SDK v3 风格事件）：
 *   data: {"type":"start","messageId":"msg_xxx"}
 *   data: {"type":"start-step"}
 *   data: {"type":"text-start","id":"t_xxx"}
 *   data: {"type":"text-delta","id":"t_xxx","delta":"...文字片段..."}
 *   ...（若干 text-delta）
 *   data: {"type":"text-end","id":"t_xxx"}
 *   data: {"type":"finish-step"}
 *   data: {"type":"finish","usage":{"creditsConsumed":123}}
 *   data: [DONE]
 *
 * 每拿到一个 text-delta 就 `progress.delta()` 实时推给 UI（UI 会流式渲染，
 * 让用户看到 cloud 工具"边执行边说话"），最终返回聚合 text 供 LLM 消费。
 */
async function consumeTextGenerateSSE(
  res: Response,
  progress: ToolProgressEmitter,
): Promise<{ text: string; taskId?: string; credits: number }> {
  if (!res.body) {
    throw new Error('SSE response has no body')
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let taskId: string | undefined
  let credits = 0

  // SSE 事件以空行分隔。按 \n\n 切，末段回填 buffer。
  const flushChunk = (chunk: string) => {
    const frames = chunk.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      // 单个 event 可能有多行 data:，AI SDK 场景里通常只有一行，但兼容起见
      // 按行取出 `data: <payload>`，忽略注释 / event 类型头等。
      for (const line of frame.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (!raw || raw === '[DONE]') continue
        let ev: Record<string, unknown>
        try { ev = JSON.parse(raw) as Record<string, unknown> }
        catch { continue }
        const type = typeof ev.type === 'string' ? ev.type : ''
        if (type === 'text-delta' && typeof ev.delta === 'string') {
          text += ev.delta
          progress.delta(ev.delta)
        } else if (type === 'start' && typeof ev.messageId === 'string') {
          taskId = ev.messageId
        } else if (type === 'finish' || type === 'finish-step') {
          const usage = ev.usage as { creditsConsumed?: number } | undefined
          if (usage && typeof usage.creditsConsumed === 'number') {
            credits = usage.creditsConsumed
          }
        } else if (type === 'error') {
          const msg = typeof ev.error === 'string' ? ev.error : JSON.stringify(ev.error ?? ev)
          throw new Error(`SSE error event: ${msg}`)
        }
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    flushChunk(buffer)
  }
  // 处理最后一块（stream 结束后 decoder flush）
  buffer += decoder.decode()
  if (buffer) flushChunk(buffer + '\n\n')

  return { text, taskId, credits }
}

// ---------------------------------------------------------------------------
// CloudTask
// ---------------------------------------------------------------------------

export const cloudTaskTool = tool({
  description: cloudTaskToolDef.description,
  inputSchema: zodSchema(cloudTaskToolDef.parameters),
  // 逻辑：只读状态查询（v3Task），无 credits 消耗，白名单自动放行。
  // 注意：成功查到 succeeded 时会自动下载 resultUrls 到 asset dir——属于本地文件系统
  // 写入，但目标是受控的 chat/board asset dir（已有沙箱），不涉及 credits 所以保持免审批。
  needsApproval: false,
  execute: async (input, { toolCallId }): Promise<string> => {
    const { taskId } = input as { taskId: string }
    const progress = createToolProgress(toolCallId, 'CloudTask')
    const token = await requireToken()
    if (typeof token !== 'string') {
      progress.error(token.error)
      return JSON.stringify({ ok: false, code: 'token_missing', error: token.error })
    }

    progress.start(`query ${taskId}`)
    try {
      const client = getSaasClient(token)
      const res = await client.ai.v3Task(taskId)
      const data = res.data

      // When the task has just reached a successful terminal state, auto-save
      // any result URLs the same way the generator tools do.
      if (data.status === 'succeeded' && Array.isArray(data.resultUrls) && data.resultUrls.length > 0) {
        const { files, pending, target } = await autoSaveResultUrls({
          resultUrls: data.resultUrls,
          variantId: taskId,
          progress,
        })
        if (typeof data.creditsConsumed === 'number' && data.creditsConsumed > 0) {
          addCreditsConsumed(data.creditsConsumed)
        }
        progress.done(`succeeded (${data.creditsConsumed ?? 0} credits)`)
        return JSON.stringify({
          ok: true,
          taskId,
          status: data.status,
          files,
          pendingUrls: pending,
          resultText: data.resultText,
          creditsConsumed: data.creditsConsumed,
          destination: target?.destination,
          sessionId: target?.sessionId,
          boardId: target?.boardId,
          projectId: target?.projectId,
          hint:
            files.length > 0
              ? 'Files saved. The chat UI auto-previews them — do NOT Read them just to show the user. Reply with one short confirmation line.'
              : 'Auto-save failed or not applicable — see pendingUrls.',
        })
      }

      progress.done(`status ${data.status}`)
      return JSON.stringify({ ok: true, data })
    } catch (err) {
      progress.error(err instanceof Error ? err.message : String(err))
      return errorString(`CloudTask(${taskId})`, err)
    }
  },
})

// ---------------------------------------------------------------------------
// CloudUserInfo
// ---------------------------------------------------------------------------

export const cloudUserInfoTool = tool({
  description: cloudUserInfoToolDef.description,
  inputSchema: zodSchema(cloudUserInfoToolDef.parameters),
  // 逻辑：只读查询 user.self，不扣 credits，白名单自动放行。
  needsApproval: false,
  execute: async (_input, { toolCallId }): Promise<string> => {
    const progress = createToolProgress(toolCallId, 'CloudUserInfo')
    const token = await requireToken()
    if (typeof token !== 'string') {
      progress.error(token.error)
      return JSON.stringify({
        ok: false,
        code: 'not_signed_in',
        error: token.error,
        hint: 'Call CloudLogin to prompt the user to sign in, then retry.',
      })
    }

    progress.start('fetching profile')
    try {
      const client = getSaasClient(token)
      const res = await client.user.self()
      const u = res.user
      progress.done(`${u.membershipLevel} · ${u.creditsBalance} credits`)
      return JSON.stringify({
        ok: true,
        user: {
          id: u.id,
          email: u.email ?? null,
          name: u.name ?? null,
          avatarUrl: u.avatarUrl ?? null,
          provider: u.provider,
          membershipLevel: u.membershipLevel,
          creditsBalance: u.creditsBalance,
          isAdmin: u.isAdmin,
          isInternal: u.isInternal ?? false,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        },
      })
    } catch (err) {
      progress.error(err instanceof Error ? err.message : String(err))
      return errorString('CloudUserInfo failed', err)
    }
  },
})

// ---------------------------------------------------------------------------
// CloudLogin
// ---------------------------------------------------------------------------

export const cloudLoginTool = tool({
  description: cloudLoginToolDef.description,
  inputSchema: zodSchema(cloudLoginToolDef.parameters),
  // 逻辑：只是触发前端弹出登录对话框，不改服务端状态，免审批。
  needsApproval: false,
  execute: async (_input, { toolCallId }): Promise<string> => {
    const progress = createToolProgress(toolCallId, 'CloudLogin')
    const { ensureServerAccessToken } = await import('@/modules/auth/tokenStore')
    const token = (await ensureServerAccessToken()) ?? ''

    if (token) {
      progress.start('verifying existing session')
      try {
        const client = getSaasClient(token)
        const res = await client.user.self()
        const u = res.user
        progress.done('already signed in')
        return JSON.stringify({
          ok: true,
          action: 'none',
          alreadyLoggedIn: true,
          user: {
            id: u.id,
            email: u.email ?? null,
            name: u.name ?? null,
            provider: u.provider,
            membershipLevel: u.membershipLevel,
            creditsBalance: u.creditsBalance,
          },
          hint: 'User is already signed in. No dialog opened.',
        })
      } catch (err) {
        logger.debug(
          { err: err instanceof Error ? err.message : String(err) },
          '[cloud-login] existing token rejected, prompting re-login',
        )
      }
    }

    progress.done('prompting user to sign in')
    return JSON.stringify({
      ok: true,
      action: 'open-login-dialog',
      alreadyLoggedIn: false,
      hint: 'The web UI will render a Sign-in card. After the user completes sign-in, retry the tool that needed authentication.',
    })
  },
})

// ---------------------------------------------------------------------------
// CloudTaskCancel
// ---------------------------------------------------------------------------

export const cloudTaskCancelTool = tool({
  description: cloudTaskCancelToolDef.description,
  inputSchema: zodSchema(cloudTaskCancelToolDef.parameters),
  // 逻辑：虽然不扣 credits，但取消一个正在跑的任务会丢失已花费的 credits（任务失败时
  // 云端不退费），且 LLM 幻觉式取消会破坏用户预期——保守走审批。
  needsApproval: true,
  execute: async (input, { toolCallId }): Promise<string> => {
    const { taskId } = input as { taskId: string }
    const progress = createToolProgress(toolCallId, 'CloudTaskCancel')
    const token = await requireToken()
    if (typeof token !== 'string') {
      progress.error(token.error)
      return JSON.stringify({ ok: false, code: 'token_missing', error: token.error })
    }

    progress.start(`cancel ${taskId}`)
    try {
      const client = getSaasClient(token)
      const res = await client.ai.v3CancelTask(taskId)
      progress.done('cancel requested')
      return JSON.stringify({ ok: true, message: res.message ?? 'cancel requested' })
    } catch (err) {
      progress.error(err instanceof Error ? err.message : String(err))
      return errorString(`CloudTaskCancel(${taskId})`, err)
    }
  },
})
