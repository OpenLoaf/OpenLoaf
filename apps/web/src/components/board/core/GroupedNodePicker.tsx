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
  Brush,
  Eraser,
  Image,
  Loader2,
  Mic,
  Music,
  Palette,
  RefreshCcw,
  Scissors,
  Sparkles,
  Type,
  User,
  Video,
  Volume2,
  ZoomIn,
  Expand,
  Languages,
  RefreshCw,
} from 'lucide-react'
import { MEDIA_FEATURES, type MediaFeatureId } from '@openloaf-saas/sdk'

import type { TemplateGroup, TemplateItem } from '../engine/dynamic-templates'
import { toolbarSurfaceClassName } from '../ui/ToolbarParts'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GroupedNodePickerProps {
  position: [number, number]
  align?: 'left' | 'right' | 'center'
  groups: TemplateGroup[]
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
// Feature icon mapping
// ---------------------------------------------------------------------------

const FEATURE_ICON_MAP: Record<string, typeof Image> = {
  imageGenerate: Sparkles,
  imageEdit: Brush,
  imageInpaint: Eraser,
  imageStyleTransfer: Palette,
  upscale: ZoomIn,
  outpaint: Expand,
  materialExtract: Scissors,
  videoGenerate: Video,
  lipSync: Volume2,
  digitalHuman: User,
  videoFaceSwap: RefreshCw,
  videoTranslate: Languages,
  tts: Music,
  speechToText: Mic,
}

const GROUP_ICON_MAP: Record<string, typeof Image> = {
  image: Image,
  video: Video,
  audio: Music,
  text: Type,
}

function resolveFeatureIcon(featureId: string, nodeType: string) {
  const Icon = FEATURE_ICON_MAP[featureId]
  if (Icon) return <Icon size={14} />
  const Fallback = GROUP_ICON_MAP[nodeType] ?? Type
  return <Fallback size={14} />
}

function resolveFeatureLabel(featureId: string, lang: string): string {
  const entry = MEDIA_FEATURES[featureId as MediaFeatureId]
  if (!entry) return featureId
  const label = (entry.label as Record<string, string>)[lang]
  return label ?? (entry.label as Record<string, string>).en ?? featureId
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
    { position, align = 'center', groups, loading, error, onRetry, onSelect, onClose },
    ref,
  ) {
    const { t, i18n } = useTranslation('board')
    const lang = i18n.language.startsWith('zh') ? 'zh' : i18n.language.startsWith('ja') ? 'ja' : 'en'

    const visibleGroups = groups.filter((g) => g.items.length > 0)
    const hasContent = visibleGroups.length > 0

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
            'pointer-events-auto w-[260px] rounded-3xl py-2.5 px-2.5',
            toolbarSurfaceClassName,
          )}
        >
          {/* 加载中 */}
          {loading && !hasContent ? (
            <div className="flex items-center justify-center gap-2 py-6">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
              <span className="text-[12px] text-muted-foreground">{t('nodePicker.loading', { defaultValue: '加载中...' })}</span>
            </div>
          ) : error && !hasContent ? (
            /* 加载失败 */
            <div className="flex flex-col items-center gap-2 py-5">
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
            /* 正常内容：按 image/video/audio 分组网格 */
            visibleGroups.map((group, gi) => {
              const GroupIcon = GROUP_ICON_MAP[group.id] ?? Type
              return (
                <div key={group.id}>
                  {visibleGroups.length > 1 && (
                    <div className="flex items-center gap-1.5 px-1.5 pb-1.5 pt-1">
                      <GroupIcon size={12} className="text-muted-foreground" />
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        {t(`dynamicTemplates.group.${group.id}` as Parameters<typeof t>[0])}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-1">
                    {group.items.map((item) => {
                      const hasMissing = item.missingInputTypes.length > 0
                      return (
                        <button
                          key={item.featureId}
                          type="button"
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            onSelect(item)
                          }}
                          className={cn(
                            'group flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5',
                            'transition-colors duration-100',
                            'hover:bg-foreground/6 dark:hover:bg-foreground/8',
                            // missingInputTypes no longer dims items — user can still connect
                            // and provide missing inputs via additional connections
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-8 w-8 items-center justify-center rounded-xl',
                              'bg-foreground/5 dark:bg-foreground/8',
                              'transition-colors duration-100',
                              'group-hover:bg-foreground/10 dark:group-hover:bg-foreground/14',
                            )}
                          >
                            {resolveFeatureIcon(item.featureId, item.nodeType)}
                          </span>
                          <span className="text-[10px] leading-tight text-center font-medium line-clamp-2 max-w-full">
                            {resolveFeatureLabel(item.featureId, lang)}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {gi < visibleGroups.length - 1 && (
                    <div className="my-1.5 border-t border-foreground/5" />
                  )}
                </div>
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
