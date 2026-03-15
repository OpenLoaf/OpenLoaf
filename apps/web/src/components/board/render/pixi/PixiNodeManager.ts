/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import {
  Container,
  Graphics,
  Text,
  Sprite,
  Texture,
  Assets,
  type TextStyleOptions,
} from 'pixi.js'
import type { CanvasEngine } from '../../engine/CanvasEngine'
import type { CanvasNodeElement } from '../../engine/types'
import { isGroupNodeType } from '../../engine/grouping'
import type { PixiThemeResolver } from './PixiThemeResolver'

/** Per-node PixiJS state. */
type PixiNodeState = {
  container: Container
  bg: Graphics
  label: Text | null
  sprite: Sprite | null
  iconGfx: Graphics | null
  lastXywh: string
  lastProps: string
  lastZIndex: number
}

/** 节点类型到图标配色映射 */
const NODE_TYPE_THEME: Record<
  string,
  { iconColor: number; headerColor: number; label: string }
> = {
  audio: { iconColor: 0xf59e0b, headerColor: 0x78350f, label: 'Audio' },
  video: { iconColor: 0x3b82f6, headerColor: 0x1e3a5f, label: 'Video' },
  'file-attachment': {
    iconColor: 0x8b5cf6,
    headerColor: 0x3b1f6e,
    label: 'File',
  },
  link: { iconColor: 0x06b6d4, headerColor: 0x164e63, label: 'Link' },
  calendar: { iconColor: 0x10b981, headerColor: 0x064e3b, label: 'Calendar' },
  chat_input: { iconColor: 0x6366f1, headerColor: 0x312e81, label: 'Chat' },
  chat_message: {
    iconColor: 0x8b5cf6,
    headerColor: 0x3b1f6e,
    label: 'Message',
  },
  image_generate: {
    iconColor: 0xec4899,
    headerColor: 0x831843,
    label: 'AI Image',
  },
  image_prompt_generate: {
    iconColor: 0xec4899,
    headerColor: 0x831843,
    label: 'AI Prompt',
  },
  video_generate: {
    iconColor: 0xf43f5e,
    headerColor: 0x881337,
    label: 'AI Video',
  },
  loading: { iconColor: 0x94a3b8, headerColor: 0x334155, label: 'Loading' },
}

const BASE_TEXT_STYLE: TextStyleOptions = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 14,
  fill: 0xffffff,
  wordWrap: true,
  wordWrapWidth: 280,
}

/**
 * Manages PixiJS containers for all canvas node elements.
 * On each sync(), diffs the engine snapshot against current nodes
 * and creates/updates/destroys PixiJS objects as needed.
 *
 * 渲染策略：
 * - TextNode: 圆角矩形背景 + 纯文本内容
 * - ImageNode: 异步加载 Sprite，带加载占位和错误处理
 * - VideoNode: 缩略图 + 播放图标叠层
 * - StrokeNode: 由 PixiStrokeLayer 独立渲染
 * - GroupNode: 半透明组框
 * - 其他: 带图标的卡片样式
 */
export class PixiNodeManager {
  private engine: CanvasEngine
  private nodeLayer: Container
  private theme: PixiThemeResolver
  private nodes = new Map<string, PixiNodeState>()
  private lastRevision = -1
  /** 已提交的纹理加载请求（避免重复加载） */
  private pendingTextures = new Set<string>()

  constructor(
    engine: CanvasEngine,
    nodeLayer: Container,
    theme: PixiThemeResolver,
  ) {
    this.engine = engine
    this.nodeLayer = nodeLayer
    this.theme = theme
  }

  /** Synchronize PixiJS nodes with engine state. */
  sync(): void {
    const snapshot = this.engine.getSnapshot()
    if (snapshot.docRevision === this.lastRevision) return
    this.lastRevision = snapshot.docRevision

    const palette = this.theme.getPalette()
    const currentIds = new Set<string>()

    // 按 zIndex 排序的节点元素
    const nodeElements = snapshot.elements.filter(
      (el): el is CanvasNodeElement => el.kind === 'node',
    )

    for (const element of nodeElements) {
      currentIds.add(element.id)
      const existing = this.nodes.get(element.id)
      const xywhKey = element.xywh.join(',')
      const propsKey = JSON.stringify(element.props ?? {})
      const zIndex = element.zIndex ?? 0

      if (existing) {
        // 更新已有节点
        if (existing.lastXywh !== xywhKey) {
          this.applyTransform(existing.container, element)
          existing.lastXywh = xywhKey
          // 尺寸变化时也需要重绘
          this.redrawNode(existing, element, palette)
        }
        if (existing.lastProps !== propsKey) {
          existing.lastProps = propsKey
          this.redrawNode(existing, element, palette)
        }
        if (existing.lastZIndex !== zIndex) {
          existing.container.zIndex = zIndex
          existing.lastZIndex = zIndex
        }
      } else {
        // 创建新节点
        const state = this.createNode(element, palette)
        this.nodes.set(element.id, state)
        this.nodeLayer.addChild(state.container)
      }
    }

    // 删除已移除的节点
    for (const [id, state] of this.nodes) {
      if (!currentIds.has(id)) {
        this.nodeLayer.removeChild(state.container)
        state.container.destroy({ children: true })
        this.nodes.delete(id)
      }
    }
  }

  /** Create a PixiJS node container for an element. */
  private createNode(
    element: CanvasNodeElement,
    palette: ReturnType<PixiThemeResolver['getPalette']>,
  ): PixiNodeState {
    const container = new Container()
    container.label = `node:${element.id}`
    container.cullable = true

    const bg = new Graphics()
    container.addChild(bg)

    let label: Text | null = null
    let sprite: Sprite | null = null
    let iconGfx: Graphics | null = null

    const [, , w, h] = element.xywh

    if (isGroupNodeType(element.type)) {
      this.drawGroupNode(bg, w, h, palette)
    } else if (element.type === 'text') {
      const result = this.drawTextNode(bg, element, w, h, palette)
      label = result.label
      if (label) container.addChild(label)
    } else if (element.type === 'image') {
      const result = this.drawImageNode(container, bg, element, w, h, palette)
      sprite = result.sprite
    } else if (element.type === 'video') {
      const result = this.drawVideoNode(container, bg, element, w, h, palette)
      sprite = result.sprite
      label = result.label
      iconGfx = result.iconGfx
    } else if (element.type === 'stroke') {
      // 笔画节点：由 PixiStrokeLayer 独立渲染，这里只做透明占位
      // 不绘制任何内容
    } else {
      // 卡片式节点：音频、文件、链接、日历、聊天等
      const result = this.drawCardNode(container, bg, element, w, h, palette)
      label = result.label
      iconGfx = result.iconGfx
    }

    this.applyTransform(container, element)
    container.zIndex = element.zIndex ?? 0
    if (element.opacity !== undefined) {
      container.alpha = element.opacity
    }

    return {
      container,
      bg,
      label,
      sprite,
      iconGfx,
      lastXywh: element.xywh.join(','),
      lastProps: JSON.stringify(element.props ?? {}),
      lastZIndex: element.zIndex ?? 0,
    }
  }

  // -----------------------------------------------------------------------
  // 分组节点
  // -----------------------------------------------------------------------

  private drawGroupNode(
    bg: Graphics,
    w: number,
    h: number,
    palette: ReturnType<PixiThemeResolver['getPalette']>,
  ): void {
    bg.roundRect(0, 0, w, h, 8)
    bg.fill({ color: palette.groupOutline, alpha: 0.1 })
    bg.stroke({ color: palette.groupOutline, width: 1, alpha: 0.3 })
  }

  // -----------------------------------------------------------------------
  // 文本节点
  // -----------------------------------------------------------------------

  private drawTextNode(
    bg: Graphics,
    element: CanvasNodeElement,
    w: number,
    h: number,
    palette: ReturnType<PixiThemeResolver['getPalette']>,
  ): { label: Text | null } {
    const props = element.props as Record<string, unknown>
    const bgColor = this.resolveTextBgColor(props, palette)
    const textColor = this.resolveTextColor(props, palette)
    const fontSize = (props.fontSize as number) || 14
    const textAlign = (props.textAlign as string) || 'left'

    // 背景
    bg.roundRect(0, 0, w, h, 8)
    bg.fill({ color: bgColor })

    // 提取纯文本
    const plainText = this.extractPlainText(props.value)
    if (!plainText) return { label: null }

    const label = new Text({
      text: plainText.slice(0, 500),
      style: {
        ...BASE_TEXT_STYLE,
        fill: textColor,
        fontSize: Math.min(fontSize, 24),
        wordWrapWidth: Math.max(40, w - 24),
        align: textAlign as 'left' | 'center' | 'right',
        lineHeight: fontSize * 1.5,
      },
    })
    label.position.set(12, 12)

    // 裁剪文本到节点高度
    const maxTextHeight = Math.max(0, h - 24)
    if (label.height > maxTextHeight) {
      const mask = new Graphics()
      mask.rect(0, 0, w, h)
      mask.fill({ color: 0xffffff })
      label.mask = mask
      label.parent?.addChild(mask)
    }

    return { label }
  }

  /** 解析文本节点背景色 */
  private resolveTextBgColor(
    props: Record<string, unknown>,
    palette: ReturnType<PixiThemeResolver['getPalette']>,
  ): number {
    const bgStr = props.backgroundColor as string | undefined
    if (bgStr) {
      const parsed = this.parseCssColor(bgStr)
      if (parsed !== null) return parsed
    }
    return palette.nodeBg
  }

  /** 解析文本节点文字颜色 */
  private resolveTextColor(
    props: Record<string, unknown>,
    palette: ReturnType<PixiThemeResolver['getPalette']>,
  ): number {
    const colorStr = props.color as string | undefined
    if (colorStr) {
      const parsed = this.parseCssColor(colorStr)
      if (parsed !== null) return parsed
    }
    return palette.nodeText
  }

  /** 从 Plate.js Value 或字符串中提取纯文本 */
  private extractPlainText(value: unknown): string {
    if (typeof value === 'string') return value

    if (!Array.isArray(value)) return ''

    // Plate.js Value 是一个节点数组
    const parts: string[] = []
    const extract = (nodes: unknown[]): void => {
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue
        const n = node as Record<string, unknown>
        if (typeof n.text === 'string') {
          parts.push(n.text)
        }
        if (Array.isArray(n.children)) {
          extract(n.children)
          parts.push('\n')
        }
      }
    }
    extract(value)
    return parts.join('').trim()
  }

  // -----------------------------------------------------------------------
  // 图片节点
  // -----------------------------------------------------------------------

  private drawImageNode(
    container: Container,
    bg: Graphics,
    element: CanvasNodeElement,
    w: number,
    h: number,
    palette: ReturnType<PixiThemeResolver['getPalette']>,
  ): { sprite: Sprite | null } {
    const props = element.props as Record<string, unknown>
    const src =
      (props.previewSrc as string) || (props.originalSrc as string) || ''

    // 先绘制加载占位背景（棋盘格效果用简单灰色代替）
    bg.roundRect(0, 0, w, h, 8)
    bg.fill({ color: palette.nodeBg })

    if (!src) return { sprite: null }

    // 异步加载纹理
    const textureKey = `img:${element.id}:${src.slice(0, 100)}`
    if (!this.pendingTextures.has(textureKey)) {
      this.pendingTextures.add(textureKey)
      this.loadImageTexture(element.id, src, w, h)
    }

    return { sprite: null }
  }

  /** 异步加载图片纹理并绑定到节点 */
  private async loadImageTexture(
    nodeId: string,
    src: string,
    w: number,
    h: number,
  ): Promise<void> {
    try {
      // 处理相对路径：添加服务器基地址
      let resolvedSrc = src
      if (
        !src.startsWith('data:') &&
        !src.startsWith('blob:') &&
        !src.startsWith('http://') &&
        !src.startsWith('https://') &&
        !src.startsWith('/')
      ) {
        resolvedSrc = `/${src}`
      }

      const texture = await Assets.load<Texture>(resolvedSrc)
      const state = this.nodes.get(nodeId)
      if (!state) return // 节点已被删除

      // 创建 Sprite 并设置尺寸
      const sprite = new Sprite(texture)
      const [, , currentW, currentH] = this.getCurrentXywh(nodeId)
      sprite.width = currentW || w
      sprite.height = currentH || h

      // 隐藏占位背景
      state.bg.clear()
      state.bg.roundRect(0, 0, currentW || w, currentH || h, 8)
      state.bg.fill({ color: 0x000000, alpha: 0 })

      state.sprite = sprite
      state.container.addChild(sprite)
    } catch {
      // 加载失败：显示错误占位
      const state = this.nodes.get(nodeId)
      if (!state) return
      const palette = this.theme.getPalette()
      const [, , currentW, currentH] = this.getCurrentXywh(nodeId)
      const cw = currentW || w
      const ch = currentH || h
      state.bg.clear()
      state.bg.roundRect(0, 0, cw, ch, 8)
      state.bg.fill({ color: palette.nodeBg })
      state.bg.stroke({ color: palette.nodeBorder, width: 1 })

      // 绘制 X 标记表示加载失败
      const errGfx = new Graphics()
      errGfx.setStrokeStyle({ width: 2, color: 0x888888, alpha: 0.5 })
      const cx = cw / 2
      const cy = ch / 2
      const s = Math.min(16, Math.min(cw, ch) * 0.2)
      errGfx.moveTo(cx - s, cy - s)
      errGfx.lineTo(cx + s, cy + s)
      errGfx.moveTo(cx + s, cy - s)
      errGfx.lineTo(cx - s, cy + s)
      errGfx.stroke()
      state.container.addChild(errGfx)
    }
  }

  /** 获取节点的当前 xywh（可能已更新） */
  private getCurrentXywh(
    nodeId: string,
  ): [number, number, number, number] {
    const snapshot = this.engine.getSnapshot()
    const el = snapshot.elements.find(
      (e) => e.kind === 'node' && e.id === nodeId,
    )
    if (el && el.kind === 'node') return el.xywh
    return [0, 0, 0, 0]
  }

  // -----------------------------------------------------------------------
  // 视频节点
  // -----------------------------------------------------------------------

  private drawVideoNode(
    container: Container,
    bg: Graphics,
    element: CanvasNodeElement,
    w: number,
    h: number,
    palette: ReturnType<PixiThemeResolver['getPalette']>,
  ): { sprite: Sprite | null; label: Text | null; iconGfx: Graphics | null } {
    const props = element.props as Record<string, unknown>
    const posterSrc = (props.posterPath as string) || ''
    const fileName =
      (props.fileName as string) ||
      ((props.sourcePath as string) || '').split('/').pop() ||
      'Video'

    // 背景
    bg.roundRect(0, 0, w, h, 8)
    bg.fill({ color: palette.nodeBg })
    bg.stroke({ color: palette.nodeBorder, width: 1 })

    // 加载缩略图
    let sprite: Sprite | null = null
    if (posterSrc) {
      const textureKey = `poster:${element.id}:${posterSrc.slice(0, 100)}`
      if (!this.pendingTextures.has(textureKey)) {
        this.pendingTextures.add(textureKey)
        this.loadImageTexture(element.id, posterSrc, w, h)
      }
    }

    // 播放按钮图标
    const iconGfx = new Graphics()
    const cx = w / 2
    const cy = h / 2
    const btnR = Math.min(24, Math.min(w, h) * 0.15)

    // 圆形背景
    iconGfx.circle(cx, cy, btnR)
    iconGfx.fill({ color: 0x000000, alpha: 0.5 })
    iconGfx.stroke({ color: 0xffffff, width: 1.5, alpha: 0.6 })

    // 三角形播放图标
    const triSize = btnR * 0.5
    iconGfx.moveTo(cx - triSize * 0.4, cy - triSize)
    iconGfx.lineTo(cx - triSize * 0.4, cy + triSize)
    iconGfx.lineTo(cx + triSize * 0.8, cy)
    iconGfx.closePath()
    iconGfx.fill({ color: 0xffffff, alpha: 0.9 })
    container.addChild(iconGfx)

    // 底部文件名
    const label = new Text({
      text: fileName,
      style: {
        ...BASE_TEXT_STYLE,
        fontSize: 11,
        fill: 0xffffff,
        wordWrapWidth: Math.max(40, w - 16),
      },
    })
    label.position.set(8, h - 24)
    label.alpha = 0.9
    container.addChild(label)

    return { sprite, label, iconGfx }
  }

  // -----------------------------------------------------------------------
  // 卡片式节点（音频、文件、链接、日历等）
  // -----------------------------------------------------------------------

  private drawCardNode(
    container: Container,
    bg: Graphics,
    element: CanvasNodeElement,
    w: number,
    h: number,
    palette: ReturnType<PixiThemeResolver['getPalette']>,
  ): { label: Text | null; iconGfx: Graphics | null } {
    const themeEntry = NODE_TYPE_THEME[element.type]
    const iconColor = themeEntry?.iconColor ?? palette.nodeText
    const headerColor = themeEntry?.headerColor ?? palette.nodeBg

    // 圆角矩形背景
    bg.roundRect(0, 0, w, h, 8)
    bg.fill({ color: palette.nodeBg })
    bg.stroke({ color: palette.nodeBorder, width: 1 })

    // 顶部色带
    const headerH = Math.min(36, h * 0.35)
    const iconGfx = new Graphics()
    // 顶部圆角矩形
    iconGfx.roundRect(0, 0, w, headerH, 8)
    iconGfx.fill({ color: headerColor, alpha: 0.7 })
    // 遮挡下方圆角
    iconGfx.rect(0, headerH - 8, w, 8)
    iconGfx.fill({ color: headerColor, alpha: 0.7 })

    // 图标圆点
    const iconR = Math.min(10, headerH * 0.3)
    const iconCx = 12 + iconR
    const iconCy = headerH / 2
    iconGfx.circle(iconCx, iconCy, iconR)
    iconGfx.fill({ color: iconColor, alpha: 0.9 })

    container.addChild(iconGfx)

    // 标题文本
    const title = this.getNodeTitle(element)
    const label = new Text({
      text: title,
      style: {
        ...BASE_TEXT_STYLE,
        fontSize: 12,
        fill: 0xffffff,
        wordWrapWidth: Math.max(40, w - iconCx - iconR - 20),
      },
    })
    label.position.set(iconCx + iconR + 8, iconCy - 7)
    label.alpha = 0.95
    container.addChild(label)

    // 副标题/描述
    const desc = this.getNodeDescription(element)
    if (desc && h > headerH + 20) {
      const descLabel = new Text({
        text: desc.slice(0, 200),
        style: {
          ...BASE_TEXT_STYLE,
          fontSize: 11,
          fill: palette.nodeText,
          wordWrapWidth: Math.max(40, w - 24),
        },
      })
      descLabel.position.set(12, headerH + 8)
      descLabel.alpha = 0.7
      container.addChild(descLabel)
    }

    return { label, iconGfx }
  }

  // -----------------------------------------------------------------------
  // 重绘逻辑
  // -----------------------------------------------------------------------

  /** Redraw a node's visual content after props or size change. */
  private redrawNode(
    state: PixiNodeState,
    element: CanvasNodeElement,
    palette: ReturnType<PixiThemeResolver['getPalette']>,
  ): void {
    const [, , w, h] = element.xywh
    state.bg.clear()

    // 移除旧的额外子元素（保留 bg, label, sprite）
    // 简单做法：直接更新核心内容

    if (isGroupNodeType(element.type)) {
      this.drawGroupNode(state.bg, w, h, palette)
    } else if (element.type === 'text') {
      const props = element.props as Record<string, unknown>
      const bgColor = this.resolveTextBgColor(props, palette)
      const textColor = this.resolveTextColor(props, palette)
      const fontSize = (props.fontSize as number) || 14
      state.bg.roundRect(0, 0, w, h, 8)
      state.bg.fill({ color: bgColor })

      if (state.label) {
        const plainText = this.extractPlainText(props.value)
        state.label.text = plainText.slice(0, 500)
        state.label.style.fill = textColor
        state.label.style.fontSize = Math.min(fontSize, 24)
        state.label.style.wordWrapWidth = Math.max(40, w - 24)
        state.label.style.lineHeight = fontSize * 1.5
      }
    } else if (element.type === 'image') {
      state.bg.roundRect(0, 0, w, h, 8)
      state.bg.fill({ color: palette.nodeBg })
      if (state.sprite) {
        state.sprite.width = w
        state.sprite.height = h
      }
    } else if (element.type === 'video') {
      state.bg.roundRect(0, 0, w, h, 8)
      state.bg.fill({ color: palette.nodeBg })
      state.bg.stroke({ color: palette.nodeBorder, width: 1 })
      if (state.sprite) {
        state.sprite.width = w
        state.sprite.height = h
      }
      if (state.label) {
        const props = element.props as Record<string, unknown>
        const fileName =
          (props.fileName as string) ||
          ((props.sourcePath as string) || '').split('/').pop() ||
          'Video'
        state.label.text = fileName
        state.label.position.set(8, h - 24)
        state.label.style.wordWrapWidth = Math.max(40, w - 16)
      }
      // 更新播放按钮位置
      if (state.iconGfx) {
        const cx = w / 2
        const cy = h / 2
        const btnR = Math.min(24, Math.min(w, h) * 0.15)
        state.iconGfx.clear()
        state.iconGfx.circle(cx, cy, btnR)
        state.iconGfx.fill({ color: 0x000000, alpha: 0.5 })
        state.iconGfx.stroke({ color: 0xffffff, width: 1.5, alpha: 0.6 })
        const triSize = btnR * 0.5
        state.iconGfx.moveTo(cx - triSize * 0.4, cy - triSize)
        state.iconGfx.lineTo(cx - triSize * 0.4, cy + triSize)
        state.iconGfx.lineTo(cx + triSize * 0.8, cy)
        state.iconGfx.closePath()
        state.iconGfx.fill({ color: 0xffffff, alpha: 0.9 })
      }
    } else if (element.type === 'stroke') {
      // 笔画节点由 PixiStrokeLayer 渲染
    } else {
      // 卡片式节点重绘
      state.bg.roundRect(0, 0, w, h, 8)
      state.bg.fill({ color: palette.nodeBg })
      state.bg.stroke({ color: palette.nodeBorder, width: 1 })

      if (state.label) {
        const title = this.getNodeTitle(element)
        state.label.text = title
      }
      if (state.iconGfx) {
        const themeEntry = NODE_TYPE_THEME[element.type]
        const headerColor = themeEntry?.headerColor ?? palette.nodeBg
        const iconColor = themeEntry?.iconColor ?? palette.nodeText
        const headerH = Math.min(36, h * 0.35)
        state.iconGfx.clear()
        state.iconGfx.roundRect(0, 0, w, headerH, 8)
        state.iconGfx.fill({ color: headerColor, alpha: 0.7 })
        state.iconGfx.rect(0, headerH - 8, w, 8)
        state.iconGfx.fill({ color: headerColor, alpha: 0.7 })
        const iconR = Math.min(10, headerH * 0.3)
        state.iconGfx.circle(12 + iconR, headerH / 2, iconR)
        state.iconGfx.fill({ color: iconColor, alpha: 0.9 })
      }
    }
  }

  // -----------------------------------------------------------------------
  // 辅助方法
  // -----------------------------------------------------------------------

  /** Apply position and rotation to a container. */
  private applyTransform(
    container: Container,
    element: CanvasNodeElement,
  ): void {
    const [x, y, w, h] = element.xywh
    container.position.set(x, y)
    if (element.rotate) {
      container.pivot.set(w / 2, h / 2)
      container.position.set(x + w / 2, y + h / 2)
      container.rotation = (element.rotate * Math.PI) / 180
    } else {
      container.pivot.set(0, 0)
      container.rotation = 0
    }
  }

  /** Extract a display title from node props. */
  private getNodeTitle(element: CanvasNodeElement): string {
    const props = element.props as Record<string, unknown>
    if (typeof props.title === 'string' && props.title) return props.title
    if (typeof props.fileName === 'string' && props.fileName)
      return props.fileName
    if (typeof props.name === 'string' && props.name) return props.name
    if (typeof props.label === 'string' && props.label) return props.label
    if (typeof props.url === 'string' && props.url) {
      try {
        return new URL(props.url).hostname.replace(/^www\./, '')
      } catch {
        return props.url.slice(0, 40)
      }
    }
    if (typeof props.sourcePath === 'string' && props.sourcePath) {
      return props.sourcePath.split('/').pop() || props.sourcePath
    }
    if (typeof props.text === 'string') return props.text.slice(0, 100)
    // 回退到节点类型标签
    const themeEntry = NODE_TYPE_THEME[element.type]
    return themeEntry?.label ?? element.type
  }

  /** 获取节点描述文本 */
  private getNodeDescription(element: CanvasNodeElement): string {
    const props = element.props as Record<string, unknown>
    if (typeof props.description === 'string') return props.description
    if (typeof props.url === 'string') return props.url
    if (typeof props.sourcePath === 'string') return props.sourcePath
    return ''
  }

  /** Parse CSS color string to PixiJS hex number. */
  private parseCssColor(color: string): number | null {
    if (!color) return null
    const trimmed = color.trim()
    if (trimmed.startsWith('#')) {
      let hex = trimmed.slice(1)
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
      }
      if (hex.length >= 6) {
        return Number.parseInt(hex.slice(0, 6), 16)
      }
    }
    const rgbMatch = trimmed.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
    )
    if (rgbMatch) {
      const r = Number.parseInt(rgbMatch[1], 10)
      const g = Number.parseInt(rgbMatch[2], 10)
      const b = Number.parseInt(rgbMatch[3], 10)
      return (r << 16) | (g << 8) | b
    }
    return null
  }

  /** Set the visibility of a specific node by id. */
  setNodeVisible(nodeId: string, visible: boolean): void {
    const state = this.nodes.get(nodeId)
    if (state) {
      state.container.visible = visible
    }
  }

  destroy(): void {
    for (const [, state] of this.nodes) {
      state.container.destroy({ children: true })
    }
    this.nodes.clear()
    this.pendingTextures.clear()
  }
}
