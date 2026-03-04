/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { tool, zodSchema } from 'ai'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { jsxCreateToolDef } from '@openloaf/api/types/tools/jsxCreate'
import {
  getAssistantMessageId,
  getProjectId,
  getSessionId,
  getWorkspaceId,
} from '@/ai/shared/context/requestContext'
import {
  getProjectRootPath,
  getWorkspaceRootPathById,
} from '@openloaf/api/services/vfsService'
import { resolveMessagesJsonlPath } from '@/ai/services/chat/repositories/chatFileStore'
import { validateJsxCreateInput } from '@/ai/tools/jsxCreateValidator'

type JsxCreateOutput = {
  /** Whether tool execution succeeded. */
  ok: true
  /** Relative file path for the JSX artifact. */
  path: string
  /** Assistant message id used for file naming. */
  messageId: string
}

/** Convert a platform-specific path to posix format. */
function toPosixPath(input: string): string {
  return input.split(path.sep).join('/')
}

/** JSX create tool. */
export const jsxCreateTool = tool({
  description: jsxCreateToolDef.description,
  inputSchema: zodSchema(jsxCreateToolDef.parameters),
  inputExamples: [
    {
      input: {
        content:
          '<div className="p-4 bg-card rounded-xl">'
          + '<div className="flex items-center gap-2 mb-3">'
          + '<h3 className="font-semibold text-sm text-card-foreground">任务状态</h3>'
          + '<span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-600">已完成</span>'
          + '</div>'
          + '<div className="space-y-2">'
          + '<div className="flex items-center justify-between bg-muted p-3 rounded-lg">'
          + '<span className="text-xs text-foreground">图片文件整理</span>'
          + '<span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-600">images/</span>'
          + '</div>'
          + '<div className="flex items-center justify-between bg-muted p-3 rounded-lg">'
          + '<span className="text-xs text-foreground">文档归档</span>'
          + '<span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-600">docs/</span>'
          + '</div>'
          + '</div></div>',
      },
    },
  ],
  execute: async (input: { content: string }): Promise<JsxCreateOutput> => {
    const sessionId = getSessionId()
    if (!sessionId) throw new Error('sessionId is required.')
    const messageId = getAssistantMessageId()
    if (!messageId) throw new Error('assistantMessageId is required.')

    const workspaceId = getWorkspaceId()
    if (!workspaceId) throw new Error('workspaceId is required.')
    const projectId = getProjectId()
    const rootPath = projectId
      ? getProjectRootPath(projectId, workspaceId)
      : getWorkspaceRootPathById(workspaceId)
    if (!rootPath) throw new Error(projectId ? 'Project not found.' : 'Workspace not found.')

    const jsx = input.content

    // 逻辑：根据 session 目录写入 jsx 文件，文件名固定为 messageId.jsx。
    const messagesPath = await resolveMessagesJsonlPath(sessionId)
    const sessionDir = path.dirname(messagesPath)
    const jsxDir = path.join(sessionDir, 'jsx')
    await fs.mkdir(jsxDir, { recursive: true })
    const absPath = path.join(jsxDir, `${messageId}.jsx`)
    await fs.writeFile(absPath, jsx, 'utf-8')

    const relativePath = path.relative(rootPath, absPath)
    const posixPath = toPosixPath(relativePath)

    try {
      // 逻辑：服务端校验 JSX，发现问题直接抛错让模型纠正。
      validateJsxCreateInput(jsx)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`${msg} 已写入文件：${posixPath}，请使用 apply-patch 修正。`)
    }

    return {
      ok: true,
      path: posixPath,
      messageId,
    }
  },
})
