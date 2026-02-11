import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import { generateWidgetToolDef } from '@tenas-ai/api/types/tools/widget'
import { getProjectRootPath, getWorkspaceRootPathById } from '@tenas-ai/api/services/vfsService'
import {
  getProjectId,
  getWorkspaceId,
} from '@/ai/shared/context/requestContext'
import { logger } from '@/common/logger'

/** Resolve the dynamic widgets root directory with projectId → workspaceId fallback. */
function getDynamicWidgetsDir(): string {
  const projectId = getProjectId()
  if (projectId) {
    const projectRoot = getProjectRootPath(projectId)
    if (!projectRoot) {
      throw new Error(`Project not found: ${projectId}`)
    }
    return path.join(projectRoot, '.tenas', 'dynamic-widgets')
  }
  const workspaceId = getWorkspaceId()
  if (workspaceId) {
    const workspaceRoot = getWorkspaceRootPathById(workspaceId)
    if (!workspaceRoot) {
      throw new Error(`Workspace not found: ${workspaceId}`)
    }
    return path.join(workspaceRoot, '.tenas', 'dynamic-widgets')
  }
  throw new Error('projectId or workspaceId is required to generate a widget.')
}

export const generateWidgetTool = tool({
  description: generateWidgetToolDef.description,
  inputSchema: zodSchema(generateWidgetToolDef.parameters),
  execute: async ({
    widgetId,
    packageJson,
    widgetTsx,
    functionsTs,
    dotEnv,
  }): Promise<string> => {
    const widgetDir = path.join(getDynamicWidgetsDir(), widgetId)
    await fs.mkdir(widgetDir, { recursive: true })

    // 写入所有 widget 文件。
    const files: [string, string][] = [
      ['package.json', packageJson],
      ['widget.tsx', widgetTsx],
      ['functions.ts', functionsTs],
    ]
    if (dotEnv) {
      files.push(['.env', dotEnv])
    }

    for (const [filename, content] of files) {
      await fs.writeFile(path.join(widgetDir, filename), content, 'utf-8')
    }

    logger.info({ widgetId, widgetDir }, 'Dynamic widget generated')

    // 解析 package.json 获取名称用于返回信息。
    let widgetName = widgetId
    try {
      const pkg = JSON.parse(packageJson)
      widgetName = pkg.name || pkg.description || widgetId
    } catch {
      // 忽略解析错误。
    }

    const hasEnv = Boolean(dotEnv?.includes('='))
    const envHint = hasEnv
      ? `\n\n注意：Widget 包含 .env 文件，请编辑 ${widgetDir}/.env 填入真实的 API Key。`
      : ''

    return `Widget "${widgetName}" 已生成到 ${widgetDir}。可在桌面组件库的"AI 生成"区域找到并添加到桌面。${envHint}`
  },
})