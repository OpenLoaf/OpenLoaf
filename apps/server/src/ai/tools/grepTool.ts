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
import { tool, zodSchema } from 'ai'
import { grepToolDef } from '@openloaf/api/types/tools/runtime'
import { resolveToolPath, resolveToolRoots } from '@/ai/tools/toolScope'

const DEFAULT_HEAD_LIMIT = 250
const TIMEOUT_MS = 30_000

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

/** 对输出按 offset + head_limit 截断。 */
function applyPagination(lines: string[], offset: number, headLimit: number): {
  selected: string[]
  total: number
} {
  const total = lines.length
  const start = Math.min(offset, total)
  const selected = lines.slice(start, start + headLimit)
  return { selected, total }
}

/** 内容搜索工具：基于 ripgrep 的全功能搜索。 */
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
      head_limit: headLimit = DEFAULT_HEAD_LIMIT,
      offset = 0,
      multiline,
    } = input as any

    // 解析搜索路径
    const { projectRoot } = resolveToolRoots()
    let resolvedPath: string

    if (searchPath) {
      resolvedPath = resolveToolPath({ target: searchPath }).absPath
    } else if (projectRoot) {
      resolvedPath = projectRoot
    } else {
      resolvedPath = resolveToolPath({ target: '.' }).absPath
    }

    const rgBin = getRgBin()
    if (!rgBin) {
      throw new Error('ripgrep (rg) is not installed. Please install it first: brew install ripgrep')
    }

    // 构建 rg 参数
    const args: string[] = []

    // 输出模式
    switch (outputMode) {
      case 'files_with_matches':
        args.push('--files-with-matches', '--sortr=modified')
        break
      case 'content':
        if (showLineNumbers !== false) args.push('-n')
        if (typeof afterContext === 'number') args.push('-A', String(afterContext))
        if (typeof beforeContext === 'number') args.push('-B', String(beforeContext))
        if (typeof contextLines === 'number') args.push('-C', String(contextLines))
        break
      case 'count':
        args.push('--count')
        break
    }

    // glob 过滤
    if (globPattern) {
      args.push('--glob', globPattern)
    }

    // 文件类型
    if (fileType) {
      args.push('--type', fileType)
    }

    // 大小写不敏感
    if (caseInsensitive) {
      args.push('--ignore-case')
    }

    // 多行模式
    if (multiline) {
      args.push('-U', '--multiline-dotall')
    }

    // 搜索模式和路径
    args.push('--regexp', pattern, resolvedPath)

    return new Promise<string>((resolve, reject) => {
      execFile(
        rgBin,
        args,
        { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          // rg exit code 1 = 无匹配
          if (err && (err as any).code === 1 && !stdout) {
            resolve('No matches found.')
            return
          }
          if (err && (err as any).code === 2) {
            // 正则语法错误等
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
            resolve('No matches found.')
            return
          }

          // 应用分页截断
          const { selected, total } = applyPagination(rawLines, offset, headLimit)

          if (selected.length === 0) {
            resolve(`No results in the requested range (total: ${total}).`)
            return
          }

          const result = selected.join('\n')
          const shownEnd = offset + selected.length

          if (shownEnd < total) {
            resolve(`${result}\n... (showing ${offset + 1}-${shownEnd} of ${total} results)`)
          } else {
            resolve(result)
          }
        },
      )
    })
  },
})
