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

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MediaReference } from '../slot-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverflowHintProps = {
  count: number
  maxAllowed: number
  items: MediaReference[]
  onReplace?: (item: MediaReference, slotIdx: number) => void
}

// ---------------------------------------------------------------------------
// OverflowHint
// ---------------------------------------------------------------------------

/**
 * Shows "N items unused" with an expandable row of overflow thumbnails.
 * Clicking a thumbnail invokes onReplace to swap it into slot index 0.
 */
export function OverflowHint({ count, maxAllowed, items, onReplace }: OverflowHintProps) {
  const { t } = useTranslation('board')
  const [expanded, setExpanded] = useState(false)

  if (count <= 0) return null

  return (
    <div className="flex flex-col gap-1">
      {/* Summary row */}
      <button
        type="button"
        className="flex items-center gap-1 text-[10px] text-amber-500/80 transition-colors duration-150 hover:text-amber-500"
        onClick={() => setExpanded((v) => !v)}
      >
        <span>
          {t('slot.overflow', { count })}
        </span>
        <span className="text-muted-foreground/50">
          ({t('slot.overflowReason', { max: maxAllowed })})
        </span>
        {items.length > 0 ? (
          expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />
        ) : null}
      </button>

      {/* Expanded thumbnail row */}
      {expanded && items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <button
              key={item.nodeId}
              type="button"
              className="group/thumb relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border bg-ol-surface-muted transition-colors duration-150 hover:border-amber-500/50"
              title={t('slot.clickToReplace')}
              onClick={() => onReplace?.(item, 0)}
            >
              <img
                src={item.url}
                alt={item.nodeId}
                className="h-full w-full object-cover"
                draggable={false}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
