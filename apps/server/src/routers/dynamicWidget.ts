/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  BaseDynamicWidgetRouter,
  dynamicWidgetSchemas,
  t,
  shieldedProcedure,
} from '@openloaf/api'
import { getProjectRootPath, getWorkspaceRootPathById } from '@openloaf/api/services/vfsService'
import { executeWidgetFunction } from '@/modules/dynamic-widget/functionExecutor'
import { compileWidget } from '@/modules/dynamic-widget/widgetCompiler'

/** Resolve the dynamic widgets directory with projectId → workspaceId fallback. */
function getDynamicWidgetsDir(projectId: string | undefined, workspaceId: string): string {
  if (projectId) {
    const projectRoot = getProjectRootPath(projectId)
    if (!projectRoot) {
      throw new Error(`Project not found: ${projectId}`)
    }
    return path.join(projectRoot, '.openloaf', 'dynamic-widgets')
  }
  const workspaceRoot = getWorkspaceRootPathById(workspaceId)
  if (!workspaceRoot) {
    throw new Error(`Workspace not found: ${workspaceId}`)
  }
  return path.join(workspaceRoot, '.openloaf', 'dynamic-widgets')
}

/** Read and parse a widget's package.json. */
async function readWidgetPackage(widgetDir: string) {
  const pkgPath = path.join(widgetDir, 'package.json')
  const raw = await fs.readFile(pkgPath, 'utf-8')
  return JSON.parse(raw) as {
    name?: string
    description?: string
    main?: string
    scripts?: Record<string, string>
    openloaf?: {
      type: 'widget'
      defaultSize?: string
      constraints?: {
        defaultW: number
        defaultH: number
        minW: number
        minH: number
        maxW: number
        maxH: number
      }
      support?: { workspace: boolean; project: boolean }
    }
  }
}

export class DynamicWidgetRouterImpl extends BaseDynamicWidgetRouter {
  public static createRouter() {
    return t.router({
      list: shieldedProcedure
        .input(dynamicWidgetSchemas.list.input)
        .output(dynamicWidgetSchemas.list.output)
        .query(async ({ input }) => {
          const widgetsDir = getDynamicWidgetsDir(input.projectId, input.workspaceId)
          try {
            await fs.access(widgetsDir)
          } catch {
            return []
          }
          const entries = await fs.readdir(widgetsDir, { withFileTypes: true })
          const widgets = []
          for (const entry of entries) {
            if (!entry.isDirectory()) continue
            try {
              const widgetDir = path.join(widgetsDir, entry.name)
              const pkg = await readWidgetPackage(widgetDir)
              widgets.push({
                id: entry.name,
                name: pkg.name || entry.name,
                description: pkg.description,
                main: pkg.main || 'widget.tsx',
                scripts: pkg.scripts,
                openloaf: pkg.openloaf,
              })
            } catch {
              // Skip invalid widget directories.
            }
          }
          return widgets
        }),

      get: shieldedProcedure
        .input(dynamicWidgetSchemas.get.input)
        .output(dynamicWidgetSchemas.get.output)
        .query(async ({ input }) => {
          const widgetDir = path.join(
            getDynamicWidgetsDir(input.projectId, input.workspaceId),
            input.widgetId,
          )
          try {
            const pkg = await readWidgetPackage(widgetDir)
            return {
              id: input.widgetId,
              name: pkg.name || input.widgetId,
              description: pkg.description,
              main: pkg.main || 'widget.tsx',
              scripts: pkg.scripts,
              openloaf: pkg.openloaf,
            }
          } catch {
            return null
          }
        }),

      save: shieldedProcedure
        .input(dynamicWidgetSchemas.save.input)
        .output(dynamicWidgetSchemas.save.output)
        .mutation(async ({ input }) => {
          const widgetDir = path.join(
            getDynamicWidgetsDir(input.projectId, input.workspaceId),
            input.widgetId,
          )
          await fs.mkdir(widgetDir, { recursive: true })
          for (const [filename, content] of Object.entries(input.files)) {
            const safeName = path.basename(filename)
            await fs.writeFile(
              path.join(widgetDir, safeName),
              content,
              'utf-8',
            )
          }
          return { ok: true, widgetId: input.widgetId }
        }),

      delete: shieldedProcedure
        .input(dynamicWidgetSchemas.delete.input)
        .output(dynamicWidgetSchemas.delete.output)
        .mutation(async ({ input }) => {
          const widgetDir = path.join(
            getDynamicWidgetsDir(input.projectId, input.workspaceId),
            input.widgetId,
          )
          try {
            await fs.rm(widgetDir, { recursive: true, force: true })
            return { ok: true }
          } catch {
            return { ok: false }
          }
        }),

      callFunction: shieldedProcedure
        .input(dynamicWidgetSchemas.callFunction.input)
        .output(dynamicWidgetSchemas.callFunction.output)
        .mutation(async ({ input }) => {
          const widgetDir = path.join(
            getDynamicWidgetsDir(input.projectId, input.workspaceId),
            input.widgetId,
          )
          return executeWidgetFunction(
            widgetDir,
            input.functionName,
            input.params,
          )
        }),

      compile: shieldedProcedure
        .input(dynamicWidgetSchemas.compile.input)
        .output(dynamicWidgetSchemas.compile.output)
        .query(async ({ input }) => {
          const widgetDir = path.join(
            getDynamicWidgetsDir(input.projectId, input.workspaceId),
            input.widgetId,
          )
          return compileWidget(widgetDir)
        }),
    })
  }
}

export const dynamicWidgetRouterImplementation =
  DynamicWidgetRouterImpl.createRouter()
