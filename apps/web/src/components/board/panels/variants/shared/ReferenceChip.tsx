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

import { cn } from '@udecode/cn'
import { Link2, X } from 'lucide-react'
import type { TextReference } from '../slot-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReferenceChipProps = {
  reference: TextReference
  mode: 'inline' | 'pool'
  removable?: boolean
  draggable?: boolean
  onRemove?: () => void
  onClick?: () => void
  className?: string
}

// ---------------------------------------------------------------------------
// ReferenceChip
// ---------------------------------------------------------------------------

/**
 * A chip representing an upstream text reference.
 *
 * - **inline** mode: compact, shown inside text input areas
 * - **pool** mode: full card, shown in the unassigned reference pool
 */
export function ReferenceChip({
  reference,
  mode,
  removable,
  draggable,
  onRemove,
  onClick,
  className,
}: ReferenceChipProps) {
  const { nodeId, label, content, charCount } = reference

  const previewContent =
    content.length > 16 ? `${content.slice(0, 16)}…` : content

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ type: 'text-reference', nodeId }),
    )
    e.dataTransfer.effectAllowed = 'copy'
  }

  if (mode === 'inline') {
    return (
      <span
        title={content}
        className={cn(
          'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5',
          'bg-ol-blue-bg text-ol-blue text-[11px] leading-none select-none',
          onClick ? 'cursor-pointer' : '',
          className,
        )}
        onPointerDown={(e) => {
          e.stopPropagation()
          onClick?.()
        }}
      >
        <Link2 size={10} className="shrink-0" />
        <span className="max-w-[80px] truncate font-medium">{label}</span>
        <span className="text-ol-blue/60">({charCount})</span>
        {removable && onRemove ? (
          <span
            role="button"
            tabIndex={0}
            className="ml-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-full hover:bg-ol-blue/20"
            onPointerDown={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                onRemove()
              }
            }}
          >
            <X size={8} />
          </span>
        ) : null}
      </span>
    )
  }

  // pool mode
  return (
    <div
      draggable={draggable}
      title={content}
      onDragStart={draggable ? handleDragStart : undefined}
      className={cn(
        'inline-flex cursor-grab items-center gap-1 rounded-full px-2 py-1',
        'bg-ol-blue-bg text-ol-blue text-[11px] leading-none select-none',
        'active:cursor-grabbing transition-opacity duration-150 hover:opacity-80',
        onClick ? 'cursor-pointer' : '',
        className,
      )}
      onPointerDown={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
    >
      <Link2 size={10} className="shrink-0" />
      <span className="font-medium">{label}</span>
      {previewContent ? (
        <span className="max-w-[80px] truncate text-ol-blue/60">{previewContent}</span>
      ) : null}
      <span className="shrink-0 text-ol-blue/50">({charCount})</span>
    </div>
  )
}
