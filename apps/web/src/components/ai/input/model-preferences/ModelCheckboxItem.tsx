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
import type { ModelTag } from '@openloaf/api/common'
import { Check } from 'lucide-react'

const TAG_COLOR_CLASSES: Record<string, string> = {
  // 对话类
  chat: 'bg-ol-blue/15 text-ol-blue',
  code: 'bg-ol-blue/15 text-ol-blue',
  tool_call:
    'bg-ol-green/15 text-ol-green',
  reasoning:
    'bg-ol-amber/20 text-ol-amber',
  // 图像类
  image_generation:
    'bg-fuchsia-500/15 text-fuchsia-700 dark:bg-fuchsia-500/25 dark:text-fuchsia-200',
  image_input:
    'bg-ol-red/15 text-ol-red',
  image_multi_input:
    'bg-ol-red/15 text-ol-red',
  image_multi_generation:
    'bg-purple-500/15 text-purple-700 dark:bg-purple-500/25 dark:text-purple-200',
  image_edit:
    'bg-ol-amber/15 text-ol-amber',
  image_analysis:
    'bg-ol-blue/15 text-ol-blue',
  // 视频类
  video_generation:
    'bg-ol-purple/15 text-ol-purple',
  video_analysis:
    'bg-ol-purple/15 text-ol-purple',
  // 音频类
  audio_analysis:
    'bg-ol-green/15 text-ol-green',
  default: 'bg-foreground/5 text-muted-foreground dark:bg-foreground/10',
}

interface ModelCheckboxItemProps {
  icon: string | undefined
  modelId?: string
  label: string
  tags?: ModelTag[]
  checked: boolean
  disabled?: boolean
  onToggle: () => void
  selectionType?: 'multiple' | 'single'
}

export function ModelCheckboxItem({
  icon,
  modelId,
  label,
  tags,
  checked,
  disabled,
  onToggle,
  selectionType = 'multiple',
}: ModelCheckboxItemProps) {
  const { t } = useTranslation('ai')
  const isSingleSelection = selectionType === 'single'
  const tagLabels =
    tags && tags.length > 0
      ? tags.map((tag) => ({
          key: tag,
          label: t(`modelTags.${tag}`, { defaultValue: tag }),
        }))
      : []

  return (
    <div
      role={isSingleSelection ? 'radio' : 'checkbox'}
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-[background-color,border-color,color] outline-none',
        isSingleSelection && 'border border-transparent',
        disabled
          ? 'pointer-events-none'
          : isSingleSelection
            ? checked
              ? 'border-ol-blue/20 bg-ol-blue/8'
              : 'hover:border-border/70 hover:bg-sidebar-accent/60'
            : 'hover:bg-sidebar-accent/60',
        !disabled && isSingleSelection && 'focus-visible:border-ol-blue/30 focus-visible:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-ol-blue/15',
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
        </div>
        {tagLabels.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5.5">
            {tagLabels.map((tag) => (
              <span
                key={tag.key}
                className={cn(
                  'inline-flex items-center rounded-md px-2 py-0.5 text-[9px] leading-none',
                  TAG_COLOR_CLASSES[tag.key] ?? TAG_COLOR_CLASSES.default,
                )}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {!disabled && (
        <span
          className={cn(
            'flex shrink-0 items-center justify-center border transition-all',
            isSingleSelection ? 'h-[18px] w-[18px] rounded-full' : 'h-4 w-4 rounded-sm',
            checked
              ? isSingleSelection
                ? 'border-ol-blue/40 bg-ol-blue/10 text-ol-blue'
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
