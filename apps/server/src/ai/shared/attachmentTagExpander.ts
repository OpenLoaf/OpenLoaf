/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { promises as fs } from 'node:fs'
import nodePath from 'node:path'
import type { UIMessage } from 'ai'
import {
  ATTACHMENT_TAG_REGEX,
  formatAttachmentTag,
  parseAttachmentTagAttrs,
  type AttachmentTagAttrs,
} from '@openloaf/api/common'
import type { ModelDefinition, ModelTag } from '@openloaf/api/common'
import { expandPathTemplateVars } from '@/ai/tools/toolScope'
import {
  loadProjectImageBuffer,
  resolveProjectFilePath,
} from '@/ai/services/image/attachmentResolver'
import {
  classifyMediaByExt,
  guessMediaTypeByExt,
  type MediaKind,
} from '@/ai/services/image/mediaTypeUtils'
import {
  AUDIO_SIZE_LIMIT_BYTES,
  CDN_URL_TTL_MS,
  VIDEO_SIZE_LIMIT_BYTES,
} from '@/ai/services/image/mediaLimits'
import { uploadFileToSaasCdn } from '@/ai/shared/saasUploader'
import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type AttachmentExpansionMutation = {
  /** ID of the user message whose parts should be persisted. */
  messageId: string
  /** New parts array (pure UIMessage.parts, not ModelMessage). */
  newParts: unknown[]
}

export type AttachmentExpansionResult = {
  messages: UIMessage[]
  mutations: AttachmentExpansionMutation[]
}

type MediaCaps = {
  image: boolean
  video: boolean
  audio: boolean
  anySupported: boolean
}

/**
 * Upgrade attachment tags into native multimodal file parts when the target
 * model supports the corresponding input tag. Supports three decision paths:
 *
 *   1. Tag already has a fresh CDN `url` → reuse (no network call).
 *   2. SaaS login available → upload to CDN, emit file part with https url,
 *      and record a mutation so caller can persist the new url+uploadedAt
 *      back into the user message tag.
 *   3. No login / upload failed → fall back to base64 data URI (no persist).
 *
 * When any step is unsupported/over-limit/fails, the original tag text is
 * preserved so the model can still fall back to the `Read` + cloud-media-skill
 * path downstream.
 */
export async function expandAttachmentTagsForModel(
  messages: UIMessage[],
  modelDefinition: ModelDefinition | undefined,
): Promise<AttachmentExpansionResult> {
  const caps = resolveMediaCaps(modelDefinition?.tags)
  if (!caps.anySupported) return { messages, mutations: [] }

  const mutations: AttachmentExpansionMutation[] = []
  const out: UIMessage[] = []

  for (const msg of messages) {
    // 逻辑：只有用户消息里才会出现 attachment tag。
    if ((msg as any).role !== 'user') {
      out.push(msg)
      continue
    }
    const parts = Array.isArray((msg as any).parts) ? (msg as any).parts : []
    if (parts.length === 0) {
      out.push(msg)
      continue
    }

    const { nextParts, tagUpdated } = await expandPartsForMessage(parts, caps)
    if (!tagUpdated && samePartsRef(parts, nextParts)) {
      out.push(msg)
      continue
    }
    out.push({ ...(msg as any), parts: nextParts } as UIMessage)
    // 逻辑：仅当有 tag 新增/更新 CDN 属性时才回填，base64 路径不回填。
    if (tagUpdated) {
      mutations.push({
        messageId: String((msg as any).id ?? ''),
        newParts: nextParts,
      })
    }
  }

  return { messages: out, mutations }
}

// ---------------------------------------------------------------------------
// Capability resolution
// ---------------------------------------------------------------------------

/** Check whether the declared tags include any of the given candidates. */
function hasTag(tags: readonly ModelTag[] | undefined, ...wanted: ModelTag[]): boolean {
  if (!tags) return false
  for (const t of wanted) if (tags.includes(t)) return true
  return false
}

function resolveMediaCaps(tags: readonly ModelTag[] | undefined): MediaCaps {
  const image = hasTag(tags, 'image_input', 'image_analysis')
  const video = hasTag(tags, 'video_analysis')
  const audio = hasTag(tags, 'audio_analysis')
  return { image, video, audio, anySupported: image || video || audio }
}

// ---------------------------------------------------------------------------
// Per-message expansion
// ---------------------------------------------------------------------------

type ExpandResult = {
  nextParts: unknown[]
  /** True when at least one tag gained a fresh CDN url and needs persistence. */
  tagUpdated: boolean
}

async function expandPartsForMessage(
  parts: unknown[],
  caps: MediaCaps,
): Promise<ExpandResult> {
  const result: unknown[] = []
  let anyTagUpdated = false

  for (const part of parts) {
    if (!part || typeof part !== 'object' || (part as any).type !== 'text') {
      result.push(part)
      continue
    }
    const text: string = (part as any).text ?? ''
    if (!text) {
      result.push(part)
      continue
    }
    if (!text.includes('<system-tag')) {
      result.push(part)
      continue
    }

    // 逻辑：扫描 text 内每个 attachment tag，逐个决定升级或保留。
    const tokens = await tokenizeTextWithTags(text, caps)
    const { splitParts, tagUpdated } = tokensToParts(tokens)
    if (tagUpdated) anyTagUpdated = true
    for (const p of splitParts) result.push(p)
  }

  return { nextParts: result, tagUpdated: anyTagUpdated }
}

// ---------------------------------------------------------------------------
// Text → tokens
// ---------------------------------------------------------------------------

type TextToken = { kind: 'text'; value: string }
type KeepTagToken = { kind: 'keep'; tag: string }
type FileToken = {
  kind: 'file'
  filePart: { type: 'file'; url: string; mediaType: string }
  /**
   * New tag string to write back when persisting. Undefined for base64 path
   * (never persisted).
   */
  persistTag?: string
}
type Token = TextToken | KeepTagToken | FileToken

async function tokenizeTextWithTags(text: string, caps: MediaCaps): Promise<Token[]> {
  ATTACHMENT_TAG_REGEX.lastIndex = 0
  const tokens: Token[] = []
  let cursor = 0
  const pending: Array<{ pos: number; tag: string; attrs: AttachmentTagAttrs }> = []

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const match = ATTACHMENT_TAG_REGEX.exec(text)
    if (!match) break
    const attrs = parseAttachmentTagAttrs(match[1] ?? '')
    if (!attrs) continue
    pending.push({ pos: match.index, tag: match[0], attrs })
  }
  ATTACHMENT_TAG_REGEX.lastIndex = 0

  if (pending.length === 0) {
    return [{ kind: 'text', value: text }]
  }

  // 逻辑：并行跑完每个 tag 的决策（含 CDN 上传 / base64 读盘），保序落位。
  const resolved = await Promise.all(
    pending.map((p) => resolveTagToken(p.tag, p.attrs, caps)),
  )

  for (let i = 0; i < pending.length; i++) {
    const { pos, tag } = pending[i]!
    const token = resolved[i]!
    if (pos > cursor) {
      tokens.push({ kind: 'text', value: text.slice(cursor, pos) })
    }
    tokens.push(token)
    cursor = pos + tag.length
  }
  if (cursor < text.length) {
    tokens.push({ kind: 'text', value: text.slice(cursor) })
  }
  return tokens
}

async function resolveTagToken(
  rawTag: string,
  attrs: AttachmentTagAttrs,
  caps: MediaCaps,
): Promise<Token> {
  const kind = classifyMediaByExt(attrs.path)
  if (kind === 'unknown') return { kind: 'keep', tag: rawTag }
  if (!caps[kind]) return { kind: 'keep', tag: rawTag }

  // 逻辑：已有未过期的 CDN url → 零成本复用。
  if (attrs.url && isCdnUrlFresh(attrs.uploadedAt)) {
    return {
      kind: 'file',
      filePart: {
        type: 'file',
        url: attrs.url,
        mediaType: attrs.mediaType ?? guessMediaTypeByExt(attrs.path) ?? 'application/octet-stream',
      },
    }
  }

  const absPath = await resolveAttachmentAbsPath(attrs.path)
  if (!absPath) return { kind: 'keep', tag: rawTag }

  // 大小预检：video/audio 有硬上限，image 走 sharp 压缩流程。
  if (kind !== 'image') {
    const size = await safeStatSize(absPath)
    if (size == null) return { kind: 'keep', tag: rawTag }
    const limit = kind === 'video' ? VIDEO_SIZE_LIMIT_BYTES : AUDIO_SIZE_LIMIT_BYTES
    if (size > limit) return { kind: 'keep', tag: rawTag }
  }

  // Path 1: 尝试上传 CDN（未登录或失败返回 null → 走 Path 2）。
  const uploaded = await uploadFileToSaasCdn(absPath, {
    mediaType: guessMediaTypeByExt(attrs.path) ?? undefined,
  })
  if (uploaded) {
    const uploadedAt = new Date().toISOString()
    const persistTag = formatAttachmentTag({
      path: attrs.path,
      url: uploaded.url,
      mediaType: uploaded.mediaType,
      uploadedAt,
    })
    return {
      kind: 'file',
      filePart: {
        type: 'file',
        url: uploaded.url,
        mediaType: uploaded.mediaType,
      },
      persistTag,
    }
  }

  // Path 2: base64 兜底（不回填，让下次重发重新决策）。
  const dataPart = await loadAsBase64FilePart(absPath, kind)
  if (dataPart) {
    return { kind: 'file', filePart: dataPart }
  }
  return { kind: 'keep', tag: rawTag }
}

// ---------------------------------------------------------------------------
// Tokens → parts (with tag persistence metadata)
// ---------------------------------------------------------------------------

function tokensToParts(tokens: Token[]): { splitParts: unknown[]; tagUpdated: boolean } {
  const splitParts: unknown[] = []
  // 逻辑：原 text part 可能被切成多个 [text, file, text, file, ...]，累积当前 text 缓冲。
  let textBuf = ''
  let tagUpdated = false
  const flushText = () => {
    if (textBuf.length > 0) {
      splitParts.push({ type: 'text', text: textBuf })
      textBuf = ''
    }
  }

  for (const token of tokens) {
    if (token.kind === 'text') {
      textBuf += token.value
    } else if (token.kind === 'keep') {
      textBuf += token.tag
    } else {
      // file token
      if (token.persistTag) {
        // 升级回填：文本层在保留 tag 字符串的同时，插入独立 file part。
        // 模型会同时看到原 tag（文本形式 + 新属性）和对应的图片/视频/音频 part，
        // 这是必要的：未来若模型不再支持 vision，文本形式的 tag 能让 Read 工具继续处理。
        textBuf += token.persistTag
        tagUpdated = true
      }
      flushText()
      splitParts.push(token.filePart)
    }
  }
  flushText()

  return { splitParts, tagUpdated }
}

// ---------------------------------------------------------------------------
// Path / IO helpers
// ---------------------------------------------------------------------------

function samePartsRef(a: unknown[], b: unknown[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function isCdnUrlFresh(uploadedAt: string | undefined): boolean {
  if (!uploadedAt) return false
  const ts = Date.parse(uploadedAt)
  if (Number.isNaN(ts)) return false
  return Date.now() - ts < CDN_URL_TTL_MS
}

async function safeStatSize(absPath: string): Promise<number | null> {
  try {
    const st = await fs.stat(absPath)
    if (!st.isFile()) return null
    return st.size
  } catch {
    return null
  }
}

async function resolveAttachmentAbsPath(rawPath: string): Promise<string | null> {
  // 逻辑：剥掉 `:start-end` 行号后缀（图片/视频/音频用不到）。
  const cleaned = rawPath.replace(/:\d+-\d+$/, '').trim()
  if (!cleaned) return null

  // 1. `${CURRENT_CHAT_DIR}` 等模板 → 先展开
  if (cleaned.includes('${')) {
    const expanded = expandPathTemplateVars(cleaned)
    if (nodePath.isAbsolute(expanded)) {
      if (await pathExists(expanded)) return nodePath.resolve(expanded)
      return null
    }
    // 展开后仍非绝对说明模板变量缺值（sessionId 等），放弃升级
    return null
  }

  // 2. 绝对路径：直接检查
  if (nodePath.isAbsolute(cleaned)) {
    if (await pathExists(cleaned)) return nodePath.resolve(cleaned)
    return null
  }

  // 3. `[projectId]/path` 或项目相对路径
  const resolved = await resolveProjectFilePath({ path: cleaned })
  if (!resolved) return null
  if (!(await pathExists(resolved.absPath))) return null
  return resolved.absPath
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    const st = await fs.stat(absPath)
    return st.isFile()
  } catch {
    return false
  }
}

async function loadAsBase64FilePart(
  absPath: string,
  kind: MediaKind,
): Promise<{ type: 'file'; url: string; mediaType: string } | null> {
  try {
    if (kind === 'image') {
      // 复用 sharp 压缩流程，输出稳定的 image/jpeg|png|webp。
      const loaded = await loadProjectImageBuffer({
        path: absPath,
        mediaType: guessMediaTypeByExt(absPath) ?? undefined,
      })
      if (!loaded) return null
      return {
        type: 'file',
        url: `data:${loaded.mediaType};base64,${loaded.buffer.toString('base64')}`,
        mediaType: loaded.mediaType,
      }
    }
    // video/audio：读 raw buffer，不压缩。
    const buffer = await fs.readFile(absPath)
    const mediaType = guessMediaTypeByExt(absPath) ?? 'application/octet-stream'
    return {
      type: 'file',
      url: `data:${mediaType};base64,${buffer.toString('base64')}`,
      mediaType,
    }
  } catch (err) {
    logger.warn({ err, absPath, kind }, '[attachmentTagExpander] base64 fallback failed')
    return null
  }
}
