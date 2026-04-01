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
import { globToolDef } from '@openloaf/api/types/tools/runtime'
import picomatch from 'picomatch'
import { resolveToolPath, resolveToolRoots } from '@/ai/tools/toolScope'
import { buildGitignoreMatcher } from '@/ai/tools/gitignoreMatcher'

const DEFAULT_LIMIT = 250

/** 固定排除的目录名，不递归进入。 */
const ALWAYS_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.DS_Store',
  '.openloaf',
  '.openloaf-cache',
  '.turbo',
])

type FileEntry = {
  /** 相对于搜索根的路径 */
  relativePath: string
  /** 文件最后修改时间 */
  mtimeMs: number
}

/** 递归遍历目录，收集匹配 glob 的文件列表。 */
async function walkDir(
  basePath: string,
  currentPath: string,
  isMatch: (p: string) => boolean,
  ignoreMatcher: import('ignore').Ignore | null,
  results: FileEntry[],
  limit: number,
): Promise<void> {
  if (results.length >= limit) return

  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (results.length >= limit) return

    const entryName = entry.name
    // 固定跳过的目录/文件
    if (ALWAYS_SKIP_DIRS.has(entryName)) continue

    const fullPath = path.join(currentPath, entryName)
    const relativePath = path.relative(basePath, fullPath).split(path.sep).join('/')

    // .gitignore 过滤
    if (ignoreMatcher) {
      const ignoreTarget = entry.isDirectory() ? `${relativePath}/` : relativePath
      if (ignoreMatcher.ignores(ignoreTarget)) continue
    }

    if (entry.isDirectory()) {
      await walkDir(basePath, fullPath, isMatch, ignoreMatcher, results, limit)
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      if (isMatch(relativePath)) {
        try {
          const stat = await fs.stat(fullPath)
          results.push({ relativePath, mtimeMs: stat.mtimeMs })
        } catch {
          // 文件可能已被删除，跳过
        }
      }
    }
  }
}

/** 文件搜索工具：按 glob 模式匹配文件，按修改时间排序返回。 */
export const globTool = tool({
  description: globToolDef.description,
  inputSchema: zodSchema(globToolDef.parameters),
  needsApproval: false,
  execute: async ({
    pattern,
    path: searchPath,
  }): Promise<string> => {
    // 解析搜索目录
    const { projectRoot } = resolveToolRoots()
    let basePath: string

    if (searchPath) {
      basePath = resolveToolPath({ target: searchPath }).absPath
    } else if (projectRoot) {
      basePath = projectRoot
    } else {
      basePath = resolveToolPath({ target: '.' }).absPath
    }

    // 确认目录存在
    const stat = await fs.stat(basePath)
    if (!stat.isDirectory()) {
      throw new Error('path is not a directory.')
    }

    // 构建 gitignore matcher
    const ignoreMatcher = await buildGitignoreMatcher({ rootPath: basePath })

    // 构建 glob matcher
    const isMatch = picomatch(pattern)

    // 递归遍历
    const results: FileEntry[] = []
    await walkDir(basePath, basePath, isMatch, ignoreMatcher, results, DEFAULT_LIMIT * 2)

    if (results.length === 0) {
      return 'No files matched the pattern.'
    }

    // 按修改时间排序（最新在前）
    results.sort((a, b) => b.mtimeMs - a.mtimeMs)

    // 截断到限制
    const truncated = results.slice(0, DEFAULT_LIMIT)
    const output = truncated.map((r) => r.relativePath).join('\n')

    if (results.length > DEFAULT_LIMIT) {
      return `${output}\n... (${results.length - DEFAULT_LIMIT} more files, showing first ${DEFAULT_LIMIT})`
    }
    return output
  },
})
