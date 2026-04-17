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
  chat: 'bg-secondary text-foreground',
  code: 'bg-secondary text-foreground',
  tool_call: 'bg-secondary text-foreground',
  reasoning: 'bg-secondary text-foreground',
  // 图像类 —— 蓝色系
  image_generation:
    'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  image_input:
    'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  image_multi_input:
    'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  image_multi_generation:
    'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  image_edit:
    'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  image_analysis:
    'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  // 视频类 —— 紫色系
  video_generation:
    'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  video_analysis:
    'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  // 音频类 —— 琥珀色系
  audio_analysis:
    'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  audio_tts:
    'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
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
  const MEDIA_TAG_KEYS = new Set(['image_input', 'video_analysis', 'audio_analysis'])
  const tagLabels =
    tags && tags.length > 0
      ? tags.map((tag) => ({
          key: tag,
          label: t(`modelTags.${tag}`, { defaultValue: tag, nsSeparator: false }),
        }))
      : []
  const mediaTags =
    tags && tags.length > 0
      ? tags
          .filter((tag) => MEDIA_TAG_KEYS.has(tag))
          .map((tag) => ({
            key: tag,
            label: t(`modelTagsShort.${tag}`, { defaultValue: tag, nsSeparator: false }),
          }))
      : []
  const restTagLabels = tagLabels.filter((tag) => !MEDIA_TAG_KEYS.has(tag.key))

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
          {mediaTags.length > 0 && (
            <span className="flex shrink-0 items-center gap-1">
              {mediaTags.map((tag) => (
                <span
                  key={tag.key}
                  className={cn(
                    'inline-flex items-center rounded-3xl px-1.5 py-0.5 text-[9px] font-normal leading-none',
                    TAG_COLOR_CLASSES[tag.key] ?? TAG_COLOR_CLASSES.default,
                  )}
                >
                  {tag.label}
                </span>
              ))}
            </span>
          )}
        </div>
        {restTagLabels.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5.5">
            {restTagLabels.map((tag) => (
              <span
                key={tag.key}
                className={cn(
                  'inline-flex items-center rounded-3xl px-2 py-0.5 text-[9px] leading-none',
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
