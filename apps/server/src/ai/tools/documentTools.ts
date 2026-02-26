/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport path from "node:path"
import { promises as fs } from "node:fs"
import { tool, zodSchema } from "ai"
import { editDocumentToolDef } from "@openloaf/api/types/tools/runtime"
import { resolveToolPath } from "@/ai/tools/toolScope"
import { readBasicConf } from "@/modules/settings/openloafConfStore"
import { getProjectId, getWorkspaceId } from "@/ai/shared/context/requestContext"
import { getProjectRootPath, getWorkspaceRootPathById } from "@openloaf/api/services/vfsService"

const DOC_FOLDER_PREFIX = "tndoc_"
const DOC_INDEX_FILE_NAME = "index.mdx"

/** Resolve the index.mdx path from a document folder or file path. */
function resolveDocIndexPath(targetPath: string): string {
  const trimmed = targetPath.trim()
  // 逻辑：如果路径已指向 index.mdx 则直接使用，否则拼接。
  if (trimmed.endsWith(`/${DOC_INDEX_FILE_NAME}`) || trimmed === DOC_INDEX_FILE_NAME) {
    return trimmed
  }
  const baseName = path.basename(trimmed)
  if (baseName.toLowerCase().startsWith(DOC_FOLDER_PREFIX.toLowerCase())) {
    return path.join(trimmed, DOC_INDEX_FILE_NAME)
  }
  return trimmed
}

/** Resolve write target path within project scope. */
function resolveWriteTargetPath(targetPath: string): { absPath: string; rootPath: string } {
  const workspaceId = getWorkspaceId()
  if (!workspaceId) throw new Error("workspaceId is required.")
  const projectId = getProjectId()
  const rootPath = projectId
    ? getProjectRootPath(projectId, workspaceId)
    : getWorkspaceRootPathById(workspaceId)
  if (!rootPath) {
    throw new Error(projectId ? "Project not found." : "Workspace not found.")
  }

  const trimmed = targetPath.trim()
  if (!trimmed) throw new Error("path is required.")
  if (trimmed.startsWith("file:")) throw new Error("file:// URIs are not allowed.")
  if (trimmed.startsWith("@[")) throw new Error("Project-scoped paths are not allowed.")
  const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed
  if (!normalized.trim()) throw new Error("path is required.")

  const resolvedRoot = path.resolve(rootPath)
  const absPath = path.isAbsolute(normalized)
    ? path.resolve(normalized)
    : path.resolve(resolvedRoot, normalized)
  return { absPath, rootPath: resolvedRoot }
}

/** Execute edit-document tool: write MDX content to a document's index.mdx. */
export const editDocumentTool = tool({
  description: editDocumentToolDef.description,
  inputSchema: zodSchema(editDocumentToolDef.parameters),
  execute: async ({ path: filePath, content }): Promise<string> => {
    const docPath = resolveDocIndexPath(filePath)
    const { absPath, rootPath } = resolveWriteTargetPath(docPath)
    const dirPath = path.dirname(absPath)
    // 逻辑：写入前确保目录存在。
    await fs.mkdir(dirPath, { recursive: true })
    const existing = await fs.stat(absPath).catch(() => null)
    if (existing?.isDirectory()) throw new Error("Path is a directory.")
    await fs.writeFile(absPath, content, "utf-8")
    const relative = path.relative(rootPath, absPath) || path.basename(absPath)
    return `Wrote document: ${relative}`
  },
})
