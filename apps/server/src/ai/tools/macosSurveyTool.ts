/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * MacosSurvey — "survey before act". Produces an app mental model (known
 * intents, AX richness, menu bar map, windows, recommended paths) in one
 * call so the model doesn't skip "understand the app" and immediately try
 * to click path=["0","0"]. Cached per session × app for 5 minutes.
 */
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import { macosSurveyToolDef } from '@openloaf/api/types/tools/runtime'
import { getSessionId } from '@/ai/shared/context/requestContext'
import { getMacosHelper } from '@/desktop/macosHelperClient'
import { createToolProgress } from '@/ai/tools/toolProgress'
import {
  DESKTOP_ONLY_ERROR,
  buildPermissionReply,
  getLang,
  type WindowSummary,
} from '@/ai/tools/macosCommon'
import { findAppEntry } from '@/ai/tools/macosIntentRegistry'

type SurveyCacheEntry = {
  expiresAt: number
  body: string
}

const surveyCacheTTLms = 5 * 60 * 1000
const surveyCache = new Map<string, SurveyCacheEntry>()

function surveyCacheKey(sessionId: string, appQuery: string): string {
  return `${sessionId}::${appQuery.toLowerCase()}`
}

// Window chrome subroles — when the target window has nothing else, the app
// is almost certainly self-drawn and AX path clicks won't reach business UI.
const WINDOW_CHROME_ROLES = new Set([
  'AXCloseButton',
  'AXMinimizeButton',
  'AXZoomButton',
  'AXFullScreenButton',
])

export function classifyAxSurface(
  richness: number | undefined,
  windowChildRoles: string[] | undefined,
  nodeCount: number | undefined,
): { verdict: 'ax-rich' | 'mixed' | 'self-drawn' | 'unknown'; reason: string } {
  if (nodeCount != null && nodeCount < 10) {
    return { verdict: 'unknown', reason: 'AX tree too small — app may not be fully launched' }
  }
  if (!windowChildRoles || windowChildRoles.length === 0) {
    return {
      verdict: 'unknown',
      reason: 'no reachable AXWindow children — all windows may be minimized',
    }
  }
  const nonChrome = windowChildRoles.filter((r) => !WINDOW_CHROME_ROLES.has(r))
  if (nonChrome.length === 0) {
    return {
      verdict: 'self-drawn',
      reason: `AXWindow children are only chrome buttons (${windowChildRoles.join(', ')}) — business UI is painted, not in AX`,
    }
  }
  const ratio = richness ?? 0
  if (ratio >= 0.4) {
    return {
      verdict: 'ax-rich',
      reason: `${nonChrome.length} non-chrome roles in window; richness ${ratio.toFixed(2)}`,
    }
  }
  return {
    verdict: 'mixed',
    reason: `some business UI in AX but sparse (richness ${ratio.toFixed(2)})`,
  }
}

type AxTreeNode = {
  role?: string
  subrole?: string
  title?: string
  shortcut?: string
  children?: AxTreeNode[]
}

/**
 * Walk the AX tree's menu bar subtree and collect (path, shortcut) entries
 * for leaf menu items that have a rendered shortcut. The Swift side already
 * annotated AXMenuItem nodes with `shortcut: "⌘⇧C"`; this just flattens the
 * menu forest into a compact list the model can scan.
 */
export function collectMenuBarPaths(
  root: AxTreeNode | null | undefined,
  limit = 80,
): Array<{ path: string[]; shortcut?: string }> {
  const out: Array<{ path: string[]; shortcut?: string }> = []
  if (!root) return out

  let menuBar: AxTreeNode | undefined
  for (const c of root.children ?? []) {
    if (c.role === 'AXMenuBar') {
      menuBar = c
      break
    }
  }
  if (!menuBar) return out

  const walk = (node: AxTreeNode, currentPath: string[]): void => {
    if (out.length >= limit) return
    for (const item of node.children ?? []) {
      if (out.length >= limit) return
      if (item.role === 'AXMenuBarItem' || item.role === 'AXMenuItem') {
        const title = item.title ?? ''
        if (!title) continue
        const nextPath = [...currentPath, title]
        if (item.shortcut) {
          out.push({ path: nextPath, shortcut: item.shortcut })
        }
        for (const c of item.children ?? []) {
          if (c.role === 'AXMenu') walk(c, nextPath)
        }
      }
    }
  }
  walk(menuBar, [])
  return out
}

function appVersionFragment(bundlePath: string | undefined): string {
  return bundlePath ? ` (${path.basename(bundlePath)})` : ''
}

export const macosSurveyTool = tool({
  description: macosSurveyToolDef.description,
  inputSchema: zodSchema(macosSurveyToolDef.parameters),
  needsApproval: false,
  execute: async (
    { app, refresh },
    { toolCallId }: { toolCallId: string },
  ): Promise<string> => {
    const lang = getLang()
    const progress = createToolProgress(toolCallId, 'MacosSurvey')
    progress.start(lang === 'zh' ? `理解 app：${app}` : `Surveying ${app}`)

    const helper = getMacosHelper()
    if (!helper) {
      progress.error('desktop-only')
      return DESKTOP_ONLY_ERROR[lang]
    }

    const sessionId = getSessionId() ?? 'no-session'
    const cacheKey = surveyCacheKey(sessionId, app)
    if (!refresh) {
      const hit = surveyCache.get(cacheKey)
      if (hit && hit.expiresAt > Date.now()) {
        progress.done(lang === 'zh' ? '命中缓存' : 'cache hit')
        return hit.body
      }
    }

    try {
      // One observe call fuels the whole survey — no screenshot, just the
      // AX tree + window list + axRichness + windowChildRoles.
      const res = await helper.request(
        'observe',
        {
          appFilter: app,
          includeScreenshot: false,
          includeWindows: true,
          maxNodes: 2500,
          maxDepth: 10,
        },
        { sessionId },
      )
      if (!res.ok) {
        const missing = res.permissionsMissing ?? []
        progress.error(res.error ?? 'observe failed')
        if (missing.length > 0) return buildPermissionReply(missing)
        return lang === 'zh'
          ? `MacosSurvey 失败：${res.error ?? '未知错误'}`
          : `MacosSurvey failed: ${res.error ?? 'unknown error'}`
      }

      const appInfo = (res.app ?? {}) as {
        name?: string
        bundleId?: string
        pid?: number
        bundlePath?: string
      }
      const richness = typeof res.axRichness === 'number' ? res.axRichness : undefined
      const windowChildRoles = Array.isArray(res.windowChildRoles)
        ? (res.windowChildRoles as string[])
        : undefined
      const nodeCount = typeof res.nodeCount === 'number' ? res.nodeCount : undefined
      const windows = Array.isArray(res.windows) ? (res.windows as WindowSummary[]) : []
      const verdict = classifyAxSurface(richness, windowChildRoles, nodeCount)

      const registryQuery = appInfo.bundleId || appInfo.name || app
      const registryEntry = await findAppEntry(registryQuery)
      const menuPaths = collectMenuBarPaths(res.tree as AxTreeNode, 80)

      const recommended: string[] = []
      if (registryEntry && registryEntry.intents.length > 0) {
        recommended.push(
          `1. Known intents (highest confidence): MacosAct type="intent" — ${registryEntry.intents.length} registered`,
        )
      } else {
        recommended.push(
          '1. (No intents registered for this app — skip to step 2.)',
        )
      }
      if (menuPaths.length > 0) {
        recommended.push(
          `2. Menu navigation: MacosAct type="menu_click" menuPath=["…"] — ${menuPaths.length} reachable menu entries`,
        )
      }
      recommended.push(
        '3. Keyboard shortcut: MacosAct type="key" keys=["cmd","…"] (use shortcut field from menu tree)',
      )
      if (verdict.verdict === 'ax-rich') {
        recommended.push(
          '4. AX path click: MacosAct type="click" ref={app,path:[…]} — SAFE on this app (ax-rich). Avoid chrome buttons (will be refused).',
        )
      } else if (verdict.verdict === 'mixed') {
        recommended.push(
          '4. AX path click: caution — AX partially covers the UI. Prefer 1/2/3 unless the target element is clearly AX-exposed.',
        )
      } else {
        recommended.push(
          '4. AX path click: **DO NOT USE** on this app. Chrome buttons will be refused; business UI is not in AX.',
        )
      }
      recommended.push(
        '5. Coordinate click: MacosAct type="click" point={x,y} — last resort. Read pixel coords off a MacosObserve screenshot first.',
      )

      const lines: string[] = []
      lines.push(
        `App: ${appInfo.name ?? '?'}${appVersionFragment(appInfo.bundlePath)} (${appInfo.bundleId ?? 'unknown-bundle'}, pid=${appInfo.pid ?? '?'})`,
      )
      lines.push('')
      lines.push(`AX profile: ${verdict.verdict} — ${verdict.reason}`)
      if (richness != null) {
        lines.push(`  richness: ${richness.toFixed(3)} (${nodeCount ?? '?'} nodes)`)
      }
      if (windowChildRoles != null) {
        lines.push(`  windowChildRoles: [${windowChildRoles.join(', ')}]`)
      }
      lines.push('')

      if (registryEntry && registryEntry.intents.length > 0) {
        lines.push('Known intents (from registry):')
        for (const it of registryEntry.intents) {
          const argsLine = it.args && it.args.length > 0
            ? `  args: ${it.args.map((a) => (a.required ? a.name : `${a.name}?`)).join(', ')}`
            : ''
          lines.push(`  - id: ${it.id}  — ${it.label}`)
          if (argsLine) lines.push(argsLine)
        }
      } else {
        lines.push(
          'Known intents: (none registered for this app — you can still use menu_click / applescript / key / click)',
        )
      }
      lines.push('')

      if (menuPaths.length > 0) {
        lines.push(`Menu bar (${menuPaths.length} entries with shortcuts, sample):`)
        for (const m of menuPaths.slice(0, 30)) {
          lines.push(
            `  - ${m.path.join(' > ')}${m.shortcut ? `  (${m.shortcut})` : ''}`,
          )
        }
        if (menuPaths.length > 30) lines.push(`  ... and ${menuPaths.length - 30} more`)
      } else {
        lines.push('Menu bar: (no menu entries with keyboard shortcuts found)')
      }
      lines.push('')

      lines.push(`Windows (${windows.length}):`)
      for (const w of windows.slice(0, 10)) {
        const b = w.bounds
        const size = b ? `${Math.round(b.w)}×${Math.round(b.h)}` : '?'
        const visible = w.isOnScreen ? 'visible' : 'hidden'
        lines.push(`  - windowID=${w.windowID} ${visible} ${size} "${w.title ?? ''}"`)
      }
      if (windows.length > 10) lines.push(`  ... and ${windows.length - 10} more`)
      lines.push('')

      lines.push('Recommended path order:')
      for (const r of recommended) lines.push(`  ${r}`)

      const body = lines.join('\n')
      surveyCache.set(cacheKey, {
        expiresAt: Date.now() + surveyCacheTTLms,
        body,
      })
      progress.done(`${verdict.verdict} · ${registryEntry?.intents.length ?? 0} intents`)
      return body
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      progress.error(msg)
      return lang === 'zh' ? `MacosSurvey 异常：${msg}` : `MacosSurvey error: ${msg}`
    }
  },
})
