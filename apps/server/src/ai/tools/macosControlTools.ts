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
import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import sharp from 'sharp'
import { tool, zodSchema } from 'ai'
import {
  macosActToolDef,
  macosObserveToolDef,
} from '@openloaf/api/types/tools/runtime'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'
import { getSessionId } from '@/ai/shared/context/requestContext'
import { getMacosHelper } from '@/desktop/macosHelperClient'
import { createToolProgress } from '@/ai/tools/toolProgress'
import { readBasicConf } from '@/modules/settings/openloafConfStore'

type Lang = 'zh' | 'en'
function getLang(): Lang {
  return readBasicConf().promptLanguage === 'zh' ? 'zh' : 'en'
}

const DESKTOP_ONLY_ERROR: Record<Lang, string> = {
  en: "MacOS control is only available in OpenLoaf Desktop app on macOS. Tell the user to switch to the desktop app, or to pick a different approach.",
  zh: "macOS 桌面控制仅在 macOS 上的 OpenLoaf Desktop 应用中可用。请提示用户切换到桌面端，或改用其他方式。",
}

const SETTINGS_URL: Record<string, string> = {
  screen:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  accessibility:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
}

const PERMISSION_LABEL: Record<Lang, Record<string, string>> = {
  en: { screen: 'Screen Recording', accessibility: 'Accessibility' },
  zh: { screen: '屏幕录制', accessibility: '辅助功能' },
}

const T = {
  permMissingHeader: (lang: Lang, missing: string[]) => {
    const labels = missing.map((k) => PERMISSION_LABEL[lang][k] ?? k).join('、')
    return lang === 'zh'
      ? `macOS 权限缺失：${labels}。`
      : `macOS permission missing: ${missing.join(', ')}.`
  },
  openedLine: (lang: Lang, opened: string[]) => {
    const labels = opened.map((k) => PERMISSION_LABEL[lang][k] ?? k).join('、')
    return lang === 'zh'
      ? `系统设置面板已自动打开：${labels}。`
      : `System Settings panes have been opened for: ${opened.join(', ')}.`
  },
  hintLine: (lang: Lang, key: 'screen' | 'accessibility') => {
    if (lang === 'zh') {
      if (key === 'screen')
        return '- 屏幕录制：系统设置 → 隐私与安全性 → 屏幕录制 → 启用 OpenLoaf'
      return '- 辅助功能：系统设置 → 隐私与安全性 → 辅助功能 → 启用 OpenLoaf'
    }
    if (key === 'screen')
      return '- Screen Recording: System Settings → Privacy & Security → Screen Recording → enable OpenLoaf'
    return '- Accessibility: System Settings → Privacy & Security → Accessibility → enable OpenLoaf'
  },
  waitForUserHint: (lang: Lang) =>
    lang === 'zh'
      ? '请用自然语言提示用户去上述面板启用 OpenLoaf，等用户确认后再重试。不要自己反复重试。'
      : 'Tell the user to enable OpenLoaf there, then wait for their confirmation before retrying. Do not retry on your own.',
  observeFail: (lang: Lang, msg: string) =>
    lang === 'zh' ? `MacosObserve 失败：${msg}` : `MacosObserve failed: ${msg}`,
  observeError: (lang: Lang, msg: string) =>
    lang === 'zh' ? `MacosObserve 异常：${msg}` : `MacosObserve error: ${msg}`,
  actFail: (lang: Lang, msg: string) =>
    lang === 'zh' ? `MacosAct 失败：${msg}` : `MacosAct failed: ${msg}`,
  actError: (lang: Lang, msg: string) =>
    lang === 'zh' ? `MacosAct 异常：${msg}` : `MacosAct error: ${msg}`,
  actDone: (lang: Lang, label: string) =>
    lang === 'zh'
      ? `动作完成：${label}。下一步请调用 MacosObserve 查看当前 UI 状态再继续。`
      : `Action done: ${label}. Call MacosObserve next to verify the UI state before continuing.`,
  observeNeedsSession: (lang: Lang) =>
    lang === 'zh'
      ? 'MacosObserve 需要一个活跃的聊天会话。'
      : 'MacosObserve requires an active chat session.',
  progressObserveStart: (lang: Lang) =>
    lang === 'zh' ? '截屏并读取 UI 树' : 'Capturing screen and reading AX tree',
  progressActStart: (lang: Lang, label: string) =>
    lang === 'zh' ? `执行 ${label}` : `Executing ${label}`,
  progressDone: (lang: Lang, label: string) =>
    lang === 'zh' ? `完成 ${label}` : `Done ${label}`,
}

/**
 * Best-effort: pop the relevant System Settings pane so the user can grant the
 * permission without having to navigate there manually. Non-blocking and
 * silent on failure — we never want to crash the tool because `open` misfired.
 */
/**
 * Shell out to `/usr/bin/open -a <appName>` and wait for exit. Rejects on
 * non-zero — `open` exits 1 with "Unable to find application named '...'"
 * when the name doesn't resolve, which we surface verbatim to the model so
 * it can retry with the correct bundle id or display name.
 */
function runOpenCommand(appName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') {
      reject(new Error('launch_app requires macOS'))
      return
    }
    const child = spawn('/usr/bin/open', ['-a', appName], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (err) => reject(err))
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `open -a exited with code ${code}`))
    })
  })
}

function openSettingsPanes(missing: string[]): string[] {
  if (process.platform !== 'darwin') return []
  const opened: string[] = []
  for (const key of missing) {
    const url = SETTINGS_URL[key]
    if (!url) continue
    try {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
      opened.push(key)
    } catch {
      // swallow — best effort
    }
  }
  return opened
}

function permissionsHint(lang: Lang, missing: string[]): string {
  const lines: string[] = []
  if (missing.includes('screen')) lines.push(T.hintLine(lang, 'screen'))
  if (missing.includes('accessibility'))
    lines.push(T.hintLine(lang, 'accessibility'))
  return lines.join('\n')
}

function buildPermissionReply(missing: string[]): string {
  const lang = getLang()
  const opened = openSettingsPanes(missing)
  return [
    T.permMissingHeader(lang, missing),
    opened.length > 0 ? T.openedLine(lang, opened) : '',
    permissionsHint(lang, missing),
    T.waitForUserHint(lang),
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Shrink the Swift helper's raw PNG (retina can be 2880+px, several MB) into a
 * JPEG that's cheap to upload and still readable by vision models. Long-edge
 * 1600px keeps UI text legible at Qwen-VL's patch resolution; q78 keeps files
 * in the 150-450 KB range for typical desktops.
 *
 * The original PNG is removed in-place and replaced with `.jpg` so attachment
 * expander picks up the smaller file. Returns null on any failure — caller
 * falls back to the raw PNG path.
 */
async function compressScreenshot(
  pngPath: string,
): Promise<{ path: string; mediaType: string } | null> {
  try {
    const jpgPath = pngPath.replace(/\.png$/i, '.jpg')
    await sharp(pngPath)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(jpgPath)
    if (jpgPath !== pngPath) {
      try {
        await fs.unlink(pngPath)
      } catch {
        // best effort
      }
    }
    return { path: jpgPath, mediaType: 'image/jpeg' }
  } catch {
    return null
  }
}

/**
 * Compact the AX tree before handing it to the model.
 *
 * The Swift helper emits a `path` on every node plus structural AXGroup
 * containers with no title / value / identifier / actions. That JSON is huge
 * (one WeChat window trips 140k+ chars) and most of it is dead weight:
 *   - `path` is only useful on nodes the model can actually reference
 *     (actions[] non-empty OR identifier present). Intermediate containers
 *     are walked but never targeted — the descendant's full path already
 *     encodes the chain.
 *   - Empty leaf AXGroup (no children, no semantic fields) carry zero info.
 *
 * We do NOT change Swift-side output to keep the mock fixtures stable and to
 * avoid a native rebuild. The pruning is idempotent on already-slim trees.
 */
type AxNode = {
  role?: string
  subrole?: string
  title?: string
  value?: unknown
  identifier?: string
  description?: string
  frame?: { x?: number; y?: number; w?: number; h?: number }
  actions?: string[]
  path?: number[]
  children?: AxNode[]
  [k: string]: unknown
}

function slimAxTree(tree: unknown): unknown {
  if (!tree || typeof tree !== 'object') return tree
  const slim = (node: AxNode, depth: number): AxNode | null => {
    // Prune: zero-size nodes and their descendants. Collapsed menus, hidden
    // popups and off-screen widgets all report frame.w === 0 or h === 0 (often
    // at y = 1440, a sentinel AppKit uses for "unrendered"). They can't be
    // targeted without first opening the parent, so shipping them to the model
    // is pure bloat — typically 60–80% of the raw AX tree for app-menu-heavy
    // apps like WeChat. Don't apply at the root (depth 0) since the app itself
    // has no frame.
    const frame = node.frame
    if (
      depth > 0 &&
      frame &&
      ((typeof frame.w === 'number' && frame.w <= 0) ||
        (typeof frame.h === 'number' && frame.h <= 0))
    ) {
      return null
    }

    const children = Array.isArray(node.children) ? node.children : []
    const slimmedChildren = children
      .map((c) => slim(c as AxNode, depth + 1))
      .filter((c): c is AxNode => c !== null)

    const hasActions = Array.isArray(node.actions) && node.actions.length > 0
    const hasIdentifier = typeof node.identifier === 'string' && node.identifier.length > 0
    const hasLabel =
      (typeof node.title === 'string' && node.title.length > 0) ||
      (typeof node.description === 'string' && node.description.length > 0) ||
      node.value != null

    // Prune: empty AXGroup leaf with no semantic payload.
    if (
      slimmedChildren.length === 0 &&
      !hasActions &&
      !hasIdentifier &&
      !hasLabel &&
      (node.role === 'AXGroup' || node.role === 'AXLayoutArea' || !node.role)
    ) {
      return null
    }

    const out: AxNode = { ...node }
    // Drop `path` on unreferenceable nodes — saves 10-20 chars per node.
    if (!hasActions && !hasIdentifier) delete out.path
    if (slimmedChildren.length > 0) out.children = slimmedChildren
    else delete out.children
    return out
  }
  const root = slim(tree as AxNode, 0)
  return root ?? tree
}

function summarizeAction(action: Record<string, unknown>): string {
  const t = String(action.type ?? 'unknown')
  switch (t) {
    case 'launch_app':
      return `launch ${String(action.app ?? '')}`
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
    const lang = getLang()
    const progress = createToolProgress(toolCallId, 'MacosObserve')
    progress.start(T.progressObserveStart(lang))

    const helper = getMacosHelper()
    if (!helper) {
      progress.error('desktop-only')
      return DESKTOP_ONLY_ERROR[lang]
    }

    const sessionId = getSessionId()
    if (!sessionId) {
      progress.error('no session')
      return T.observeNeedsSession(lang)
    }
    const assetDir = await resolveSessionAssetDir(sessionId)
    const pngPath = path.join(assetDir, `macos-${toolCallId}.png`)

    try {
      const res = await helper.request(
        'observe',
        {
          screenshotPath: pngPath,
          appFilter,
          maxNodes: maxNodes ?? 500,
          maxDepth,
          includeScreenshot,
        },
        { sessionId },
      )

      if (!res.ok) {
        const missing = res.permissionsMissing ?? []
        progress.error(res.error ?? 'observe failed')
        if (missing.length > 0) return buildPermissionReply(missing)
        return T.observeFail(lang, res.error ?? (lang === 'zh' ? '未知错误' : 'unknown error'))
      }

      const tree = slimAxTree(res.tree)
      const app = res.app as { name?: string; bundleId?: string } | undefined
      const nodeCount = res.nodeCount ?? 0
      const truncated = res.truncated ? ' (truncated)' : ''

      let shotMediaType = 'image/png'
      let shotPath = typeof res.screenshotPath === 'string' ? res.screenshotPath : ''
      if (includeScreenshot !== false && shotPath) {
        const compressed = await compressScreenshot(shotPath)
        if (compressed) {
          shotPath = compressed.path
          shotMediaType = compressed.mediaType
        }
      }

      const shotKind = typeof res.screenshotKind === 'string' ? res.screenshotKind : 'display'
      progress.done(
        `${shotKind === 'window' ? '窗口截图' : '屏幕截图'} ${res.screenshotWidth ?? '?'}×${res.screenshotHeight ?? '?'} · ${nodeCount} nodes`,
      )

      const treeJson = JSON.stringify(tree)
      const parts: string[] = []
      if (includeScreenshot !== false && shotPath) {
        parts.push(
          `<system-tag type="attachment" path="${shotPath}" media-type="${shotMediaType}"/>`,
        )
        parts.push('')
      }
      parts.push(`App: ${app?.name ?? '?'} (${app?.bundleId ?? ''})`)
      parts.push(`Screenshot: ${shotKind} (${res.screenshotWidth ?? '?'}×${res.screenshotHeight ?? '?'})`)
      parts.push(`AX tree: ${nodeCount} nodes${truncated}`)
      parts.push('```json')
      parts.push(treeJson)
      parts.push('```')
      return parts.join('\n')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      progress.error(msg)
      return T.observeError(lang, msg)
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
    const lang = getLang()
    const progress = createToolProgress(toolCallId, 'MacosAct')
    const label = summarizeAction(action as Record<string, unknown>)
    progress.start(T.progressActStart(lang, label))

    const helper = getMacosHelper()
    if (!helper) {
      progress.error('desktop-only')
      return DESKTOP_ONLY_ERROR[lang]
    }

    const sessionId = getSessionId()

    // TS-side shortcut: `launch_app` doesn't need AX / CGEvent, just shell out
    // to macOS `open -a`. Avoids a native rebuild and lets the model replace a
    // 3-4 step Spotlight dance (cmd+space → type → return → observe) with a
    // single deterministic call. Non-darwin is already blocked by the
    // desktop-only guard above when real helper is null.
    if ((action as { type?: string })?.type === 'launch_app') {
      const appName = String((action as { app?: string }).app ?? '').trim()
      if (!appName) {
        progress.error('launch_app missing app')
        return T.actFail(lang, lang === 'zh' ? 'launch_app 缺少 app 参数' : 'launch_app missing app parameter')
      }
      try {
        await runOpenCommand(appName)
        progress.done(T.progressDone(lang, label))
        return T.actDone(lang, label)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        progress.error(msg)
        return T.actFail(lang, msg)
      }
    }

    try {
      const res = await helper.request('act', { action }, { sessionId })
      if (!res.ok) {
        const missing = res.permissionsMissing ?? []
        progress.error(res.error ?? 'act failed')
        if (missing.length > 0) return buildPermissionReply(missing)
        return T.actFail(lang, res.error ?? (lang === 'zh' ? '未知错误' : 'unknown error'))
      }
      progress.done(T.progressDone(lang, label))
      return T.actDone(lang, label)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      progress.error(msg)
      return T.actError(lang, msg)
    }
  },
})
