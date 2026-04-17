/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Cloud v3 capability tools — progressive discovery model.
 *
 * Six thin tools that delegate to @openloaf-saas/sdk:
 *   CloudCapBrowse    → ai.capabilitiesOverview
 *   CloudCapDetail    → ai.capabilitiesDetail
 *   CloudModelGenerate → ai.v3Generate (+ internal v3Task polling when sync)
 *   CloudTextGenerate → ai.v3TextGenerate
 *   CloudTask         → ai.v3Task
 *   CloudTaskCancel       → ai.v3CancelTask
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
  cloudCapBrowseToolDef,
  cloudCapDetailToolDef,
  cloudModelGenerateToolDef,
  cloudTaskToolDef,
  cloudTextGenerateToolDef,
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
import {
  getCachedVariantDetail,
  hasTierAccess,
  resolveEffectiveTier,
  type CloudMembershipTier,
} from '@/ai/builtin-skills/cloud-skills'

// ---------------------------------------------------------------------------
// Task polling constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2_000
const POLL_MAX_DURATION_MS = 10 * 60 * 1000
const TOP_VARIANTS_PER_FEATURE = 3

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

/**
 * Features hidden from LLM discovery.
 *
 * `translate` is excluded because the main chat model already handles
 * translation at zero marginal credit cost — exposing the cloud variant would
 * tempt the LLM to burn credits on operations the base model does for free.
 * Matched as a case-insensitive substring on the feature id.
 */
const HIDDEN_FEATURE_PATTERNS = ['translate'] as const

function isHiddenFeature(featureId: string): boolean {
  const lowered = featureId.toLowerCase()
  return HIDDEN_FEATURE_PATTERNS.some((pattern) => lowered.includes(pattern))
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

function errorString(label: string, err: unknown): string {
  if (err instanceof SaaSHttpError) {
    const payload = err.payload as
      | { message?: unknown; error?: unknown }
      | string
      | null
      | undefined
    let detail: string | undefined
    if (typeof payload === 'string') {
      detail = payload.trim() || undefined
    } else if (payload && typeof payload === 'object') {
      if (typeof payload.message === 'string' && payload.message.trim()) {
        detail = payload.message.trim()
      } else if (typeof payload.error === 'string' && payload.error.trim()) {
        detail = payload.error.trim()
      }
    }
    const statusPart = `HTTP ${err.status}${err.statusText ? ` ${err.statusText}` : ''}`
    return `Error: ${label} — ${statusPart}${detail ? `: ${detail}` : ''}`
  }
  const message = err instanceof Error ? err.message : String(err)
  return `Error: ${label} — ${message}`
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
 *
 * Notes on fail-fast behavior:
 * - `AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)` guarantees that a hanging cloud
 *   CDN never blocks the whole tool call. Without it, a stuck fetch would sit
 *   forever (Node's default fetch has no built-in timeout).
 * - A unique `slug` per file (random 6 hex + index) guarantees filenames stay
 *   collision-free across concurrent tool calls in the same millisecond.
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
 *
 * Concurrency: all URLs download in parallel via Promise.all — typical N is
 * 1-4, occasionally up to 10 for batch mode. Per-file timeout + short typical
 * size means no CDN hammering concerns.
 *
 * Filename collision protection: each call generates a unique 6-hex slug from
 * randomUUID; combined with the per-file index, filenames are unique across
 * concurrent CloudModelGenerate invocations even within the same millisecond.
 *
 * Returns:
 *   - files: successfully saved files (may be empty if all failed)
 *   - pending: URLs that could not be saved (fall back to raw URL in the AI response)
 *   - target: the storage target used (may be null if nothing could be saved)
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

  // Ensure target dir exists once, not per file.
  await fs.mkdir(target.saveDirPath, { recursive: true })

  progress.delta(`saving ${resultUrls.length} file(s) to ${target.destination} asset dir\n`)
  const baseName = `saas-${sanitizeIdForFilename(variantId)}`
  // Unique per-call slug; combined with the index it gives collision-free filenames
  // across concurrent tool calls within the same millisecond.
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
//
// SaaS v3 endpoints (v3TextGenerate / v3Generate) expect `inputs.image`,
// `inputs.video`, `inputs.audio` to be publicly reachable URLs. The LLM however
// tends to pass local paths like `${CURRENT_CHAT_DIR}/foo.jpg` or
// `@[/Users/.../foo.jpg]` — whatever it saw in the user message or asset dir.
// Without this normalization those strings reach the SaaS backend verbatim and
// come back as `HTTP 400 Bad Request`, which is exactly how this bug was
// observed in chat_20260401_105341_gdes0ya1.
//
// Strategy: before the paid API call, walk inputs' top-level string / string[]
// values, detect anything that looks like a local path, expand template vars,
// read the file from disk, and upload it via `client.ai.uploadFile` (24h
// expiry — long enough to outlive any sync or async task). Replace the value
// with the returned CDN url and forward the normalized inputs downstream.
//
// Values that are already `http(s)://` / `data:` URLs or non-path strings like
// `prompt` are passed through unchanged.

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
  // Windows drive letter, e.g. C:\foo
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
 * by uploading the local file to CDN. Matches the format produced by the
 * canvas `toMediaInput()` in `serialize.ts`. Returns null if the value is not
 * a resolvable media object.
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

  // { url: "local/path" } — upload and replace url field
  if (typeof obj.url === 'string' && looksLikeLocalPath(obj.url)) {
    const uploaded = await uploadLocalFileToCdn({
      client,
      rawValue: obj.url,
      inputKey: `${parentKey}${suffix}.url`,
      progress,
    })
    return { ...obj, url: uploaded }
  }

  // { path: "local/path" } — upload and convert to { url } format (SaaS only accepts URLs)
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
          // Handle { url: "local/path" } or { path: "local/path" } inside arrays
          // (canvas multi-slot produces [{ url }, { url }])
          const resolved = await resolveMediaObject(item, key, idx, client, progress)
          return resolved ?? item
        }),
      )
      continue
    }
    // Handle { url: "local/path" } or { path: "local/path" } objects
    // (canvas toMediaInput() produces this format for media slots)
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
  // 逻辑：超时不能抛普通 Error — 会丢掉 taskId，AI 无法继续 CloudTask 轮询/CloudTaskCancel。
  // 抛 PollTaskTimeoutError 让 CloudModelGenerate.execute 的 catch 识别并返回结构化
  // { mode: 'timeout', taskId, ... }，credits 不会白白锁死。
  throw new PollTaskTimeoutError(taskId, POLL_MAX_DURATION_MS)
}

// ---------------------------------------------------------------------------
// CloudCapBrowse
// ---------------------------------------------------------------------------

export const cloudCapBrowseTool = tool({
  description: cloudCapBrowseToolDef.description,
  inputSchema: zodSchema(cloudCapBrowseToolDef.parameters),
  // 逻辑：只读公开接口，无 token、无 credits，白名单自动放行。
  needsApproval: false,
  execute: async (input, { toolCallId }): Promise<string> => {
    const { category } = (input ?? {}) as { category?: 'image' | 'video' | 'audio' | 'text' | 'tools' }
    const progress = createToolProgress(toolCallId, 'CloudCapBrowse')
    progress.start(category ? `browse ${category}` : 'browse all')

    try {
      // 逻辑：overview 本身是公开接口 (无 token)；user.self 需要 token 但失败时不致命，
      // 降级为 userTier=null 让 AI 至少拿到 capability 列表。
      const unauthenticatedClient = getSaasClient()
      const overview = await unauthenticatedClient.ai.capabilitiesOverview(category)

      // Fetch current user's membership info if a token is available.
      let userTier: CloudMembershipTier | null = null
      let userCredits: number | null = null
      const { ensureServerAccessToken } = await import('@/modules/auth/tokenStore')
      const token = (await ensureServerAccessToken()) ?? ''
      if (token) {
        try {
          const authedClient = getSaasClient(token)
          const self = await authedClient.user.self()
          userTier = resolveEffectiveTier(self.user)
          userCredits = self.user.creditsBalance
        } catch (err) {
          logger.debug(
            { err: err instanceof Error ? err.message : String(err) },
            '[cloud-browse] user.self failed, continuing without tier info',
          )
        }
      }

      const features = overview.data
        .filter(
          (feature: { feature: string }) => !isHiddenFeature(feature.feature),
        )
        .map((feature: {
          feature: string
          description: string
          category: string
          variants: Array<{ id: string; name: string; description: string }>
        }) => ({
          feature: feature.feature,
          category: feature.category,
          description: feature.description,
          totalVariants: feature.variants.length,
          // 逻辑：每个 top variant 从 cloud-skills 的 detail 缓存里补上 tier/credits 与
          // 当前用户的可访问性。缓存未命中（首次刷新完成前）则 tier=null。
          topVariants: feature.variants.slice(0, TOP_VARIANTS_PER_FEATURE).map((v) => {
            const cached = getCachedVariantDetail(v.id)
            const tier = cached?.minMembershipLevel ?? null
            const credits = cached?.creditsPerCall ?? null
            const accessible =
              tier === null || userTier === null ? null : hasTierAccess(userTier, tier)
            return {
              id: v.id,
              name: v.name,
              tag: v.description,
              tier,
              credits,
              accessible,
            }
          }),
        }))

      progress.done(`found ${features.length} feature(s)`)
      return JSON.stringify({
        ok: true,
        filter: category ?? 'all',
        userTier,
        userCredits,
        features,
        hint: buildBrowseHint(userTier, userCredits),
      })
    } catch (err) {
      progress.error(err instanceof Error ? err.message : String(err))
      return errorString('CloudCapBrowse failed', err)
    }
  },
})

function buildBrowseHint(
  userTier: CloudMembershipTier | null,
  userCredits: number | null,
): string {
  const parts: string[] = []
  if (userTier && userCredits !== null) {
    parts.push(
      `User tier: ${userTier}, credits balance: ${userCredits}. Only pick a variant where accessible === true (or accessible === null before tier info loads).`,
    )
  } else if (!userTier) {
    parts.push(
      'User not signed in — accessibility cannot be checked. Ask the user to sign in before invoking CloudModelGenerate.',
    )
  }
  parts.push(
    'Pick a variant from topVariants by tag/name. For full param schema call CloudCapDetail({variantId, featureId}) — always pass the feature id alongside the variant id since some variants (e.g. OL-TX-006) are shared across multiple features with different input schemas. Otherwise call CloudModelGenerate / CloudTextGenerate directly.',
  )
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// CloudCapDetail
// ---------------------------------------------------------------------------

export const cloudCapDetailTool = tool({
  description: cloudCapDetailToolDef.description,
  inputSchema: zodSchema(cloudCapDetailToolDef.parameters),
  // 逻辑：只读公开接口，无 token、无 credits，白名单自动放行。
  needsApproval: false,
  execute: async (input, { toolCallId }): Promise<string> => {
    const { variantId, featureId } = input as { variantId: string; featureId?: string }
    const progress = createToolProgress(toolCallId, 'CloudCapDetail')
    progress.start(featureId ? `detail ${variantId} (${featureId})` : `detail ${variantId}`)

    // 逻辑：绕过 SDK 直接 fetch，让我们可以把 ?feature=<id> 传给 SaaS server。
    // 同一 variantId (例如 OL-TX-006) 会挂在多个 feature 下 (imageCaption /
    // translate / chat)，每个 feature 的 inputSlots 不同；不带 featureId 时
    // server 会返回 400 ambiguous 带 mountedFeatures 列表，模型可据此重试。
    // SDK 发布新版后可换回 client.ai.capabilitiesDetail(variantId, featureId)。
    try {
      const { getSaasBaseUrl } = await import('@/modules/saas/core/config')
      const query = featureId ? `?feature=${encodeURIComponent(featureId)}` : ''
      const url = `${getSaasBaseUrl()}/api/ai/v3/capabilities/detail/${encodeURIComponent(variantId)}${query}`
      const resp = await fetch(url)
      const payload = (await resp.json().catch(() => null)) as
        | { success?: boolean; data?: unknown; message?: string }
        | null
      if (!resp.ok || !payload?.success) {
        const detail = payload?.message ?? `HTTP ${resp.status} ${resp.statusText}`
        progress.error(detail)
        return `Error: CloudCapDetail(${variantId}${featureId ? `, ${featureId}` : ''}) — ${detail}`
      }
      progress.done('schema fetched')
      return JSON.stringify({ ok: true, data: payload.data })
    } catch (err) {
      progress.error(err instanceof Error ? err.message : String(err))
      return errorString(`CloudCapDetail(${variantId})`, err)
    }
  },
})

// ---------------------------------------------------------------------------
// Shared generate-and-save pipeline
// ---------------------------------------------------------------------------
//
// 抽出 CloudModelGenerate 的核心流程（normalizeInputs → v3Generate → poll →
// autoSave），供 CloudModelGenerate 自身以及命名工具 (cloudImageGenerate /
// cloudVideoGenerate / cloudTTS …) 复用。返回与 CloudModelGenerate 一致的
// JSON 字符串，命名工具可以原样透传给 LLM 或再 wrap。

export async function runV3GenerateAndSave(args: {
  feature: string
  variant: string
  inputs?: Record<string, unknown>
  params?: Record<string, unknown>
  waitForCompletion?: boolean
  progress: ToolProgressEmitter
  /** Tool name shown in error messages (defaults to 'CloudModelGenerate'). */
  toolName?: string
}): Promise<string> {
  const {
    feature,
    variant,
    inputs,
    params,
    waitForCompletion = true,
    progress,
    toolName = 'CloudModelGenerate',
  } = args
  const token = await requireToken()
  if (typeof token !== 'string') {
    progress.error(token.error)
    return `Error: ${token.error}`
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
          ? 'Files saved to the chat asset directory — use `files[].filePath` (${CURRENT_CHAT_DIR}/…) when referencing them from other tools.'
          : pending.length > 0
            ? 'Auto-save failed. The raw cloud URLs are in `pendingUrls` but they may expire — present them to the user quickly or retry.'
            : 'Task completed without result URLs.',
    })
  } catch (err) {
    // 保留 taskId 让 AI 继续 CloudTask/CloudTaskCancel，不要把付费任务丢给
    // 一个只有错误字符串的上层 — 这会直接丢失 credits。
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
// CloudModelGenerate
// ---------------------------------------------------------------------------

export const cloudModelGenerateTool = tool({
  description: cloudModelGenerateToolDef.description,
  inputSchema: zodSchema(cloudModelGenerateToolDef.parameters),
  // 逻辑：每次调用都扣用户 credits（video 类单次可达数百），必须审批。
  // LLM 幻觉或 prompt 注入触发此工具会直接造成经济损失。
  needsApproval: true,
  execute: async (input, { toolCallId }): Promise<string> => {
    const {
      feature,
      variant,
      inputs,
      params,
      waitForCompletion = true,
    } = input as {
      feature: string
      variant: string
      inputs?: Record<string, unknown>
      params?: Record<string, unknown>
      waitForCompletion?: boolean
    }

    const progress = createToolProgress(toolCallId, 'CloudModelGenerate')
    return runV3GenerateAndSave({
      feature,
      variant,
      inputs,
      params,
      waitForCompletion,
      progress,
      toolName: 'CloudModelGenerate',
    })
  },
})

// ---------------------------------------------------------------------------
// CloudTextGenerate
// ---------------------------------------------------------------------------

export const cloudTextGenerateTool = tool({
  description: cloudTextGenerateToolDef.description,
  inputSchema: zodSchema(cloudTextGenerateToolDef.parameters),
  // 逻辑：扣 credits，必须审批。与 CloudModelGenerate 同策略。
  needsApproval: true,
  execute: async (input, { toolCallId }): Promise<string> => {
    const { feature, variant, inputs, params } = input as {
      feature: string
      variant: string
      inputs?: Record<string, unknown>
      params?: Record<string, unknown>
    }

    const progress = createToolProgress(toolCallId, 'CloudTextGenerate')
    const token = await requireToken()
    if (typeof token !== 'string') {
      progress.error(token.error)
      return `Error: ${token.error}`
    }

    progress.start(`${feature} / ${variant}`)
    try {
      const client = getSaasClient(token)
      const normalizedInputs = await normalizeCloudInputs({ inputs, client, progress })
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
        text,
        taskId: res.data.taskId,
        creditsConsumed: credits,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      progress.error(message)
      return errorString(`CloudTextGenerate(${feature}/${variant})`, err)
    }
  },
})

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
      return `Error: ${token.error}`
    }

    progress.start(`query ${taskId}`)
    try {
      const client = getSaasClient(token)
      const res = await client.ai.v3Task(taskId)
      const data = res.data

      // When the task has just reached a successful terminal state, auto-save
      // any result URLs the same way CloudModelGenerate does. Re-saving on repeated
      // polls is cheap (files get new timestamps) but typically the AI only
      // polls until succeeded, so duplication is rare.
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
              ? 'Files saved. Use files[].filePath when referencing them.'
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
      // 已登录：直接返回当前账号信息，避免 UI 再弹一遍登录框。
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
        // Token 可能过期 — 退回到打开登录框流程。
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
      return `Error: ${token.error}`
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
