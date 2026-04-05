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
import path from 'node:path'
import {
  getProjectRootPath,
  resolveFilePathFromUri,
} from '@openloaf/api/services/vfsService'
import { getResolvedTempStorageDir } from '@openloaf/api/services/appConfigService'

/** Scoped project path matcher for [projectId]/path/to/dir (unwrapped). */
const PROJECT_SCOPE_REGEX = /^@?\[([^\]]+)\]\/(.+)$/

/** Normalize a target path into a directory, using an extension checker to decide if a path looks like a file. */
export async function normalizeSaveDirectory(
  targetPath: string,
  isKnownExtension: (ext: string) => boolean,
): Promise<string> {
  try {
    const stat = await fs.stat(targetPath)
    // 已存在文件时使用其所在目录，避免覆盖文件。
    if (stat.isFile()) return path.dirname(targetPath)
    return targetPath
  } catch {
    const ext = path.extname(targetPath).toLowerCase()
    // 兼容传入文件路径时自动取目录。
    if (isKnownExtension(ext)) return path.dirname(targetPath)
    return targetPath
  }
}

/** Resolve local directory from a project-relative path. */
export function resolveRelativeSaveDirectory(input: {
  /** Relative path input. */
  path: string
  /** Optional project id. */
  projectId?: string | null
}): string | null {
  const normalized = input.path
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '')
  if (!normalized) return null
  if (normalized.split('/').some((segment) => segment === '..')) return null
  // 逻辑：有 projectId 时解析到项目根目录；否则回退到全局临时存储目录。
  const rootPath = input.projectId
    ? getProjectRootPath(input.projectId)
    : getResolvedTempStorageDir()
  if (!rootPath) return null

  const targetPath = path.resolve(rootPath, normalized)
  const rootPathResolved = path.resolve(rootPath)
  // 限制在根目录内，避免路径穿越。
  if (
    targetPath !== rootPathResolved &&
    !targetPath.startsWith(rootPathResolved + path.sep)
  ) {
    return null
  }
  return targetPath
}

/** Generic resolve save directory from a raw uri string. */
export async function resolveSaveDirectory(input: {
  /** Raw save directory uri. */
  saveDir: string
  /** Optional project id fallback. */
  projectId?: string | null
  /** Extension checker for normalize step. */
  isKnownExtension: (ext: string) => boolean
}): Promise<string | null> {
  const raw = input.saveDir.trim()
  if (!raw) return null

  if (raw.startsWith('file://')) {
    try {
      const filePath = resolveFilePathFromUri(raw)
      return normalizeSaveDirectory(filePath, input.isKnownExtension)
    } catch {
      return null
    }
  }

  const scopeMatch = raw.match(PROJECT_SCOPE_REGEX)
  if (scopeMatch) {
    const scopedProjectId = scopeMatch[1]?.trim()
    const scopedRelativePath = scopeMatch[2] ?? ''
    if (!scopedProjectId) return null
    const dirPath = resolveRelativeSaveDirectory({
      path: scopedRelativePath,
      projectId: scopedProjectId,
    })
    if (!dirPath) return null
    return normalizeSaveDirectory(dirPath, input.isKnownExtension)
  }

  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    const dirPath = resolveRelativeSaveDirectory({
      path: raw,
      projectId: input.projectId,
    })
    if (!dirPath) return null
    return normalizeSaveDirectory(dirPath, input.isKnownExtension)
  }

  return null
}
