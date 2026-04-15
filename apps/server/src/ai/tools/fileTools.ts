/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { tool, zodSchema } from 'ai'
import { stripAttachmentTagWrapper } from '@openloaf/api/common'
import {
  readToolDef,
  editToolDef,
  writeToolDef,
} from '@openloaf/api/types/tools/runtime'
import { resolveToolPath, ensureWritableRoot, expandPathTemplateVars } from '@/ai/tools/toolScope'
import { resolveCommandSandboxDirs } from '@/ai/tools/commandSandbox'
import { resolveSecretTokens } from '@/ai/tools/secretStore'
import { getProjectId, getSessionId } from '@/ai/shared/context/requestContext'
import { getProjectRootPath } from '@openloaf/api/services/vfsService'
import {
  recordRead,
  getReadEntry,
  type ReadEntry,
} from '@/ai/tools/fileReadState'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'
import { extractArchiveContent } from '@/ai/tools/office/archiveExtractor'
import {
  previewPdf,
  previewDocx,
  previewXlsx,
  previewPptx,
} from '@/ai/tools/docPreviewTools'
import { formatFileResult, xmlAttrEscape, type FormatOptions } from '@/ai/tools/fileFormat'
import { createToolProgress, type ToolProgressEmitter } from '@/ai/tools/toolProgress'

/** Idle watchdog: reject if no progress emit happens for `idleMs`. */
const READ_IDLE_TIMEOUT_MS = 60_000

function wrapProgressWithIdleWatchdog(
  progress: ToolProgressEmitter,
  idleMs: number,
): { progress: ToolProgressEmitter; idlePromise: Promise<never>; stop: () => void } {
  let timer: NodeJS.Timeout | null = null
  let stopped = false
  let rejectFn: ((err: Error) => void) | null = null

  const idlePromise = new Promise<never>((_, reject) => {
    rejectFn = reject
  })

  const kick = () => {
    if (stopped) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      if (stopped) return
      stopped = true
      const err = new Error(
        `[READ_IDLE_TIMEOUT] Read produced no progress for ${Math.round(idleMs / 1000)}s. Aborting — the underlying extractor is likely stuck.`,
      )
      try { progress.error(err.message) } catch { /* ignore */ }
      rejectFn?.(err)
    }, idleMs)
  }

  const stop = () => {
    stopped = true
    if (timer) { clearTimeout(timer); timer = null }
  }

  const wrapped: ToolProgressEmitter = {
    start(label, meta) { kick(); progress.start(label, meta) },
    delta(text, meta) { kick(); progress.delta(text, meta) },
    done(summary, meta) { stop(); progress.done(summary, meta) },
    error(errorText) { stop(); progress.error(errorText) },
  }

  kick()
  return { progress: wrapped, idlePromise, stop }
}
import type { FileContentResult } from '@/ai/tools/office/types'

const MAX_LINE_LENGTH = 500
const DEFAULT_READ_LIMIT = 2000
/** Chunk size (in UTF-8 bytes) used when splitting a line that exceeds MAX_LINE_LENGTH. */
const LONG_LINE_CHUNK_BYTES = 2000
/** Overall output byte budget to prevent minified single-line files from exploding context. */
const MAX_READ_OUTPUT_BYTES = 80_000

// ---------------------------------------------------------------------------
// File kind classification (used by the unified Read dispatcher below)
// ---------------------------------------------------------------------------

type FileKind =
  | 'text'
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'legacy-office'
  | 'binary'

const IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.tif',
  '.avif', '.heic', '.heif', '.ico',
])

const VIDEO_EXTS = new Set([
  '.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.mpeg', '.mpg',
  '.m4v', '.3gp', '.ogv',
])

const AUDIO_EXTS = new Set([
  '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma', '.opus', '.amr',
  '.aiff', '.aif',
])

/**
 * Known non-text binary extensions that Read should refuse outright.
 * Files with these extensions won't be passed to the text reader — the model
 * gets a clear error instead of a block of garbage characters.
 *
 * Unknown extensions (e.g. a custom config `.conf2`) still fall through to
 * the text reader on the assumption they may be plain text.
 *
 * `.zip` is handled separately as an archive (auto-extracted) — see
 * `ARCHIVE_EXTS` below.
 */
const BINARY_EXTS = new Set([
  '.7z', '.bin', '.bz2', '.dat', '.db', '.dll', '.dmg', '.exe',
  '.gz', '.iso', '.jar', '.otf', '.psd', '.rar', '.so', '.sqlite',
  '.tar', '.ttf', '.xz',
])

/** Archive formats that Read auto-extracts. Currently only .zip is supported. */
const ARCHIVE_EXTS = new Set(['.zip'])

/**
 * For each derived-read file kind, the tool that can actually mutate the
 * *source* file. Used to tell the model "this read is a rendered view; to
 * edit the real file use <mutateTool>". `undefined` means there is no direct
 * mutator (images/video/audio — regenerate via media generation tools; zip —
 * re-pack via Bash or a future ArchiveMutate tool).
 */
const DERIVED_MUTATE_TOOL: Partial<Record<FileKind, string>> = {
  pdf: 'PdfMutate',
  docx: 'WordMutate',
  xlsx: 'ExcelMutate',
  pptx: 'PptxMutate',
}

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.doc': 'application/msword',
  '.xls': 'application/vnd.ms-excel',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
}

function classifyFileKind(absPath: string): { kind: FileKind; mimeType: string } {
  const ext = path.extname(absPath).toLowerCase()
  const mimeType = MIME_BY_EXT[ext] ?? 'application/octet-stream'
  if (ext === '.pdf') return { kind: 'pdf', mimeType }
  if (ext === '.docx') return { kind: 'docx', mimeType }
  if (ext === '.xlsx') return { kind: 'xlsx', mimeType }
  if (ext === '.pptx') return { kind: 'pptx', mimeType }
  if (ext === '.doc' || ext === '.xls' || ext === '.ppt') return { kind: 'legacy-office', mimeType }
  if (IMAGE_EXTS.has(ext)) return { kind: 'image', mimeType: mimeType !== 'application/octet-stream' ? mimeType : `image/${ext.slice(1)}` }
  if (VIDEO_EXTS.has(ext)) return { kind: 'video', mimeType: mimeType !== 'application/octet-stream' ? mimeType : `video/${ext.slice(1)}` }
  if (AUDIO_EXTS.has(ext)) return { kind: 'audio', mimeType: mimeType !== 'application/octet-stream' ? mimeType : `audio/${ext.slice(1)}` }
  if (ARCHIVE_EXTS.has(ext)) return { kind: 'archive', mimeType: mimeType !== 'application/octet-stream' ? mimeType : 'application/zip' }
  if (BINARY_EXTS.has(ext)) return { kind: 'binary', mimeType }
  return { kind: 'text', mimeType: 'text/plain' }
}

/** Resolve the per-file asset dir under the session's asset root. */
async function resolveReadAssetDir(
  sessionId: string,
  filePath: string,
  suffix: '_asset' | '_unzipped' = '_asset',
): Promise<{ assetDirAbsPath: string; assetRelPrefix: string }> {
  const assetRoot = await resolveSessionAssetDir(sessionId)
  const baseName = path.basename(filePath, path.extname(filePath))
  const safeName = baseName.replace(/[^\w\u4e00-\u9fff.-]/g, '_') || 'file'
  const assetRelPrefix = `${safeName}${suffix}`
  const assetDirAbsPath = path.join(assetRoot, assetRelPrefix)
  return { assetDirAbsPath, assetRelPrefix }
}

/**
 * Suggestion block appended to Read responses for image / video / audio files.
 * Read never calls SaaS multimodal understanding itself — it only reads local
 * metadata and surfaces this hint so the model can decide to SkillLoad the
 * cloud-media-skill on demand (which documents the paid cloud flow).
 */
const CLOUD_MEDIA_SUGGEST: FormatOptions['suggestSkill'] = {
  skill: 'cloud-media-skill',
  reason: '图片/视频/音频内容理解需要云端多模态能力',
  body: '需要 OCR、字幕提取、画面描述、语音转写时先 SkillLoad 加载 cloud-media-skill 查看云端流程',
}

/** 检查路径是否属于某个根路径内。 */
function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/** 解析写入目标路径，确保在项目 scope 内。未绑定项目时使用会话 asset 目录。 */
export async function resolveWriteTargetPath(targetPath: string): Promise<{ absPath: string; rootPath: string }> {
  const projectId = getProjectId()
  let rootPath: string
  if (projectId) {
    const projRoot = getProjectRootPath(projectId)
    if (!projRoot) throw new Error('Project not found.')
    rootPath = projRoot
  } else {
    // 未绑定项目 → 回退到会话 asset 目录
    const writable = await ensureWritableRoot()
    rootPath = writable.rootPath
  }

  // 展开路径模板变量（${CURRENT_CHAT_DIR} 等），与 Read/Glob/Grep 保持一致
  const expanded = expandPathTemplateVars(targetPath)
  const trimmed = expanded.trim()
  if (!trimmed) throw new Error('file_path is required.')
  if (trimmed.startsWith('file:')) throw new Error('file:// URIs are not allowed.')

  // 剥离 attachment-tag 包装
  const normalized = stripAttachmentTagWrapper(trimmed)
  if (normalized.startsWith('[')) throw new Error('Project-scoped paths are not allowed.')
  if (!normalized.trim()) throw new Error('file_path is required.')

  const resolvedRoot = path.resolve(rootPath)
  const absPath = path.isAbsolute(normalized)
    ? path.resolve(normalized)
    : path.resolve(resolvedRoot, normalized)
  if (!isPathInside(resolvedRoot, absPath)) {
    throw new Error('Path is outside the current project scope.')
  }
  return { absPath, rootPath: resolvedRoot }
}

/** UTF-8 边界裁剪，避免多字节字符被截断。 */
function clampUtf8End(buffer: Buffer, index: number): number {
  let cursor = Math.max(0, Math.min(index, buffer.length))
  while (cursor > 0) {
    const byte = buffer[cursor - 1]
    if (byte === undefined) break
    if ((byte & 0b1100_0000) !== 0b1000_0000) break
    cursor -= 1
  }
  return cursor
}

/**
 * Split a long line into UTF-8-safe chunks of at most `chunkBytes` bytes.
 * Returns chunks with explicit byte ranges so the model knows exactly which
 * slice of the original line it is looking at.
 *
 * For minified HTML/JS/CSS (single-line files), this prevents the model from
 * interpreting `--max-line-length` truncation as "file truncated" and looping.
 */
function splitLongLine(
  line: string,
  chunkBytes: number,
): Array<{ start: number; end: number; text: string }> {
  const buf = Buffer.from(line, 'utf8')
  const total = buf.length
  const chunks: Array<{ start: number; end: number; text: string }> = []
  let cursor = 0
  while (cursor < total) {
    const rawEnd = Math.min(cursor + chunkBytes, total)
    const end = clampUtf8End(buf, rawEnd)
    // clampUtf8End can return a position equal to cursor if a multi-byte char
    // crosses the boundary; fall back to a wider slice in that pathological case.
    const safeEnd = end > cursor ? end : Math.min(cursor + chunkBytes + 4, total)
    chunks.push({
      start: cursor,
      end: safeEnd,
      text: buf.toString('utf8', cursor, safeEnd),
    })
    cursor = safeEnd
  }
  return chunks
}

/** 按换行符拆分文件内容。 */
function splitLines(raw: string): string[] {
  if (!raw) return []
  const lines = raw.split(/\r?\n/)
  if (raw.endsWith('\n') || raw.endsWith('\r\n')) {
    lines.pop()
  }
  return lines
}

/** Check if a file path is a PLAN file (PLAN_N.md) — bypass guard/approval. */
function isPlanFilePath(filePath: string): boolean {
  return /PLAN_\d+\.md$/.test(filePath ?? '')
}

/**
 * Check if a file path falls inside the session sandbox (CURRENT_CHAT_DIR / CURRENT_BOARD_DIR).
 * Files in sandbox are session-private — Write/Edit there should not require approval.
 */
function isFileInSandbox(filePath: string): boolean {
  if (isPlanFilePath(filePath)) return true
  const sandboxDirs = resolveCommandSandboxDirs()
  if (sandboxDirs.length === 0) return false
  const expanded = expandPathTemplateVars(filePath)
  if (!path.isAbsolute(expanded)) return false
  const abs = path.resolve(expanded)
  return sandboxDirs.some(dir => isPathInside(dir, abs))
}

/**
 * Read-before-Write guard: enforces that Write/Edit has a fresh Read entry.
 * Throws with a Claude-Code-aligned message on violation. Caller handles
 * ENOENT (new file creation) separately before calling this.
 */
async function assertReadBeforeModify(
  absPath: string,
  currentMtimeMs: number,
  mode: 'write' | 'edit',
): Promise<void> {
  const sessionId = getSessionId()
  if (!sessionId) return // no session → cannot track; skip guard
  const entry = getReadEntry(sessionId, absPath)
  if (!entry) {
    throw new Error(
      'File has not been read yet. Read it first before writing to it.',
    )
  }
  // Derived reads (PDF→MD, DOCX→MD, archive listing, media metadata) produce
  // a rendered view, not the raw bytes of the source file. Edit/Write cannot
  // meaningfully modify the source — refuse with a clear hint pointing at the
  // format-specific mutate tool.
  if (entry.readMode === 'derived') {
    const hint = entry.mutateTool
      ? `Use \`${entry.mutateTool}\` to modify the source file.`
      : 'Use the format-specific mutate tool (PdfMutate / WordMutate / ExcelMutate / PptxMutate).'
    throw new Error(
      `"${path.basename(absPath)}" was read in derived mode (extracted / rendered view). ` +
        `Edit/Write cannot modify the source file. ${hint} ` +
        `For archives: call Read on individual files inside the unzipped folder — ` +
        `those come back as raw text and can be edited.`,
    )
  }
  // Partial view blocks Write (full overwrite) but not Edit (surgical).
  if (mode === 'write' && entry.isPartialView) {
    throw new Error(
      'File was only partially read. Re-read the whole file (without offset/limit) before writing it.',
    )
  }
  if (Math.floor(currentMtimeMs) > entry.mtime) {
    throw new Error(
      'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
    )
  }
}

/** Snapshot post-write state so subsequent Edits on same file don't trip the mtime check. */
async function recordPostWriteState(
  absPath: string,
  content: string,
): Promise<void> {
  const sessionId = getSessionId()
  if (!sessionId) return
  const stat = await fs.stat(absPath)
  const totalLines = splitLines(content).length
  const entry: ReadEntry = {
    mtime: Math.floor(stat.mtimeMs),
    offset: 1,
    limit: Number.MAX_SAFE_INTEGER,
    totalLines,
    isPartialView: false,
    recordedAt: Date.now(),
    readMode: 'raw',
  }
  recordRead(sessionId, absPath, entry)
}

// ─── Read 工具 ─────────────────────────────────────────────────────────────

/**
 * Unified Read tool — MIME-dispatches to text / PDF / Office / image / video /
 * audio handlers and returns a single XML-tagged string the model can consume.
 *
 * Office files (pdf/docx/xlsx/pptx) return only a cheap local preview. For the
 * full Markdown body + extracted images use the DocPreview tool with
 * mode='full'.
 *
 * Image / Video / Audio files return basic local metadata only. Read never
 * calls any SaaS multimodal understanding — the response includes a
 * `<suggest skill="cloud-media-skill">` hint so the model can SkillLoad it
 * on demand.
 */
export const readTool = tool({
  description: readToolDef.description,
  inputSchema: zodSchema(readToolDef.parameters),
  needsApproval: false,
  execute: async (
    { file_path: filePath, offset, limit },
    { toolCallId }: { toolCallId: string },
  ): Promise<string> => {
    const rawProgress = createToolProgress(toolCallId, 'Read')
    const watchdog = wrapProgressWithIdleWatchdog(rawProgress, READ_IDLE_TIMEOUT_MS)
    const progress = watchdog.progress
    const startedAt = Date.now()
    try {
      return await Promise.race([
        runReadExecute(),
        watchdog.idlePromise,
      ])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      progress.error(msg)
      throw e
    } finally {
      watchdog.stop()
    }

    async function runReadExecute(): Promise<string> {
      const { absPath } = resolveToolPath({ target: filePath })
      const stat = await fs.stat(absPath)
      if (!stat.isFile()) {
        throw new Error('Path is not a file. Use Glob or Bash ls for directories.')
      }

      const { kind, mimeType } = classifyFileKind(absPath)
      const fileName = path.basename(absPath)
      const bytes = stat.size
      const sizeLabel = formatBytes(bytes)

      progress.start(`Reading ${fileName} (${kind}, ${sizeLabel})`, {
        kind,
        mimeType,
        bytes,
      })

      if (kind === 'legacy-office') {
        const ext = path.extname(absPath).toLowerCase()
        const modern = ext === '.doc' ? '.docx' : ext === '.xls' ? '.xlsx' : '.pptx'
        throw new Error(
          `Legacy Office format "${ext}" is not supported. Open in LibreOffice / Word / Excel / PowerPoint and re-save as ${modern}, then retry.`,
        )
      }

      if (kind === 'text') {
        progress.delta('Decoding UTF-8 and slicing lines...\n')
        const out = await readTextFile(absPath, filePath, stat, offset, limit, mimeType)
        progress.done(`Read text file (${sizeLabel}) in ${Date.now() - startedAt}ms`)
        return out
      }

      if (kind === 'binary') {
        throw new Error(
          `Unknown binary file type "${path.extname(absPath)}". Supported: text / code / config, PDF, DOCX, XLSX, PPTX, images (${[...IMAGE_EXTS].join(' ')}), video, audio.`,
        )
      }

      // Only `archive` needs session-scoped asset dir (for unzipping).
      // Office previews and media reads are pure local inspections — no disk writes.
      const sessionId = getSessionId()
      let assetDirAbsPath: string | undefined
      let assetRelPrefix: string | undefined
      if (kind === 'archive') {
        if (!sessionId) {
          throw new Error('Reading an archive requires an active chat session.')
        }
        const resolved = await resolveReadAssetDir(sessionId, filePath, '_unzipped')
        assetDirAbsPath = resolved.assetDirAbsPath
        assetRelPrefix = resolved.assetRelPrefix
      }

      let result: FileContentResult
      let suggestSkill: FormatOptions['suggestSkill']
      switch (kind) {
        case 'pdf':
          progress.delta('Building PDF preview (structure + first-page snippet)...\n')
          result = await previewPdf(absPath, undefined)
          break
        case 'docx':
          progress.delta('Building DOCX preview (headings + first paragraphs)...\n')
          result = await previewDocx(absPath)
          break
        case 'xlsx':
          progress.delta('Building XLSX preview (sheet list + preview grid)...\n')
          result = await previewXlsx(absPath, undefined)
          break
        case 'pptx':
          progress.delta('Building PPTX preview (slide titles + first slide text)...\n')
          result = await previewPptx(absPath)
          break
        case 'image':
          result = await readImageFile(absPath, fileName, progress)
          suggestSkill = CLOUD_MEDIA_SUGGEST
          break
        case 'video':
          result = await readVideoFile(absPath, fileName, bytes, progress)
          suggestSkill = CLOUD_MEDIA_SUGGEST
          break
        case 'audio':
          result = await readAudioFile(absPath, fileName, bytes, progress)
          suggestSkill = CLOUD_MEDIA_SUGGEST
          break
        case 'archive':
          progress.delta('Unzipping archive and listing entries...\n')
          result = await extractArchiveContent(absPath, assetDirAbsPath!, assetRelPrefix!)
          break
        default: {
          const exhaustive: never = kind
          throw new Error(`Unsupported file kind: ${exhaustive}`)
        }
      }

      // Enrich meta with the absolute path of the generated asset dir so the
      // model can hand it straight to Bash / Glob / Grep without guessing how
      // `${CURRENT_CHAT_DIR}` expands. Only applies to archive unzipping now.
      if (result.assetDir && assetDirAbsPath) {
        ;(result.meta as Record<string, unknown>).extractedTo = {
          absPath: assetDirAbsPath,
          templatePath: `\${CURRENT_CHAT_DIR}/${result.assetDir}`,
        }
      }
      ;(result.meta as Record<string, unknown>).sourcePath = absPath

      // Session-scoped read state: every non-text kind here is a derived
      // read (rendered / extracted view). Edit/Write on the source file will
      // be refused by `assertReadBeforeModify`, pointing the model at the
      // correct mutate tool.
      const mutateTool = DERIVED_MUTATE_TOOL[kind]
      if (mutateTool) {
        ;(result.meta as Record<string, unknown>).mutateTool = mutateTool
      }
      if (sessionId && !isPlanFilePath(filePath)) {
        recordRead(sessionId, absPath, {
          mtime: Math.floor(stat.mtimeMs),
          offset: 1,
          limit: Number.MAX_SAFE_INTEGER,
          totalLines: 0,
          isPartialView: false,
          recordedAt: Date.now(),
          readMode: 'derived',
          mutateTool,
        })
      }

      progress.done(summarizeResult(result, Date.now() - startedAt), {
        imageCount: result.images.length,
        truncated: result.truncated ?? false,
      })
      return formatFileResult(result, fileName, mimeType, bytes, {
        readMode: 'derived',
        mutateTool,
        toolName: 'Read',
        suggestSkill,
      })
    }
  },
})

/** Format a byte count in human-readable units for progress labels. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** Build a short done-summary from a FileContentResult. */
function summarizeResult(result: FileContentResult, durationMs: number): string {
  const bits: string[] = []
  const m = result.meta as Record<string, unknown>
  if (typeof m.pageCount === 'number') bits.push(`${m.pageCount} page(s)`)
  if (typeof m.sheetCount === 'number') bits.push(`${m.sheetCount} sheet(s)`)
  if (typeof m.slideCount === 'number') bits.push(`${m.slideCount} slide(s)`)
  if (result.images.length > 0) bits.push(`${result.images.length} image(s)`)
  if (bits.length === 0 && result.content) {
    bits.push(`${result.content.length} chars`)
  }
  const head = bits.length > 0 ? `Extracted ${bits.join(', ')}` : `Read ${result.type}`
  return `${head} in ${durationMs}ms`
}

// ---------------------------------------------------------------------------
// Per-kind Read handlers
// ---------------------------------------------------------------------------

/** Text / code / config — original numbered-line formatter wrapped in <file>. */
async function readTextFile(
  absPath: string,
  filePath: string,
  stat: import('node:fs').Stats,
  offset: number | undefined,
  limit: number | undefined,
  mimeType: string,
): Promise<string> {
  const raw = await fs.readFile(absPath, 'utf-8')
  const lines = splitLines(raw)
  const resolvedOffset = typeof offset === 'number' ? offset : 1
  const resolvedLimit = typeof limit === 'number' ? limit : DEFAULT_READ_LIMIT

  if (resolvedOffset <= 0) throw new Error('offset must be a 1-indexed line number')
  if (resolvedLimit <= 0) throw new Error('limit must be greater than zero')
  if (lines.length > 0 && resolvedOffset > lines.length) {
    throw new Error('offset exceeds file length')
  }

  const startIndex = resolvedOffset - 1
  const endIndex = Math.min(startIndex + resolvedLimit, lines.length)
  const contentLines: string[] = []
  let outputBytes = 0
  let longLineCount = 0
  let chunkedLineCount = 0
  let budgetExhaustedAtLine: number | null = null
  let lastEmittedLineIndex = startIndex - 1
  outer: for (let i = startIndex; i < endIndex; i++) {
    const lineNum = i + 1
    const original = lines[i]!
    const byteLength = Buffer.byteLength(original, 'utf8')
    if (byteLength <= MAX_LINE_LENGTH) {
      const entry = `${lineNum}\t${original}`
      if (outputBytes + entry.length > MAX_READ_OUTPUT_BYTES) {
        budgetExhaustedAtLine = lineNum
        break
      }
      contentLines.push(entry)
      outputBytes += entry.length + 1
      lastEmittedLineIndex = i
      continue
    }
    // Long line → byte-range chunks; label: `<lineNum>[chars A-B/total]`.
    longLineCount++
    const chunks = splitLongLine(original, LONG_LINE_CHUNK_BYTES)
    chunkedLineCount += chunks.length
    for (const chunk of chunks) {
      const label = `${lineNum}[chars ${chunk.start}-${chunk.end}/${byteLength}]`
      const entry = `${label}\t${chunk.text}`
      if (outputBytes + entry.length > MAX_READ_OUTPUT_BYTES) {
        budgetExhaustedAtLine = lineNum
        break outer
      }
      contentLines.push(entry)
      outputBytes += entry.length + 1
    }
    lastEmittedLineIndex = i
  }

  const displayedStart = resolvedOffset
  const displayedEnd = Math.min(lastEmittedLineIndex + 1, endIndex)
  const notes: string[] = []
  if (lines.length === 0) {
    notes.push('Empty file (0 lines).')
  } else if (
    displayedStart === 1 &&
    displayedEnd === lines.length &&
    budgetExhaustedAtLine === null
  ) {
    notes.push(`Displaying all ${lines.length} lines of the file.`)
  } else {
    notes.push(
      `Displaying lines ${displayedStart}-${displayedEnd} of ${lines.length} total. Use offset/limit to read other parts.`,
    )
  }
  if (longLineCount > 0) {
    notes.push(
      `${longLineCount} line(s) exceeded ${MAX_LINE_LENGTH} bytes and were split into ${chunkedLineCount} chunks of up to ${LONG_LINE_CHUNK_BYTES} bytes each (labels: "<line>[chars A-B/total]"). The file on disk is unchanged.`,
    )
    if (lines.length < 20) {
      notes.push(
        'This looks like a minified/single-line file. For structural extraction prefer Bash with grep -oE, sed, cut, or tr.',
      )
    }
  }
  if (budgetExhaustedAtLine !== null) {
    notes.push(
      `Output capped at ~${MAX_READ_OUTPUT_BYTES} bytes to protect context; stopped inside line ${budgetExhaustedAtLine}. Call Read again with offset=${budgetExhaustedAtLine} to continue, or use Bash for targeted extraction.`,
    )
  }

  // Record Read state for Write/Edit guard checks (bypass PLAN files).
  const sessionId = getSessionId()
  if (sessionId && !isPlanFilePath(filePath)) {
    recordRead(sessionId, absPath, {
      mtime: Math.floor(stat.mtimeMs),
      offset: resolvedOffset,
      limit: resolvedLimit,
      totalLines: lines.length,
      isPartialView: endIndex < lines.length,
      recordedAt: Date.now(),
      readMode: 'raw',
    })
  }

  const fileName = path.basename(filePath)
  const meta = {
    totalLines: lines.length,
    displayedStart,
    displayedEnd,
    longLineCount,
    truncated: budgetExhaustedAtLine !== null,
  }
  const attrs = [
    `name="${xmlAttrEscape(fileName)}"`,
    'type="text"',
    `mimeType="${xmlAttrEscape(mimeType)}"`,
    `bytes="${stat.size}"`,
    'readMode="raw"',
  ].join(' ')
  // raw 模式：先输出一块 <system-tag> 描述文件元信息，再直接跟原始内容（不套 <content>），
  // 这样模型拿到的文本就和 `cat -n` 原生输出形态一致，便于后续 Edit/Write 配对使用。
  const header: string[] = [
    '<system-tag type="fileInfo" toolName="Read">',
    `<file ${attrs} />`,
    `<meta>${JSON.stringify(meta)}</meta>`,
  ]
  if (notes.length > 0) {
    header.push(`<note>${xmlAttrEscape(notes.join(' '))}</note>`)
  }
  header.push('</system-tag>')
  return `${header.join('\n')}\n${contentLines.join('\n')}`
}

/**
 * Image reader — local metadata only (width/height/format via sharp).
 * Read does NOT call any SaaS understanding; to OCR / caption, SkillLoad
 * cloud-media-skill and follow its instructions.
 */
async function readImageFile(
  absPath: string,
  fileName: string,
  progress: ToolProgressEmitter,
): Promise<FileContentResult> {
  progress.delta('Probing image metadata via sharp...\n')
  const sharp = (await import('sharp')).default
  let width = 0
  let height = 0
  let format: string | undefined
  try {
    const m = await sharp(absPath).metadata()
    width = m.width ?? 0
    height = m.height ?? 0
    format = m.format
  } catch {
    // Unsupported container — surface zero dims rather than throwing so the
    // model still gets file bytes + the cloud-media-skill hint.
  }

  const meta: Record<string, unknown> = { width, height }
  if (format) meta.format = format

  return {
    type: 'image',
    fileName,
    content: '',
    meta,
    images: [],
  }
}

/**
 * Video reader — local meta only (bytes + extension-derived format). For
 * content understanding (subtitles, caption, scene summary) load the
 * cloud-media-skill on demand.
 */
async function readVideoFile(
  absPath: string,
  fileName: string,
  bytes: number,
  _progress: ToolProgressEmitter,
): Promise<FileContentResult> {
  const ext = path.extname(absPath).toLowerCase().replace(/^\./, '') || 'unknown'
  const meta: Record<string, unknown> = { bytes, format: ext }
  return {
    type: 'video',
    fileName,
    content: '',
    meta,
    images: [],
  }
}

/**
 * Audio reader — local meta only (bytes + extension-derived format). For
 * speech-to-text / music analysis load the cloud-media-skill on demand.
 */
async function readAudioFile(
  absPath: string,
  fileName: string,
  bytes: number,
  _progress: ToolProgressEmitter,
): Promise<FileContentResult> {
  const ext = path.extname(absPath).toLowerCase().replace(/^\./, '') || 'unknown'
  const meta: Record<string, unknown> = { bytes, format: ext }
  return {
    type: 'audio',
    fileName,
    content: '',
    meta,
    images: [],
  }
}

// ─── Edit 工具 ─────────────────────────────────────────────────────────────

/** 精确字符串替换编辑文件。 */
export const editTool = tool({
  description: editToolDef.description,
  inputSchema: zodSchema(editToolDef.parameters),
  needsApproval: ({ file_path }: { file_path: string }) => !isFileInSandbox(file_path),
  execute: async ({
    file_path: filePath,
    old_string: oldString,
    new_string: newString,
    replace_all: replaceAll,
  }): Promise<string> => {
    // 校验 old_string 与 new_string 不同
    if (oldString === newString) {
      throw new Error('old_string and new_string must be different.')
    }

    const { absPath, rootPath } = await resolveWriteTargetPath(filePath)

    // Read-before-Write guard (Edit always targets an existing file).
    if (!isPlanFilePath(filePath)) {
      const stat = await fs.stat(absPath)
      await assertReadBeforeModify(absPath, stat.mtimeMs, 'edit')
    }

    // 读取文件
    const content = await fs.readFile(absPath, 'utf-8')

    // 统计出现次数
    let occurrences = 0
    let searchIndex = 0
    const matchLines: number[] = []
    while (true) {
      const pos = content.indexOf(oldString, searchIndex)
      if (pos === -1) break
      occurrences += 1
      // 计算所在行号（1-based）
      const lineNum = content.substring(0, pos).split('\n').length
      matchLines.push(lineNum)
      searchIndex = pos + oldString.length
    }

    // 没找到：尝试 trimEnd 容错
    if (occurrences === 0) {
      const trimmedOld = oldString.trimEnd()
      let trimOccurrences = 0
      searchIndex = 0
      const trimMatchLines: number[] = []
      // 按行匹配 trimEnd 后的内容
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.trimEnd().includes(trimmedOld)) {
          trimOccurrences += 1
          trimMatchLines.push(i + 1)
        }
      }
      if (trimOccurrences === 0) {
        throw new Error(
          `old_string not found in file. Make sure the string exactly matches the file content, including whitespace and indentation.`,
        )
      }
      // trimEnd 也只是提示，不自动执行替换
      throw new Error(
        `old_string not found (exact match). A trimmed version was found on line(s): ${trimMatchLines.join(', ')}. Please provide the exact string including trailing whitespace.`,
      )
    }

    // 非 replaceAll 且多次出现时报错
    if (!replaceAll && occurrences > 1) {
      throw new Error(
        `old_string appears ${occurrences} times in the file (lines: ${matchLines.join(', ')}). Use replace_all: true to replace all occurrences, or provide more context to make the match unique.`,
      )
    }

    // 执行替换
    let newContent: string
    if (replaceAll) {
      newContent = content.replaceAll(oldString, newString)
    } else {
      newContent = content.replace(oldString, newString)
    }

    // 解析 secret token 后写入
    newContent = resolveSecretTokens(newContent)
    await fs.writeFile(absPath, newContent, 'utf-8')

    // Snapshot post-edit state so subsequent Edits don't trip the mtime check.
    if (!isPlanFilePath(filePath)) {
      await recordPostWriteState(absPath, newContent)
    }

    const relativePath = path.relative(rootPath, absPath)
    const replacedCount = replaceAll ? occurrences : 1
    return `Edited ${relativePath}: replaced ${replacedCount} occurrence(s).`
  },
})

// ─── Write 工具 ────────────────────────────────────────────────────────────

/** 写入文件（创建新文件或完全覆盖）。 */
export const writeTool = tool({
  description: writeToolDef.description,
  inputSchema: zodSchema(writeToolDef.parameters),
  needsApproval: ({ file_path }: { file_path: string }) => !isFileInSandbox(file_path),
  execute: async ({
    file_path: filePath,
    content,
  }): Promise<string> => {
    const { absPath, rootPath } = await resolveWriteTargetPath(filePath)

    // Read-before-Write guard: only enforced when overwriting an existing file.
    // New file creation (ENOENT) is allowed without a prior Read.
    if (!isPlanFilePath(filePath)) {
      let existingMtimeMs: number | undefined
      try {
        const stat = await fs.stat(absPath)
        existingMtimeMs = stat.mtimeMs
      } catch (e: any) {
        if (e?.code !== 'ENOENT') throw e
      }
      if (existingMtimeMs !== undefined) {
        await assertReadBeforeModify(absPath, existingMtimeMs, 'write')
      }
    }

    // 自动创建父目录
    await fs.mkdir(path.dirname(absPath), { recursive: true })

    // 解析 secret token 后写入
    const resolvedContent = resolveSecretTokens(content)
    await fs.writeFile(absPath, resolvedContent, 'utf-8')

    // Snapshot post-write state so subsequent Edits/Writes don't trip the mtime check.
    if (!isPlanFilePath(filePath)) {
      await recordPostWriteState(absPath, resolvedContent)
    }

    const relativePath = path.relative(rootPath, absPath)
    return `Wrote file: ${relativePath}`
  },
})
