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
import { resolveToolPath, ensureTempProject } from '@/ai/tools/toolScope'
import { resolveSecretTokens } from '@/ai/tools/secretStore'
import { getProjectId } from '@/ai/shared/context/requestContext'
import { getProjectRootPath } from '@openloaf/api/services/vfsService'

const MAX_LINE_LENGTH = 500
const DEFAULT_READ_LIMIT = 2000

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

/** 解析写入目标路径，确保在项目 scope 内。未绑定项目时自动创建临时项目。 */
async function resolveWriteTargetPath(targetPath: string): Promise<{ absPath: string; rootPath: string }> {
  let projectId = getProjectId()
  let rootPath = projectId
    ? getProjectRootPath(projectId)
    : undefined

  // 无项目 scope 时自动创建临时项目
  if (!rootPath) {
    if (!projectId) {
      const temp = await ensureTempProject()
      projectId = temp.projectId
      rootPath = temp.projectRoot
    } else {
      throw new Error('Project not found.')
    }
  }

  const trimmed = targetPath.trim()
  if (!trimmed) throw new Error('file_path is required.')
  if (trimmed.startsWith('file:')) throw new Error('file:// URIs are not allowed.')

  // 剥离 @{...} 或 @ 前缀
  let normalized: string
  if (trimmed.startsWith('@{') && trimmed.endsWith('}')) {
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

/** 按最大字节长度截断字符串，不破坏多字节字符。 */
function truncateLine(line: string, maxLength: number): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= maxLength) return line
  const end = clampUtf8End(bytes, maxLength)
  return bytes.toString('utf8', 0, end)
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
    if (resolvedOffset > lines.length) throw new Error('offset exceeds file length')

    const startIndex = resolvedOffset - 1
    const endIndex = Math.min(startIndex + resolvedLimit, lines.length)
    const result: string[] = []
    for (let i = startIndex; i < endIndex; i++) {
      const lineNum = i + 1
      const display = truncateLine(lines[i]!, MAX_LINE_LENGTH)
      result.push(`${lineNum}\t${display}`)
    }
    return result.join('\n')
  },
})

// ─── Edit 工具 ─────────────────────────────────────────────────────────────

/** 精确字符串替换编辑文件。 */
export const editTool = tool({
  description: editToolDef.description,
  inputSchema: zodSchema(editToolDef.parameters),
  needsApproval: true,
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
  needsApproval: true,
  execute: async ({
    file_path: filePath,
    content,
  }): Promise<string> => {
    const { absPath, rootPath } = await resolveWriteTargetPath(filePath)

    // 自动创建父目录
    await fs.mkdir(path.dirname(absPath), { recursive: true })

    // 解析 secret token 后写入
    const resolvedContent = resolveSecretTokens(content)
    await fs.writeFile(absPath, resolvedContent, 'utf-8')

    const relativePath = path.relative(rootPath, absPath)
    return `Wrote file: ${relativePath}`
  },
})
