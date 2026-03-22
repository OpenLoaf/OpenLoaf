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
import { ImagePlus, Music, Type, Video } from 'lucide-react'

import type { MediaType } from '../panels/variants/slot-types'
import type { TemplateGroup, TemplateItem } from '../engine/dynamic-templates'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GroupedNodePickerProps {
  position: [number, number]
  /** Horizontal alignment relative to the drop point. */
  align?: 'left' | 'right' | 'center'
  /** Template groups from computeOutputTemplates or computeInputTemplates. */
  groups: TemplateGroup[]
  onSelect: (item: TemplateItem) => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the CSS translate class for the picker alignment.
 *
 * - `left`:   panel sits to the right of the drop point (line enters from left)
 * - `right`:  panel sits to the left (line enters from right)
 * - `center`: centered on the drop point
 */
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

/** Lucide icon element for a given media type group. */
function GroupIcon({ mediaType }: { mediaType: MediaType }) {
  switch (mediaType) {
    case 'text':
      return <Type size={12} />
    case 'image':
      return <ImagePlus size={12} />
    case 'video':
      return <Video size={12} />
    case 'audio':
      return <Music size={12} />
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// GroupedNodePicker
// ---------------------------------------------------------------------------

export const GroupedNodePicker = forwardRef<HTMLDivElement, GroupedNodePickerProps>(
  function GroupedNodePicker(
    { position, align = 'center', groups, onSelect, onClose },
    ref,
  ) {
    const { t } = useTranslation('board')

    const hasGroups = groups.length > 0

    return (
      /* Outer positioning wrapper — pointer-events-none so canvas interactions
         pass through the transparent area around the panel. */
      <div
        ref={ref}
        data-node-picker
        className={cn(
          'pointer-events-none absolute z-30 -translate-y-1/2',
          resolveAlignClass(align),
        )}
        style={{ left: position[0], top: position[1] }}
      >
        {/* Transparent backdrop to capture outside clicks */}
        <div
          className="pointer-events-auto fixed inset-0 -z-10"
          onPointerDown={(e) => {
            e.stopPropagation()
            onClose()
          }}
        />

        {/* Main panel */}
        <div
          data-connector-drop-panel
          className={cn(
            'pointer-events-auto rounded-3xl border border-border bg-card shadow-lg',
            'max-w-[320px] min-w-[200px]',
            'max-h-[480px] overflow-y-auto',
            'p-2',
          )}
        >
          {hasGroups ? (
            <div className="flex flex-col gap-3">
              {groups.map((group) => (
                <GroupSection
                  key={group.id}
                  group={group}
                  onSelect={onSelect}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <div className="px-3 py-2 text-[11px] text-ol-text-auxiliary">
              {t('nodePicker.empty')}
            </div>
          )}
        </div>
      </div>
    )
  },
)

GroupedNodePicker.displayName = 'GroupedNodePicker'

// ---------------------------------------------------------------------------
// GroupSection sub-component
// ---------------------------------------------------------------------------

interface GroupSectionProps {
  group: TemplateGroup
  onSelect: (item: TemplateItem) => void
  t: ReturnType<typeof useTranslation<'board'>>['t']
}

function GroupSection({ group, onSelect, t }: GroupSectionProps) {
  return (
    <div className="flex flex-col gap-1">
      {/* Group header label */}
      <div className="flex items-center gap-1 px-2 pt-0.5">
        <span className="text-ol-text-auxiliary/60">
          <GroupIcon mediaType={group.id} />
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-ol-text-auxiliary/60">
          {t(group.labelKey as Parameters<typeof t>[0])}
        </span>
      </div>

      {/* Items grid */}
      <div className="flex flex-wrap gap-0.5">
        {group.items.map((item) => (
          <TemplateItemButton key={item.variantId} item={item} onSelect={onSelect} t={t} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TemplateItemButton sub-component
// ---------------------------------------------------------------------------

interface TemplateItemButtonProps {
  item: TemplateItem
  onSelect: (item: TemplateItem) => void
  t: ReturnType<typeof useTranslation<'board'>>['t']
}

function TemplateItemButton({ item, onSelect, t }: TemplateItemButtonProps) {
  const hasMissingInputs = item.missingInputTypes.length > 0

  /** Localised label for the missing input hint. */
  const missingHint = hasMissingInputs
    ? item.missingInputTypes
        .map((mt) => t(`dynamicTemplates.mediaType.${mt}` as Parameters<typeof t>[0]))
        .join(', ')
    : null

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.stopPropagation()
        onSelect(item)
      }}
      className={cn(
        'group flex flex-col items-center gap-1 rounded-3xl px-3 py-2',
        'transition-colors duration-100',
        hasMissingInputs
          ? 'text-ol-text-auxiliary/60 hover:text-ol-text-primary'
          : 'text-ol-text-auxiliary hover:text-ol-text-primary',
        'hover:bg-foreground/8',
        'dark:hover:bg-foreground/10',
      )}
    >
      {/* Icon badge */}
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-3xl transition-colors',
          hasMissingInputs
            ? 'bg-ol-surface-muted text-ol-text-auxiliary/50 group-hover:bg-ol-blue-bg group-hover:text-ol-blue'
            : 'bg-ol-surface-muted text-ol-text-auxiliary group-hover:bg-ol-blue-bg group-hover:text-ol-blue',
        )}
      >
        <Type size={16} />
      </span>

      {/* Label */}
      <span className="whitespace-nowrap text-[11px] font-medium leading-tight">
        {t(item.labelKey as Parameters<typeof t>[0])}
      </span>

      {/* Missing input hint */}
      {missingHint && (
        <span className="whitespace-nowrap text-[9px] leading-tight text-ol-text-auxiliary/50">
          *{missingHint}
        </span>
      )}
    </button>
  )
}
