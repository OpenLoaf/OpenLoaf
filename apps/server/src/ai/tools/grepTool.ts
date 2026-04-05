/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { execFile, execFileSync } from 'node:child_process'
import { promises as fs, statSync } from 'node:fs'
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import { grepToolDef } from '@openloaf/api/types/tools/runtime'
import { resolveToolPath, resolveToolRoots } from '@/ai/tools/toolScope'

const DEFAULT_HEAD_LIMIT = 250
const TIMEOUT_MS = 30_000
// 压缩 HTML/JS 等单行巨长文件常见，放宽到 2000 并配合 --max-columns-preview，
// 让 rg 在超长匹配行上返回截断预览而非 `[Omitted long matching line]` 占位，
// 避免模型因"零命中假象"陷入更换 pattern 的死循环。
const MAX_COLUMNS = 2000
// 与 Claude Code 对齐：硬编码排除版本控制目录，避免 .git 噪声。
const VCS_DIRECTORIES_TO_EXCLUDE = [
  '.git',
  '.svn',
  '.hg',
  '.bzr',
  '.jj',
  '.sl',
] as const

/** 尝试查找 ripgrep 二进制路径。 */
function findRgBinary(): string | null {
  const candidates = ['rg', '/usr/local/bin/rg', '/opt/homebrew/bin/rg']
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['--version'], {
        timeout: 5000,
        stdio: 'pipe',
      })
      return bin
    } catch {
      // 未找到，尝试下一个
    }
  }
  return null
}

let cachedRgBin: string | null | undefined

function getRgBin(): string | null {
  if (cachedRgBin === undefined) {
    cachedRgBin = findRgBinary()
  }
  return cachedRgBin
}

interface PaginationResult<T> {
  items: T[]
  appliedLimit: number | undefined
  total: number
}

/**
 * 按 offset + head_limit 截断。与 Claude Code 对齐：
 * - `limit === 0` 表示无限（逃生舱）。
 * - 仅当实际发生截断时才报告 appliedLimit，提示模型可分页继续。
 */
function applyHeadLimit<T>(
  items: T[],
  limit: number | undefined,
  offset: number,
): PaginationResult<T> {
  const total = items.length
  if (limit === 0) {
    return { items: items.slice(offset), appliedLimit: undefined, total }
  }
  const effectiveLimit = limit ?? DEFAULT_HEAD_LIMIT
  const sliced = items.slice(offset, offset + effectiveLimit)
  const wasTruncated = total - offset > effectiveLimit
  return {
    items: sliced,
    appliedLimit: wasTruncated ? effectiveLimit : undefined,
    total,
  }
}

/** 格式化分页信息（仅当实际截断才附加）。 */
function formatLimitInfo(
  appliedLimit: number | undefined,
  appliedOffset: number,
): string {
  const parts: string[] = []
  if (appliedLimit !== undefined) parts.push(`limit: ${appliedLimit}`)
  if (appliedOffset) parts.push(`offset: ${appliedOffset}`)
  return parts.join(', ')
}

/** 将 glob 参数按空格/逗号拆分，保留 `{a,b}` 模式不被破坏。 */
function splitGlobPatterns(glob: string): string[] {
  const globPatterns: string[] = []
  const rawPatterns = glob.split(/\s+/)
  for (const rawPattern of rawPatterns) {
    if (!rawPattern) continue
    if (rawPattern.includes('{') && rawPattern.includes('}')) {
      globPatterns.push(rawPattern)
    } else {
      globPatterns.push(...rawPattern.split(',').filter(Boolean))
    }
  }
  return globPatterns
}

/** 将绝对路径转换为相对于基准目录的相对路径（省 token）。 */
function toRelativeFrom(base: string, absPath: string): string {
  const rel = path.relative(base, absPath)
  return rel === '' ? absPath : rel
}

/** 拆分 `filepath:line:content` 或 `filepath:count` 的前缀文件路径。 */
function splitPathPrefix(line: string): { filePath: string; rest: string } | null {
  const colonIndex = line.indexOf(':')
  if (colonIndex <= 0) return null
  return {
    filePath: line.substring(0, colonIndex),
    rest: line.substring(colonIndex),
  }
}

/** 内容搜索工具：基于 ripgrep 的全功能搜索（与 Claude Code Grep 对齐）。 */
export const grepTool = tool({
  description: grepToolDef.description,
  inputSchema: zodSchema(grepToolDef.parameters),
  needsApproval: false,
  execute: async (input): Promise<string> => {
    const {
      pattern,
      path: searchPath,
      glob: globPattern,
      type: fileType,
      output_mode: outputMode = 'files_with_matches',
      '-A': afterContext,
      '-B': beforeContext,
      '-C': contextLines,
      '-n': showLineNumbers = true,
      '-i': caseInsensitive,
      head_limit: headLimit,
      offset = 0,
      multiline,
    } = input as any

    // 解析搜索路径
    const { projectRoot, chatAssetRoot } = resolveToolRoots()
    let resolvedPath: string

    if (searchPath) {
      resolvedPath = resolveToolPath({ target: searchPath }).absPath
    } else if (projectRoot) {
      resolvedPath = projectRoot
    } else if (chatAssetRoot) {
      resolvedPath = chatAssetRoot
    } else {
      resolvedPath = resolveToolPath({ target: '.' }).absPath
    }

    // 预校验路径存在（与 Claude Code 对齐：对 ENOENT 给出清晰报错）。
    try {
      statSync(resolvedPath)
    } catch (e: any) {
      if (e?.code === 'ENOENT') {
        return `Path does not exist: ${searchPath ?? resolvedPath}`
      }
      throw e
    }

    const rgBin = getRgBin()
    if (!rgBin) {
      throw new Error(
        'ripgrep (rg) is not installed. Please install it first: brew install ripgrep',
      )
    }

    // 构建 rg 参数
    const args: string[] = ['--hidden']

    // 排除 VCS 目录
    for (const dir of VCS_DIRECTORIES_TO_EXCLUDE) {
      args.push('--glob', `!${dir}`)
    }

    // 限制单行最大列数 + 启用截断预览。当单行超长时，rg 会输出截断的匹配预览，
    // 而不是彻底省略成 `[Omitted long matching line]`，确保压缩/base64/minified
    // 文件也能拿到可读的上下文，避免模型陷入"换 pattern 重试"的死循环。
    args.push('--max-columns', String(MAX_COLUMNS))
    args.push('--max-columns-preview')

    // 多行模式（默认关闭）
    if (multiline) {
      args.push('-U', '--multiline-dotall')
    }

    // 大小写不敏感
    if (caseInsensitive) {
      args.push('-i')
    }

    // 输出模式
    switch (outputMode) {
      case 'files_with_matches':
        args.push('-l')
        break
      case 'count':
        args.push('-c')
        break
      case 'content':
        if (showLineNumbers !== false) args.push('-n')
        // -C/context 优先于 -A/-B。
        if (typeof contextLines === 'number') {
          args.push('-C', String(contextLines))
        } else {
          if (typeof beforeContext === 'number') args.push('-B', String(beforeContext))
          if (typeof afterContext === 'number') args.push('-A', String(afterContext))
        }
        break
    }

    // 文件类型
    if (fileType) {
      args.push('--type', fileType)
    }

    // glob 过滤（支持空格/逗号分隔与花括号模式）
    if (globPattern) {
      for (const g of splitGlobPatterns(globPattern)) {
        args.push('--glob', g)
      }
    }

    // pattern 若以 `-` 开头，用 -e 传递避免被当成参数。
    if (pattern.startsWith('-')) {
      args.push('-e', pattern)
    } else {
      args.push(pattern)
    }

    args.push(resolvedPath)

    return new Promise<string>((resolve, reject) => {
      execFile(
        rgBin,
        args,
        { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
        async (err, stdout, stderr) => {
          // rg exit code 1 = 无匹配
          if (err && (err as any).code === 1 && !stdout) {
            resolve(
              outputMode === 'files_with_matches' ? 'No files found' : 'No matches found',
            )
            return
          }
          if (err && (err as any).code === 2) {
            const msg = stderr?.trim() || err.message
            resolve(`Grep error: ${msg}`)
            return
          }
          if (err && (err as any).code !== 1) {
            reject(new Error(`rg failed: ${err.message}`))
            return
          }

          const rawLines = stdout.trim().split('\n').filter(Boolean)
          if (rawLines.length === 0) {
            resolve(
              outputMode === 'files_with_matches' ? 'No files found' : 'No matches found',
            )
            return
          }

          const baseForRelative = projectRoot ?? chatAssetRoot ?? resolvedPath

          // -------------------------------------------------------------
          // files_with_matches：按 mtime 排序 → 截断 → 转相对路径
          // -------------------------------------------------------------
          if (outputMode === 'files_with_matches') {
            const stats = await Promise.allSettled(
              rawLines.map((p) => fs.stat(p)),
            )
            const sorted = rawLines
              .map((p, i) => {
                const r = stats[i]!
                const mtime =
                  r.status === 'fulfilled' ? (r.value.mtimeMs ?? 0) : 0
                return [p, mtime] as const
              })
              .sort((a, b) => {
                const t = b[1] - a[1]
                if (t === 0) return a[0].localeCompare(b[0])
                return t
              })
              .map((x) => x[0])

            const { items, appliedLimit, total } = applyHeadLimit(
              sorted,
              headLimit,
              offset,
            )

            if (items.length === 0) {
              resolve(`No results in the requested range (total: ${total}).`)
              return
            }

            const relative = items.map((p) => toRelativeFrom(baseForRelative, p))
            const limitInfo = formatLimitInfo(appliedLimit, offset)
            const header = `Found ${total} ${total === 1 ? 'file' : 'files'}${limitInfo ? ` ${limitInfo}` : ''}`
            resolve(`${header}\n${relative.join('\n')}`)
            return
          }

          // -------------------------------------------------------------
          // content / count：先分页再转相对路径
          // -------------------------------------------------------------
          const { items, appliedLimit, total } = applyHeadLimit(
            rawLines,
            headLimit,
            offset,
          )

          if (items.length === 0) {
            resolve(`No results in the requested range (total: ${total}).`)
            return
          }

          const relativeLines = items.map((line) => {
            const sp = splitPathPrefix(line)
            if (!sp) return line
            return toRelativeFrom(baseForRelative, sp.filePath) + sp.rest
          })

          const content = relativeLines.join('\n')
          const limitInfo = formatLimitInfo(appliedLimit, offset)

          if (outputMode === 'count') {
            let totalMatches = 0
            let fileCount = 0
            for (const line of relativeLines) {
              const colonIndex = line.lastIndexOf(':')
              if (colonIndex > 0) {
                const n = parseInt(line.substring(colonIndex + 1), 10)
                if (!Number.isNaN(n)) {
                  totalMatches += n
                  fileCount += 1
                }
              }
            }
            const summary = `\n\nFound ${totalMatches} total ${totalMatches === 1 ? 'occurrence' : 'occurrences'} across ${fileCount} ${fileCount === 1 ? 'file' : 'files'}.${limitInfo ? ` with pagination = ${limitInfo}` : ''}`
            resolve(content + summary)
            return
          }

          // content 模式
          if (limitInfo) {
            resolve(`${content}\n\n[Showing results with pagination = ${limitInfo}]`)
          } else {
            resolve(content)
          }
        },
      )
    })
  },
})
