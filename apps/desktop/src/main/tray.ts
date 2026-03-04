/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { app, Menu, nativeImage, Tray } from 'electron'
import fs from 'fs'
import path from 'path'
import { t } from './i18n'
import type { Logger } from './logging/startupLogger'

// ---------------------------------------------------------------------------
// 模块状态
// ---------------------------------------------------------------------------

let tray: Tray | null = null
let baseIcon: Electron.NativeImage | null = null
let savedCallbacks: TrayCallbacks | null = null

// ---------------------------------------------------------------------------
// 图标解析
// ---------------------------------------------------------------------------

/**
 * 按平台解析托盘图标，搜索路径复用 resolveWindowIcon 的 roots 逻辑。
 * - macOS：使用 icon_16x16@2x.png 并标记为 Template（适配深浅模式）
 * - Windows：使用 icon.ico
 * - Linux：使用 icon.png
 */
function resolveTrayIcon(): Electron.NativeImage {
  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'

  const roots = [
    process.resourcesPath,
    path.join(process.cwd(), 'resources'),
    path.join(process.cwd(), 'apps', 'desktop', 'resources'),
    path.join(process.cwd(), 'apps', 'electron', 'resources'),
    path.join(app.getAppPath(), 'resources'),
    path.join(app.getAppPath(), '..', 'resources'),
  ]

  // macOS 使用专用 Template 图标（纯黑 + 透明背景），系统自动适配深浅模式。
  if (isMac) {
    const macCandidates = roots.flatMap((root) => [
      path.join(root, 'trayIconTemplate@2x.png'),
      path.join(root, 'trayIconTemplate.png'),
      // 兜底使用应用图标
      path.join(root, 'icon.iconset', 'icon_16x16@2x.png'),
      path.join(root, 'icon.iconset', 'icon_16x16.png'),
    ])
    for (const candidate of macCandidates) {
      if (fs.existsSync(candidate)) {
        const image = nativeImage.createFromPath(candidate)
        if (!image.isEmpty()) {
          image.setTemplateImage(true)
          return image
        }
      }
    }
  }

  // Windows 使用 .ico
  if (isWindows) {
    const winCandidates = roots.map((root) => path.join(root, 'icon.ico'))
    for (const candidate of winCandidates) {
      if (fs.existsSync(candidate)) {
        const image = nativeImage.createFromPath(candidate)
        if (!image.isEmpty()) return image
      }
    }
  }

  // Linux / 兜底使用 .png
  const pngCandidates = roots.map((root) => path.join(root, 'icon.png'))
  for (const candidate of pngCandidates) {
    if (fs.existsSync(candidate)) {
      const image = nativeImage.createFromPath(candidate)
      if (!image.isEmpty()) return image
    }
  }

  // 最终兜底：空图标（不应该走到这里）
  return nativeImage.createEmpty()
}

// ---------------------------------------------------------------------------
// 角标渲染
// ---------------------------------------------------------------------------

/**
 * 在托盘 baseIcon 右上角叠加红色角标小圆点。
 * 使用 RGBA bitmap 直接操作像素，不依赖 Canvas。
 */
function createBadgeIcon(base: Electron.NativeImage, count: number): Electron.NativeImage {
  if (count <= 0) return base

  const size = base.getSize()
  const scaleFactor = process.platform === 'darwin' ? 2 : 1
  const pxWidth = size.width * scaleFactor
  const pxHeight = size.height * scaleFactor
  const bitmap = base.toBitmap({ scaleFactor })

  // 在右上角画一个红色圆点（直径约为图标尺寸的 35%）
  const dotRadius = Math.max(3, Math.round(pxWidth * 0.175))
  const cx = pxWidth - dotRadius - 1
  const cy = dotRadius + 1

  for (let y = 0; y < pxHeight; y++) {
    for (let x = 0; x < pxWidth; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= dotRadius * dotRadius) {
        const offset = (y * pxWidth + x) * 4
        // RGBA: 红色圆点
        bitmap[offset] = 239     // R
        bitmap[offset + 1] = 68  // G
        bitmap[offset + 2] = 68  // B
        bitmap[offset + 3] = 255 // A
      }
    }
  }

  const badged = nativeImage.createFromBitmap(bitmap, {
    width: pxWidth,
    height: pxHeight,
    scaleFactor,
  })

  // macOS Template 图标带角标时需要关闭 Template 模式，否则红点会被系统着色。
  if (process.platform === 'darwin') {
    badged.setTemplateImage(false)
  }

  return badged
}

// ---------------------------------------------------------------------------
// 右键菜单
// ---------------------------------------------------------------------------

export type TrayNavigateTarget =
  | 'search'
  | 'ai-assistant'
  | 'workbench'
  | 'calendar'
  | 'email'
  | 'tasks'

export type TrayCallbacks = {
  toggleWindow: () => void
  showWindow: () => void
  newConversation: () => void
  navigateTo: (target: TrayNavigateTarget) => void
  quitApp: () => void
}

function buildContextMenu(callbacks: TrayCallbacks): Electron.Menu {
  return Menu.buildFromTemplate([
    {
      label: t('tray.showHide'),
      click: callbacks.toggleWindow,
    },
    { type: 'separator' },
    {
      label: t('tray.search'),
      click: () => callbacks.navigateTo('search'),
    },
    {
      label: t('tray.aiAssistant'),
      click: () => callbacks.navigateTo('ai-assistant'),
    },
    {
      label: t('tray.workbench'),
      click: () => callbacks.navigateTo('workbench'),
    },
    {
      label: t('tray.calendar'),
      click: () => callbacks.navigateTo('calendar'),
    },
    {
      label: t('tray.email'),
      click: () => callbacks.navigateTo('email'),
    },
    {
      label: t('tray.tasks'),
      click: () => callbacks.navigateTo('tasks'),
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: callbacks.quitApp,
    },
  ])
}

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/**
 * 创建系统托盘图标并绑定事件。
 */
export function createTray(log: Logger, callbacks: TrayCallbacks): Tray {
  if (tray) {
    log('[tray] Tray already exists, destroying old one.')
    tray.destroy()
  }

  savedCallbacks = callbacks
  baseIcon = resolveTrayIcon()
  log(`[tray] Icon resolved: ${baseIcon.isEmpty() ? 'empty' : 'ok'} (${baseIcon.getSize().width}x${baseIcon.getSize().height})`)

  tray = new Tray(baseIcon)
  tray.setToolTip('OpenLoaf')

  const isLinux = process.platform === 'linux'

  if (isLinux) {
    // Linux 不可靠支持 right-click 事件，直接绑定上下文菜单。
    tray.setContextMenu(buildContextMenu(callbacks))
  } else {
    // macOS / Windows：左键切换窗口，右键弹出菜单。
    // 注意：setContextMenu() 在 macOS 上会阻止 click 事件，所以必须手动 popUpContextMenu。
    tray.on('click', () => {
      callbacks.toggleWindow()
    })

    tray.on('right-click', () => {
      tray?.popUpContextMenu(buildContextMenu(savedCallbacks!))
    })

    // 双击始终显示窗口
    tray.on('double-click', () => {
      callbacks.showWindow()
    })
  }

  log('[tray] System tray created.')
  return tray
}

/** 销毁系统托盘。 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

/** 获取当前托盘实例。 */
export function getTray(): Tray | null {
  return tray
}

/** 更新托盘角标计数。count <= 0 时移除角标。 */
export function updateTrayBadge(count: number): void {
  if (!tray || !baseIcon) return

  if (count > 0) {
    tray.setImage(createBadgeIcon(baseIcon, count))
  } else {
    tray.setImage(baseIcon)
  }
}

/** 语言切换后刷新托盘菜单文本。 */
export function refreshTrayMenu(): void {
  if (!tray || !savedCallbacks) return
  // Linux 使用 setContextMenu 绑定菜单；macOS/Windows 由 right-click 动态构建。
  if (process.platform === 'linux') {
    tray.setContextMenu(buildContextMenu(savedCallbacks))
  }
}
