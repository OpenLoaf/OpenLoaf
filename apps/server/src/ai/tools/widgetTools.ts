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
import { tool, zodSchema } from 'ai'
import {
  generateWidgetToolDef,
  widgetCheckToolDef,
  widgetGetToolDef,
  widgetInitToolDef,
  widgetListToolDef,
} from '@openloaf/api/types/tools/widget'
import {
  getProjectRootPath,
  getWorkspaceRootPathById,
} from '@openloaf/api/services/vfsService'
import {
  getProjectId,
  getWorkspaceId,
} from '@/ai/shared/context/requestContext'
import { logger } from '@/common/logger'
import { compileWidget } from '@/modules/dynamic-widget/widgetCompiler'
import {
  renderDotEnv,
  renderDotEnvFromVars,
  renderFunctionsTs,
  renderPackageJson,
  renderPackageJsonFromInit,
  renderPlaceholderFunctionsTs,
  renderPlaceholderWidgetTsx,
  renderWidgetTsx,
} from './widgetTemplates'

/** Resolve the dynamic widgets root directory. */
function getDynamicWidgetsDir(): string {
  const projectId = getProjectId()
  if (projectId) {
    const projectRoot = getProjectRootPath(projectId)
    if (!projectRoot) {
      throw new Error(`Project not found: ${projectId}`)
    }
    return path.join(projectRoot, '.openloaf', 'dynamic-widgets')
  }
  const workspaceId = getWorkspaceId()
  if (workspaceId) {
    const workspaceRoot = getWorkspaceRootPathById(workspaceId)
    if (!workspaceRoot) {
      throw new Error(`Workspace not found: ${workspaceId}`)
    }
    return path.join(workspaceRoot, '.openloaf', 'dynamic-widgets')
  }
  throw new Error(
    'projectId or workspaceId is required to generate a widget.',
  )
}

/** 生成 snake_case widgetId */
function makeWidgetId(widgetName: string): string {
  const snake = widgetName.replace(/-/g, '_')
  return `dw_${snake}_${Date.now()}`
}

export const generateWidgetTool = tool({
  description: generateWidgetToolDef.description,
  inputSchema: zodSchema(generateWidgetToolDef.parameters),
  execute: async (input): Promise<string> => {
    const widgetId = makeWidgetId(input.widgetName)
    const widgetDir = path.join(getDynamicWidgetsDir(), widgetId)
    await fs.mkdir(widgetDir, { recursive: true })

    // 逻辑：通过模板渲染器生成文件
    const files: [string, string][] = [
      ['package.json', renderPackageJson(input)],
      ['widget.tsx', renderWidgetTsx(input)],
      ['functions.ts', renderFunctionsTs(input)],
    ]
    const dotEnv = renderDotEnv(input)
    if (dotEnv) {
      files.push(['.env', dotEnv])
    }

    for (const [filename, content] of files) {
      await fs.writeFile(path.join(widgetDir, filename), content, 'utf-8')
    }

    logger.info({ widgetId, widgetDir }, 'Dynamic widget generated')

    const hasEnv = Boolean(dotEnv)
    const envHint = hasEnv
      ? `\n\n注意：Widget 包含 .env 文件，请编辑 ${widgetDir}/.env 填入真实的 API Key。`
      : ''

    // 逻辑：返回 JSON 供前端解析 widgetId
    return JSON.stringify({
      widgetId,
      widgetName: input.widgetName,
      widgetDir,
      message: `Widget "${input.widgetDescription}" 已生成到 ${widgetDir}。可在桌面组件库的"AI 生成"区域找到并添加到桌面。${envHint}`,
    })
  },
})

// ─── 新工具 ───

export const widgetInitTool = tool({
  description: widgetInitToolDef.description,
  inputSchema: zodSchema(widgetInitToolDef.parameters),
  execute: async (input): Promise<string> => {
    const widgetId = makeWidgetId(input.widgetName)
    const widgetDir = path.join(getDynamicWidgetsDir(), widgetId)
    await fs.mkdir(widgetDir, { recursive: true })

    const files: [string, string][] = [
      ['package.json', renderPackageJsonFromInit(input)],
      [
        'widget.tsx',
        renderPlaceholderWidgetTsx(
          input.widgetName,
          input.functionNames[0] ?? 'getData',
        ),
      ],
      ['functions.ts', renderPlaceholderFunctionsTs(input.functionNames)],
    ]
    const dotEnv = renderDotEnvFromVars(input.envVars)
    if (dotEnv) {
      files.push(['.env', dotEnv])
    }

    for (const [filename, content] of files) {
      await fs.writeFile(path.join(widgetDir, filename), content, 'utf-8')
    }

    logger.info({ widgetId, widgetDir }, 'Widget scaffold created')

    return JSON.stringify({
      widgetId,
      widgetDir,
      files: files.map(([f]) => path.join(widgetDir, f)),
    })
  },
})

export const widgetListTool = tool({
  description: widgetListToolDef.description,
  inputSchema: zodSchema(widgetListToolDef.parameters),
  execute: async (): Promise<string> => {
    const widgetsDir = getDynamicWidgetsDir()
    try {
      await fs.access(widgetsDir)
    } catch {
      return JSON.stringify([])
    }

    const entries = await fs.readdir(widgetsDir, { withFileTypes: true })
    const widgets = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const widgetDir = path.join(widgetsDir, entry.name)
        const raw = await fs.readFile(
          path.join(widgetDir, 'package.json'),
          'utf-8',
        )
        const pkg = JSON.parse(raw)
        const hasEnv = await fs
          .access(path.join(widgetDir, '.env'))
          .then(() => true)
          .catch(() => false)

        // 逻辑：判断 scope
        const projectId = getProjectId()
        const scope = projectId ? 'project' : 'workspace'

        widgets.push({
          widgetId: entry.name,
          name: pkg.name || entry.name,
          description: pkg.description || '',
          scope,
          location: widgetDir,
          functions: Object.keys(pkg.scripts || {}),
          hasEnv,
        })
      } catch {
        // 跳过无效目录
      }
    }
    return JSON.stringify(widgets)
  },
})

export const widgetGetTool = tool({
  description: widgetGetToolDef.description,
  inputSchema: zodSchema(widgetGetToolDef.parameters),
  execute: async (input): Promise<string> => {
    const widgetDir = path.join(getDynamicWidgetsDir(), input.widgetId)
    try {
      const raw = await fs.readFile(
        path.join(widgetDir, 'package.json'),
        'utf-8',
      )
      const pkg = JSON.parse(raw)
      const hasEnv = await fs
        .access(path.join(widgetDir, '.env'))
        .then(() => true)
        .catch(() => false)

      return JSON.stringify({
        widgetId: input.widgetId,
        name: pkg.name || input.widgetId,
        description: pkg.description || '',
        location: widgetDir,
        functions: Object.keys(pkg.scripts || {}),
        size: pkg.openloaf?.constraints,
        hasEnv,
      })
    } catch {
      return JSON.stringify({
        error: `Widget not found: ${input.widgetId}`,
      })
    }
  },
})

export const widgetCheckTool = tool({
  description: widgetCheckToolDef.description,
  inputSchema: zodSchema(widgetCheckToolDef.parameters),
  execute: async (input): Promise<string> => {
    const widgetDir = path.join(getDynamicWidgetsDir(), input.widgetId)

    // 逻辑：验证文件结构
    const requiredFiles = ['package.json', 'widget.tsx', 'functions.ts']
    const missing: string[] = []
    for (const f of requiredFiles) {
      try {
        await fs.access(path.join(widgetDir, f))
      } catch {
        missing.push(f)
      }
    }
    if (missing.length > 0) {
      return JSON.stringify({
        ok: false,
        widgetId: input.widgetId,
        errors: [`缺少文件: ${missing.join(', ')}`],
      })
    }

    // 逻辑：读取 widgetName
    let widgetName = input.widgetId
    try {
      const raw = await fs.readFile(
        path.join(widgetDir, 'package.json'),
        'utf-8',
      )
      const pkg = JSON.parse(raw)
      widgetName = pkg.name || input.widgetId
    } catch {
      // 使用 widgetId 作为 fallback
    }

    // 逻辑：调用 esbuild 编译
    const result = await compileWidget(widgetDir)
    if (!result.ok) {
      return JSON.stringify({
        ok: false,
        widgetId: input.widgetId,
        widgetName,
        errors: [result.error || '编译失败'],
      })
    }

    logger.info({ widgetId: input.widgetId }, 'Widget check passed')

    return JSON.stringify({
      ok: true,
      widgetId: input.widgetId,
      widgetName,
    })
  },
})
