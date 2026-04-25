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

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { ModelIcon } from '@/components/setting/menus/provider/ModelIcon'
import type { ModelInputAccept } from '@openloaf/api/common'
import { Check } from 'lucide-react'

// inputAccept → 视觉徽章配色：图像蓝、视频紫、音频琥珀、文件灰、文本中性。
const ACCEPT_COLOR_CLASSES: Record<ModelInputAccept, string> = {
  text: 'bg-secondary text-foreground',
  image: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  video: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  audio: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  file: 'bg-foreground/5 text-muted-foreground dark:bg-foreground/10',
}

// 仅在选项行内 inline 显示的"媒体型"输入：图像/视频/音频。
const MEDIA_ACCEPTS = new Set<ModelInputAccept>(['image', 'video', 'audio'])

interface ModelCheckboxItemProps {
  icon: string | undefined
  modelId?: string
  label: string
  inputAccepts?: ModelInputAccept[]
  maxContextK?: number
  checked: boolean
  disabled?: boolean
  onToggle: () => void
  selectionType?: 'multiple' | 'single'
}

function formatContextK(k?: number): string | null {
  if (!k || !Number.isFinite(k) || k <= 0) return null
  if (k >= 1000) {
    const m = k / 1000
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`
  }
  return `${k}K`
}

export function ModelCheckboxItem({
  icon,
  modelId,
  label,
  inputAccepts,
  maxContextK,
  checked,
  disabled,
  onToggle,
  selectionType = 'multiple',
}: ModelCheckboxItemProps) {
  const { t } = useTranslation('ai')
  const isSingleSelection = selectionType === 'single'
  const mediaAccepts = (inputAccepts ?? []).filter((kind) => MEDIA_ACCEPTS.has(kind))
  const mediaBadges = mediaAccepts.map((kind) => ({
    key: kind,
    label: t(`modelCapabilities.${kind}`, { defaultValue: kind, nsSeparator: false }),
  }))
  const contextLabel = formatContextK(maxContextK)

  return (
    <div
      role={isSingleSelection ? 'radio' : 'checkbox'}
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-3xl px-3 py-2 text-left transition-[background-color,border-color,color] outline-none',
        isSingleSelection && 'border border-transparent',
        disabled
          ? 'pointer-events-none'
          : isSingleSelection
            ? checked
              ? 'border-foreground/20 bg-foreground/8'
              : 'hover:border-border/70 hover:bg-sidebar-accent/60'
            : 'hover:bg-sidebar-accent/60',
        !disabled && isSingleSelection && 'focus-visible:border-foreground/30 focus-visible:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-foreground/15',
      )}
      onClick={disabled ? undefined : onToggle}
      onKeyDown={
        disabled
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onToggle()
              }
            }
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <ModelIcon
            icon={icon}
            model={modelId}
            size={14}
            className="h-3.5 w-3.5 shrink-0"
          />
          <span className="truncate">{label}</span>
          {contextLabel && (
            <span
              className="inline-flex shrink-0 items-center rounded-3xl border border-border/70 px-1.5 py-0.5 text-[9px] font-mono font-normal leading-none text-muted-foreground"
              title={t('mode.maxContext', { defaultValue: 'Max context' })}
            >
              {contextLabel}
            </span>
          )}
          {mediaBadges.length > 0 && (
            <span className="flex shrink-0 items-center gap-1">
              {mediaBadges.map((badge) => (
                <span
                  key={badge.key}
                  className={cn(
                    'inline-flex items-center rounded-3xl px-1.5 py-0.5 text-[9px] font-normal leading-none',
                    ACCEPT_COLOR_CLASSES[badge.key],
                  )}
                >
                  {badge.label}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
      {!disabled && (
        <span
          className={cn(
            'flex shrink-0 items-center justify-center border transition-all',
            isSingleSelection ? 'h-[18px] w-[18px] rounded-full' : 'h-4 w-4 rounded-3xl',
            checked
              ? isSingleSelection
                ? 'border-foreground/40 bg-foreground/10 text-foreground'
                : 'border-primary bg-primary text-primary-foreground'
              : isSingleSelection
                ? 'border-border/80 bg-background/80 text-transparent'
                : 'border-border bg-background text-transparent',
          )}
          tabIndex={-1}
          aria-hidden
        >
          {isSingleSelection ? (
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full transition-transform duration-150',
                checked ? 'scale-100 bg-current' : 'scale-0 bg-transparent',
              )}
            />
          ) : (
            <Check className="h-3 w-3" />
          )}
        </span>
      )}
    </div>
  )
}
