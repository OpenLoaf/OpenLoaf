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

import { forwardRef } from 'react'
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
            items.map((item) => {
              const meta = MEDIA_TYPE_META[item.mediaType]
              const Icon = meta?.icon ?? Image
              const title = meta ? t(meta.titleKey as Parameters<typeof t>[0]) : item.mediaType
              const description = meta ? (t(meta.descKey as Parameters<typeof t>[0]) || undefined) : undefined
              return (
                <button
                  key={item.mediaType}
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onSelect(item)
                  }}
                  className={cn(
                    'group flex w-full items-center gap-3 px-3.5 py-2',
                    'transition-colors duration-100 rounded-3xl mx-0',
                    'hover:bg-foreground/6 dark:hover:bg-foreground/8',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-3xl',
                      'bg-foreground/5 dark:bg-foreground/8',
                      'transition-colors duration-100',
                      'group-hover:bg-foreground/8 dark:group-hover:bg-foreground/12',
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  <div className="flex flex-col items-start gap-0.5 min-w-0">
                    <span className="text-[13px] font-medium leading-tight">{title}</span>
                    {description && (
                      <span className="max-h-0 overflow-hidden opacity-0 group-hover:max-h-5 group-hover:opacity-100 transition-all duration-150 ease-out text-[11px] leading-tight text-ol-text-auxiliary truncate max-w-[140px]">
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
