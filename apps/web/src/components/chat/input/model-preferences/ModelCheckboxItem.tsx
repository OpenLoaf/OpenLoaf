'use client'

import { cn } from '@/lib/utils'
import { ModelIcon } from '@/components/setting/menus/provider/ModelIcon'
import { Checkbox } from '@tenas-ai/ui/checkbox'
import { MODEL_TAG_LABELS } from '@tenas-ai/api/common'
import type { ModelTag } from '@tenas-ai/api/common'

const MODEL_ICON_FALLBACK_SRC = '/head_s.png'

const TAG_COLOR_CLASSES: Record<string, string> = {
  vision: 'bg-sky-500/15 text-sky-700 dark:bg-sky-500/25 dark:text-sky-200',
  image:
    'bg-fuchsia-500/15 text-fuchsia-700 dark:bg-fuchsia-500/25 dark:text-fuchsia-200',
  audio:
    'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200',
  video:
    'bg-violet-500/15 text-violet-700 dark:bg-violet-500/25 dark:text-violet-200',
  code: 'bg-blue-500/15 text-blue-700 dark:bg-blue-500/25 dark:text-blue-200',
  reasoning:
    'bg-amber-500/20 text-amber-800 dark:bg-amber-500/25 dark:text-amber-100',
  speed:
    'bg-lime-500/15 text-lime-700 dark:bg-lime-500/25 dark:text-lime-200',
  quality:
    'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-200',
  default: 'bg-foreground/5 text-muted-foreground dark:bg-foreground/10',
}

interface ModelCheckboxItemProps {
  icon: string | undefined
  label: string
  tags?: ModelTag[]
  checked: boolean
  disabled?: boolean
  onToggle: () => void
}

export function ModelCheckboxItem({
  icon,
  label,
  tags,
  checked,
  disabled,
  onToggle,
}: ModelCheckboxItemProps) {
  const tagLabels =
    tags && tags.length > 0
      ? tags.map((tag) => ({
          key: tag,
          label: MODEL_TAG_LABELS[tag] ?? tag,
        }))
      : []

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
        disabled
          ? 'pointer-events-none'
          : 'hover:bg-sidebar-accent/60',
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
            size={14}
            className="h-3.5 w-3.5 shrink-0"
            fallbackSrc={MODEL_ICON_FALLBACK_SRC}
            fallbackAlt=""
          />
          <span className="truncate">{label}</span>
        </div>
        {tagLabels.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5.5">
            {tagLabels.map((tag) => (
              <span
                key={tag.key}
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[9px] leading-none',
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
        <Checkbox
          checked={checked}
          className="shrink-0"
          tabIndex={-1}
          aria-hidden
        />
      )}
    </div>
  )
}
