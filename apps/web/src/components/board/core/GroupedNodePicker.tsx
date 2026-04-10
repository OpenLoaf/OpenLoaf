/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import { forwardRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@udecode/cn'
import {
  Image,
  Loader2,
  Music,
  RefreshCcw,
  StickyNote,
  Video,
} from 'lucide-react'

import type { TemplateItem, TemplateList } from '../engine/dynamic-templates'
import { toolbarSurfaceClassName } from '../ui/ToolbarParts'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GroupedNodePickerProps {
  position: [number, number]
  align?: 'left' | 'right' | 'center'
  items: TemplateList
  /** capabilities 是否正在加载。 */
  loading?: boolean
  /** capabilities 加载失败的错误信息。 */
  error?: string | null
  /** 重试加载 capabilities。 */
  onRetry?: () => void
  onSelect: (item: TemplateItem) => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Media type icon & i18n key mapping
// ---------------------------------------------------------------------------

const MEDIA_TYPE_META: Record<string, { icon: typeof Image; titleKey: string; descKey: string }> = {
  image: { icon: Image, titleKey: 'insertTools.image', descKey: 'insertTools.imageDesc' },
  video: { icon: Video, titleKey: 'insertTools.video', descKey: 'insertTools.videoDesc' },
  audio: { icon: Music, titleKey: 'insertTools.audio', descKey: 'insertTools.audioDesc' },
  text: { icon: StickyNote, titleKey: 'insertTools.text', descKey: 'insertTools.textDesc' },
}

function resolveAlignClass(align: GroupedNodePickerProps['align']) {
  switch (align) {
    case 'left':
      return 'translate-x-0'
    case 'right':
      return '-translate-x-full'
    default:
      return '-translate-x-1/2'
  }
}

// ---------------------------------------------------------------------------
// GroupedNodePicker
// ---------------------------------------------------------------------------

export const GroupedNodePicker = forwardRef<HTMLDivElement, GroupedNodePickerProps>(
  function GroupedNodePicker(
    { position, align = 'center', items, loading, error, onRetry, onSelect, onClose },
    ref,
  ) {
    const { t } = useTranslation('board')

    const hasContent = items.length > 0
    const [activeIndex, setActiveIndex] = useState(0)

    // items 变化时重置高亮到第一项
    useEffect(() => {
      setActiveIndex(0)
    }, [items])

    // 键盘操作：↑↓ 选择、Enter 确认、Esc 关闭、数字键 1-9 快速选择
    useEffect(() => {
      if (!hasContent) return
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onClose()
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          e.stopPropagation()
          setActiveIndex((i) => (i + 1) % items.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          e.stopPropagation()
          setActiveIndex((i) => (i - 1 + items.length) % items.length)
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          const item = items[activeIndex]
          if (item) onSelect(item)
          return
        }
        // 数字键 1-9 直接选择对应项
        if (e.key >= '1' && e.key <= '9') {
          const idx = Number(e.key) - 1
          if (idx < items.length) {
            e.preventDefault()
            e.stopPropagation()
            onSelect(items[idx]!)
          }
        }
      }
      // capture 阶段拦截，避免画布全局快捷键先消费
      window.addEventListener('keydown', handleKeyDown, true)
      return () => window.removeEventListener('keydown', handleKeyDown, true)
    }, [hasContent, items, activeIndex, onSelect, onClose])

    return (
      <div
        ref={ref}
        data-node-picker
        className={cn(
          'pointer-events-none absolute z-30 -translate-y-1/2',
          resolveAlignClass(align),
        )}
        style={{ left: position[0], top: position[1] }}
      >
        {/* 透明背景 */}
        <div
          className="pointer-events-auto fixed inset-0 -z-10"
          onPointerDown={(e) => {
            e.stopPropagation()
            onClose()
          }}
        />

        <div
          data-connector-drop-panel
          className={cn(
            'pointer-events-auto w-[220px] rounded-3xl py-2',
            toolbarSurfaceClassName,
          )}
        >
          {/* 加载中 */}
          {loading && !hasContent ? (
            <div className="flex items-center justify-center gap-2 py-6 px-4">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
              <span className="text-[12px] text-muted-foreground">{t('nodePicker.loading', { defaultValue: '加载中...' })}</span>
            </div>
          ) : error && !hasContent ? (
            /* 加载失败 */
            <div className="flex flex-col items-center gap-2 py-5 px-4">
              <span className="text-[12px] text-muted-foreground">{t('nodePicker.loadError', { defaultValue: '能力加载失败' })}</span>
              {onRetry && (
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onRetry()
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5',
                    'text-[11px] font-medium text-foreground',
                    'bg-foreground/5 hover:bg-foreground/10 transition-colors duration-100',
                  )}
                >
                  <RefreshCcw size={12} />
                  {t('nodePicker.retry', { defaultValue: '重试' })}
                </button>
              )}
            </div>
          ) : hasContent ? (
            /* 媒体类型列表 — 与 FloatingInsertMenu 同风格 */
            items.map((item, index) => {
              const meta = MEDIA_TYPE_META[item.mediaType]
              const Icon = meta?.icon ?? Image
              const title = meta ? t(meta.titleKey as Parameters<typeof t>[0]) : item.mediaType
              const description = meta ? (t(meta.descKey as Parameters<typeof t>[0]) || undefined) : undefined
              const isActive = index === activeIndex
              return (
                <button
                  key={item.mediaType}
                  type="button"
                  onPointerEnter={() => setActiveIndex(index)}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onSelect(item)
                  }}
                  className={cn(
                    'group flex w-full items-center gap-3 px-3.5 py-2',
                    'transition-colors duration-100 rounded-3xl mx-0',
                    isActive && 'bg-foreground/6 dark:bg-foreground/8',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-3xl',
                      'bg-foreground/5 dark:bg-foreground/8',
                      'transition-colors duration-100',
                      isActive && 'bg-foreground/8 dark:bg-foreground/12',
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
                    <span className="text-[13px] font-medium leading-tight">{title}</span>
                    {description && (
                      <span className="text-[11px] leading-tight text-ol-text-auxiliary truncate max-w-[160px]">
                        {description}
                      </span>
                    )}
                  </div>
                </button>
              )
            })
          ) : (
            <div className="px-3 py-3 text-[11px] text-ol-text-auxiliary text-center">
              {t('nodePicker.empty')}
            </div>
          )}
        </div>
      </div>
    )
  },
)

GroupedNodePicker.displayName = 'GroupedNodePicker'
