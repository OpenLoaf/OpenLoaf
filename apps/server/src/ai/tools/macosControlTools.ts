/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * macOS control tools — screenshot + Accessibility tree observation, and
 * synthetic UI actions. Both tools are no-ops outside the desktop app:
 * getMacosHelper() returns null off-desktop and the tool returns a friendly
 * error telling the LLM the user isn't running OpenLoaf Desktop.
 */
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import {
  macosActToolDef,
  macosObserveToolDef,
} from '@openloaf/api/types/tools/runtime'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'
import { getSessionId } from '@/ai/shared/context/requestContext'
import { getMacosHelper } from '@/desktop/macosHelperClient'
import { createToolProgress } from '@/ai/tools/toolProgress'

const DESKTOP_ONLY_ERROR =
  "MacOS control is only available in OpenLoaf Desktop app on macOS. Tell the user to switch to the desktop app, or to pick a different approach."

function permissionsHint(missing: string[]): string {
  const lines: string[] = []
  if (missing.includes('screen'))
    lines.push(
      '- Screen Recording: System Settings → Privacy & Security → Screen Recording → enable OpenLoaf',
    )
  if (missing.includes('accessibility'))
    lines.push(
      '- Accessibility: System Settings → Privacy & Security → Accessibility → enable OpenLoaf',
    )
  return lines.join('\n')
}

function summarizeAction(action: Record<string, unknown>): string {
  const t = String(action.type ?? 'unknown')
  switch (t) {
    case 'click': {
      const pt = action.point as { x?: number; y?: number } | undefined
      if (pt && typeof pt.x === 'number') return `click @ (${pt.x},${pt.y})`
      return 'click (ax ref)'
    }
    case 'type':
      return `type ${String((action.text ?? '') as string).slice(0, 40)}`
    case 'key':
      return `key ${(action.keys as string[] | undefined)?.join('+') ?? ''}`
    case 'scroll':
      return `scroll dy=${(action as { dy?: number }).dy ?? 0}`
    case 'drag':
      return 'drag'
    case 'wait':
      return `wait ${(action as { ms?: number }).ms ?? 0}ms`
    case 'ax_action':
      return `ax_action ${String((action as { action?: string }).action ?? '')}`
    default:
      return t
  }
}

export const macosObserveTool = tool({
  description: macosObserveToolDef.description,
  inputSchema: zodSchema(macosObserveToolDef.parameters),
  needsApproval: false,
  execute: async (
    { appFilter, maxNodes, maxDepth, includeScreenshot },
    { toolCallId }: { toolCallId: string },
  ): Promise<string> => {
    const progress = createToolProgress(toolCallId, 'MacosObserve')
    progress.start('截屏并读取 UI 树')

    const helper = getMacosHelper()
    if (!helper) {
      progress.error('desktop-only')
      return DESKTOP_ONLY_ERROR
    }

    const sessionId = getSessionId()
    if (!sessionId) {
      progress.error('no session')
      return 'MacosObserve requires an active chat session.'
    }
    const assetDir = await resolveSessionAssetDir(sessionId)
    const pngPath = path.join(assetDir, `macos-${toolCallId}.png`)

    try {
      const res = await helper.request('observe', {
        screenshotPath: pngPath,
        appFilter,
        maxNodes,
        maxDepth,
        includeScreenshot,
      })

      if (!res.ok) {
        const missing = res.permissionsMissing ?? []
        progress.error(res.error ?? 'observe failed')
        if (missing.length > 0) {
          return [
            `macOS permission missing: ${missing.join(', ')}.`,
            permissionsHint(missing),
            'After granting, ask the user to retry.',
          ].join('\n')
        }
        return `MacosObserve failed: ${res.error ?? 'unknown error'}`
      }

      const tree = res.tree
      const app = res.app as { name?: string; bundleId?: string } | undefined
      const nodeCount = res.nodeCount ?? 0
      const truncated = res.truncated ? ' (truncated)' : ''

      progress.done(`截屏 ${res.screenshotWidth ?? '?'}×${res.screenshotHeight ?? '?'} · ${nodeCount} nodes`)

      const treeJson = JSON.stringify(tree, null, 2)
      const parts: string[] = []
      if (includeScreenshot !== false && res.screenshotPath) {
        parts.push(
          `<system-tag type="attachment" path="${res.screenshotPath}" media-type="image/png"/>`,
        )
        parts.push('')
      }
      parts.push(`App: ${app?.name ?? '?'} (${app?.bundleId ?? ''})`)
      parts.push(`AX tree: ${nodeCount} nodes${truncated}`)
      parts.push('```json')
      parts.push(treeJson)
      parts.push('```')
      return parts.join('\n')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      progress.error(msg)
      return `MacosObserve error: ${msg}`
    }
  },
})

export const macosActTool = tool({
  description: macosActToolDef.description,
  inputSchema: zodSchema(macosActToolDef.parameters),
  needsApproval: false,
  execute: async (
    { action },
    { toolCallId }: { toolCallId: string },
  ): Promise<string> => {
    const progress = createToolProgress(toolCallId, 'MacosAct')
    const label = summarizeAction(action as Record<string, unknown>)
    progress.start(`执行 ${label}`)

    const helper = getMacosHelper()
    if (!helper) {
      progress.error('desktop-only')
      return DESKTOP_ONLY_ERROR
    }

    try {
      const res = await helper.request('act', { action })
      if (!res.ok) {
        const missing = res.permissionsMissing ?? []
        progress.error(res.error ?? 'act failed')
        if (missing.length > 0) {
          return [
            `macOS permission missing: ${missing.join(', ')}.`,
            permissionsHint(missing),
          ].join('\n')
        }
        return `MacosAct failed: ${res.error ?? 'unknown error'}`
      }
      progress.done(`完成 ${label}`)
      return `动作完成: ${label}. 下一步请调用 MacosObserve 查看当前 UI 状态再继续。`
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      progress.error(msg)
      return `MacosAct error: ${msg}`
    }
  },
})
