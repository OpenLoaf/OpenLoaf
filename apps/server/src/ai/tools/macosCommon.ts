/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Shared helpers for the macOS control tool family (Observe / Act / Survey
 * / ListWindows / CaptureWindow). Types + permission plumbing + the i18n
 * message bag live here so each tool file can stay focused on its own
 * behavior rather than re-defining boilerplate.
 */
import { spawn } from 'node:child_process'
import { readBasicConf } from '@/modules/settings/openloafConfStore'

export type Lang = 'zh' | 'en'

export function getLang(): Lang {
  return readBasicConf().promptLanguage === 'zh' ? 'zh' : 'en'
}

// Shape of each entry in the helper's `windows` payload — kept in sync with
// serializeWindow() on the Swift side (main.swift).
export type WindowSummary = {
  windowID: number
  title?: string
  bounds?: { x: number; y: number; w: number; h: number }
  isOnScreen?: boolean
  layer?: number
  ownerPID?: number
  ownerName?: string
  ownerBundleID?: string | null
}

export const DESKTOP_ONLY_ERROR: Record<Lang, string> = {
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

export const T = {
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

export function buildPermissionReply(missing: string[]): string {
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
