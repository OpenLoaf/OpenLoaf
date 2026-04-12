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

const MAX_LINE_LENGTH = 500
const DEFAULT_READ_LIMIT = 2000
/** Chunk size (in UTF-8 bytes) used when splitting a line that exceeds MAX_LINE_LENGTH. */
const LONG_LINE_CHUNK_BYTES = 2000
/** Overall output byte budget to prevent minified single-line files from exploding context. */
const MAX_READ_OUTPUT_BYTES = 80_000

/** 常见二进制文件扩展名，读取时直接拒绝。 */
const BINARY_FILE_EXTENSIONS = new Set([
  '.7z', '.avi', '.bin', '.bmp', '.bz2', '.dat', '.db', '.dll',
  '.dmg', '.doc', '.docx', '.exe', '.flac', '.gif', '.gz', '.iso',
  '.jar', '.jpeg', '.jpg', '.mkv', '.mov', '.mp3', '.mp4', '.ogg',
  '.otf', '.pdf', '.png', '.ppt', '.pptx', '.psd', '.rar', '.so',
  '.sqlite', '.tar', '.ttf', '.wav', '.webm', '.webp', '.xls',
  '.xlsx', '.xz', '.zip',
])

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

  // 剥离 @[...] 或 @ 前缀
  let normalized: string
  if (trimmed.startsWith('@[') && trimmed.endsWith(']')) {
    normalized = trimmed.slice(2, -1)
  } else if (trimmed.startsWith('@')) {
    normalized = trimmed.slice(1)
  } else {
    normalized = trimmed
  }
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

/** 检查路径是否为已屏蔽的二进制扩展名。 */
function hasBlockedBinaryExtension(targetPath: string): boolean {
  const ext = path.extname(targetPath).toLowerCase()
  return Boolean(ext) && BINARY_FILE_EXTENSIONS.has(ext)
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
  }
  recordRead(sessionId, absPath, entry)
}

// ─── Read 工具 ─────────────────────────────────────────────────────────────

/** 读取文件内容，返回带行号的文本。 */
export const readTool = tool({
  description: readToolDef.description,
  inputSchema: zodSchema(readToolDef.parameters),
  needsApproval: false,
  execute: async ({
    file_path: filePath,
    offset,
    limit,
    pages,
  }): Promise<string> => {
    const { absPath } = resolveToolPath({ target: filePath })

    // 二进制文件检查：引导使用专用工具
    if (hasBlockedBinaryExtension(absPath)) {
      const ext = path.extname(absPath).toLowerCase()
      if (ext === '.xlsx' || ext === '.xls') {
        throw new Error('This file is in Excel format. Use ToolSearch(names: "ExcelQuery") to load the ExcelQuery tool, then use it to read this file.')
      }
      if (ext === '.docx' || ext === '.doc') {
        throw new Error('This file is in Word format. Use ToolSearch(names: "WordQuery") to load the WordQuery tool, then use it to read this file.')
      }
      if (ext === '.pdf') {
        throw new Error('This file is in PDF format. Use ToolSearch(names: "PdfQuery") to load the PdfQuery tool, then use it to read this file.')
      }
      if (ext === '.pptx' || ext === '.ppt') {
        throw new Error('This file is in PowerPoint format. Use ToolSearch(names: "PptxQuery") to load the PptxQuery tool, then use it to read this file.')
      }
      throw new Error('Only text files are supported; binary file extensions are not allowed.')
    }

    // PDF pages 参数提示（尚未实现原生 PDF 解析）
    if (pages) {
      throw new Error('PDF reading is not yet implemented natively. Use ToolSearch(names: "PdfQuery") to load the PdfQuery tool.')
    }

    const stat = await fs.stat(absPath)
    if (!stat.isFile()) throw new Error('Path is not a file.')

    const raw = await fs.readFile(absPath, 'utf-8')
    const lines = splitLines(raw)
    const resolvedOffset = typeof offset === 'number' ? offset : 1
    const resolvedLimit = typeof limit === 'number' ? limit : DEFAULT_READ_LIMIT

    if (resolvedOffset <= 0) throw new Error('offset must be a 1-indexed line number')
    if (resolvedLimit <= 0) throw new Error('limit must be greater than zero')
    if (lines.length > 0 && resolvedOffset > lines.length) throw new Error('offset exceeds file length')

    const startIndex = resolvedOffset - 1
    const endIndex = Math.min(startIndex + resolvedLimit, lines.length)
    const result: string[] = []
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
        result.push(entry)
        outputBytes += entry.length + 1
        lastEmittedLineIndex = i
        continue
      }
      // Long line → split into byte-range chunks so the model can see the full
      // content across multiple labeled slices instead of losing everything
      // past MAX_LINE_LENGTH. Label: `<lineNum>[<start>-<end>/<total>]`.
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
        result.push(entry)
        outputBytes += entry.length + 1
      }
      lastEmittedLineIndex = i
    }

    // Claude Code-style non-negative range metadata: tells the model exactly
    // what it has and how to get more, avoiding the "truncated = data lost"
    // misinterpretation that triggers retry loops.
    const meta: string[] = []
    const displayedStart = resolvedOffset
    const displayedEnd = Math.min(lastEmittedLineIndex + 1, endIndex)
    if (lines.length === 0) {
      meta.push('Empty file (0 lines).')
    } else if (displayedStart === 1 && displayedEnd === lines.length && budgetExhaustedAtLine === null) {
      meta.push(`Displaying all ${lines.length} lines of the file.`)
    } else {
      meta.push(
        `Displaying lines ${displayedStart}-${displayedEnd} of ${lines.length} total. Use offset/limit to read other parts.`,
      )
    }
    if (longLineCount > 0) {
      meta.push(
        `Note: ${longLineCount} line(s) exceeded ${MAX_LINE_LENGTH} bytes and were split into ${chunkedLineCount} chunks of up to ${LONG_LINE_CHUNK_BYTES} bytes each (labels: "<line>[chars A-B/total]"). The file on disk is unchanged.`,
      )
      // Heuristic: very few lines with huge length → minified/compressed file.
      // Nudge the model toward Bash tools instead of looping on Read/Grep.
      if (lines.length < 20) {
        meta.push(
          'This looks like a minified/single-line file. For structural extraction prefer `Bash` with `grep -oE`, `sed`, `cut`, or `tr` over Read/Grep.',
        )
      }
    }
    if (budgetExhaustedAtLine !== null) {
      meta.push(
        `Output capped at ~${MAX_READ_OUTPUT_BYTES} bytes to protect context; stopped inside line ${budgetExhaustedAtLine}. Call Read again with offset=${budgetExhaustedAtLine} to continue, or use Bash for targeted extraction.`,
      )
    }

    // Record Read state for subsequent Write/Edit guard checks (bypass PLAN files).
    const sessionId = getSessionId()
    if (sessionId && !isPlanFilePath(filePath)) {
      recordRead(sessionId, absPath, {
        mtime: Math.floor(stat.mtimeMs),
        offset: resolvedOffset,
        limit: resolvedLimit,
        totalLines: lines.length,
        isPartialView: endIndex < lines.length,
        recordedAt: Date.now(),
      })
    }

    return [...result, '', meta.join(' ')].join('\n')
  },
})

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
