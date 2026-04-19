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
} from '@/ai/shared/context/requestContext'
import {
  getProjectRootPath,
} from '@openloaf/api/services/vfsService'
import { getOpenLoafRootDir } from '@openloaf/config'
import { ensureWritableRoot } from '@/ai/tools/toolScope'
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
          + '<span className="rounded-full bg-ol-green/10 px-2.5 py-0.5 text-xs text-ol-green">已完成</span>'
          + '</div>'
          + '<div className="space-y-2">'
          + '<div className="flex items-center justify-between bg-muted p-3 rounded-lg">'
          + '<span className="text-xs text-foreground">图片文件整理</span>'
          + '<span className="rounded-full bg-ol-blue/10 px-2 py-0.5 text-[10px] text-ol-blue">images/</span>'
          + '</div>'
          + '<div className="flex items-center justify-between bg-muted p-3 rounded-lg">'
          + '<span className="text-xs text-foreground">文档归档</span>'
          + '<span className="rounded-full bg-ol-purple/10 px-2 py-0.5 text-[10px] text-ol-purple">docs/</span>'
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

    const projectId = getProjectId()
    let rootPath: string
    if (projectId) {
      const projRoot = getProjectRootPath(projectId)
      if (!projRoot) throw new Error('Project not found.')
      rootPath = projRoot
    } else {
      const writable = await ensureWritableRoot()
      rootPath = writable.rootPath
    }

    // 剥除 JSX 注释 `{/* ... */}` —— 渲染层 react-jsx-parser 不支持
    // JSXEmptyExpression，整个卡片会崩成红色 error 卡。注释是模型的无害
    // 装饰，静默剥掉最平滑；裸 `{}` 不在这里处理，留给 validator 报错
    // 让模型看到反馈。只剥单行注释 `{/* ... */}`，不碰形如 `<Foo bar={{}} />`
    // 的空 object literal（那是合法 JSX）。
    const jsx = input.content.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')

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
      throw new Error(
        `${msg} 已写入文件 ${absPath}。` +
          `**优先重新调用 JsxCreate 提交完整修正内容**（JSX 片段整体重写比局部 Edit 更可靠，也不会陷入 Glob/Read 循环）；` +
          `如果确定只是个别字符问题才用 Edit 改该绝对路径。` +
          `注意：JSX 片段顶层必须是元素节点，禁止用 \`() => { ... }()\` 立即执行函数或任何 const/let/function 包裹。`,
      )
    }

    return {
      ok: true,
      path: posixPath,
      messageId,
    }
  },
})
