/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Electron 主进程轻量 i18n 模块。
 * 仅翻译主进程 UI（托盘菜单、应用菜单），
 * web 渲染端仍使用 react-i18next。
 */

import { app } from 'electron'
import { getLanguage } from './updateConfig'

// ---------------------------------------------------------------------------
// 翻译表
// ---------------------------------------------------------------------------

const translations: Record<string, Record<string, string>> = {
  'zh-CN': {
    'tray.showHide': '显示 / 隐藏 OpenLoaf',
    'tray.newConversation': '新建对话',
    'tray.quit': '退出',
    'menu.about': '关于 OpenLoaf',
  },
  'zh-TW': {
    'tray.showHide': '顯示 / 隱藏 OpenLoaf',
    'tray.newConversation': '新增對話',
    'tray.quit': '結束',
    'menu.about': '關於 OpenLoaf',
  },
  'en-US': {
    'tray.showHide': 'Show / Hide OpenLoaf',
    'tray.newConversation': 'New Conversation',
    'tray.quit': 'Quit',
    'menu.about': 'About OpenLoaf',
  },
}

// ---------------------------------------------------------------------------
// 语言解析
// ---------------------------------------------------------------------------

/**
 * 解析当前有效语言。
 * 优先级：.settings.json 用户设置 → 系统 locale 映射 → 'en-US'
 */
export function resolveLanguage(): string {
  // 1. 用户在 web 端显式设置并同步过来的语言
  const saved = getLanguage()
  if (saved && translations[saved]) return saved

  // 2. 从系统 locale 推断
  const sysLocale = app.getLocale() // e.g. 'zh-CN', 'zh-TW', 'en-US', 'en', 'ja'
  if (translations[sysLocale]) return sysLocale

  // 3. 模糊匹配前缀
  const prefix = sysLocale.split('-')[0]
  if (prefix === 'zh') return 'zh-CN'

  return 'en-US'
}

// ---------------------------------------------------------------------------
// 翻译函数
// ---------------------------------------------------------------------------

/**
 * 获取翻译文本。key 不存在时 fallback 到 en-US，再不存在返回 key 本身。
 */
export function t(key: string): string {
  const lang = resolveLanguage()
  return translations[lang]?.[key] ?? translations['en-US']?.[key] ?? key
}
