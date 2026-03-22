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
import { Image, Music, Type, Video } from 'lucide-react'

import type { TemplateGroup, TemplateItem } from '../engine/dynamic-templates'
import { toolbarSurfaceClassName } from '../ui/ToolbarParts'

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

/** Resolve the Lucide icon for a template item based on its node type. */
function resolveItemIcon(nodeType: string) {
  const size = 16
  switch (nodeType) {
    case 'image':
      return <Image size={size} />
    case 'video':
      return <Video size={size} />
    case 'audio':
      return <Music size={size} />
    default:
      return <Type size={size} />
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

    // Flatten all groups into a single item list.
    const items = groups.flatMap((g) => g.items)

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
        {/* Transparent backdrop to capture outside clicks */}
        <div
          className="pointer-events-auto fixed inset-0 -z-10"
          onPointerDown={(e) => {
            e.stopPropagation()
            onClose()
          }}
        />

        {/* Main panel — same style as FloatingInsertMenu */}
        <div
          data-connector-drop-panel
          className={cn(
            'pointer-events-auto w-[220px] rounded-3xl py-2',
            toolbarSurfaceClassName,
          )}
        >
          {items.length > 0 ? (
            items.map((item) => {
              const hasMissing = item.missingInputTypes.length > 0
              const missingHint = hasMissing
                ? item.missingInputTypes
                    .map((mt) => t(`dynamicTemplates.mediaType.${mt}` as Parameters<typeof t>[0]))
                    .join(', ')
                : null

              return (
                <button
                  key={item.variantId}
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
                      hasMissing && 'opacity-50 group-hover:opacity-100',
                    )}
                  >
                    {resolveItemIcon(item.nodeType)}
                  </span>
                  <div className="flex flex-col items-start gap-0.5 min-w-0">
                    <span className="text-[13px] font-medium leading-tight">
                      {t(item.labelKey as Parameters<typeof t>[0])}
                    </span>
                    {missingHint && (
                      <span className="text-[11px] leading-tight text-ol-text-auxiliary truncate max-w-[140px]">
                        *{missingHint}
                      </span>
                    )}
                  </div>
                </button>
              )
            })
          ) : (
            <div className="px-3.5 py-2 text-[11px] text-ol-text-auxiliary">
              {t('nodePicker.empty')}
            </div>
          )}
        </div>
      </div>
    )
  },
)

GroupedNodePicker.displayName = 'GroupedNodePicker'
