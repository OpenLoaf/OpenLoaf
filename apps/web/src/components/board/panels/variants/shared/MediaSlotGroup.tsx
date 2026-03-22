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

import { useCallback, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { VariantUpstream } from '../types'
import type { InputSlotDefinition, MediaReference } from '../slot-types'
import { MediaSlot } from './MediaSlot'
import { OverflowHint } from './OverflowHint'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MediaSlotGroupProps = {
  slot: InputSlotDefinition
  assigned: MediaReference[]
  overflow: MediaReference[]
  nodeResourceUrl?: string
  nodeResourcePath?: string
  upstream: VariantUpstream
  disabled?: boolean
  onAssignmentChange?: (slotId: string, refs: MediaReference[]) => void
}

// ---------------------------------------------------------------------------
// MediaSlotGroup
// ---------------------------------------------------------------------------

/**
 * Wraps the existing MediaSlot component with overflow handling.
 *
 * - `overflowStrategy: 'rotate'` (single-item slots, max=1):
 *   navigation arrows + "1/N" counter to cycle through all available items.
 * - `overflowStrategy: 'truncate'` (multi-item slots):
 *   renders assigned items + OverflowHint for the rest.
 */
export function MediaSlotGroup({
  slot,
  assigned,
  overflow,
  upstream,
  disabled,
  onAssignmentChange,
}: MediaSlotGroupProps) {
  const { t } = useTranslation('board')
  const label = t(`slot.${slot.labelKey}`, { defaultValue: slot.labelKey })
  const isRequired = slot.min > 0
  const canAdd = slot.allowManualInput && assigned.length < slot.max

  // Accept filter based on media type
  const uploadAccept = slot.mediaType === 'video'
    ? 'video/*'
    : slot.mediaType === 'audio'
      ? 'audio/*'
      : 'image/*'

  // ---------------------------------------------------------------------------
  // Rotate strategy state (for single-item slots)
  // ---------------------------------------------------------------------------

  // All available items: assigned + overflow combined
  const allItems = [...assigned, ...overflow]
  const [rotateIndex, setRotateIndex] = useState(0)
  const safeIndex = allItems.length > 0 ? rotateIndex % allItems.length : 0

  const rotatePrev = useCallback(() => {
    setRotateIndex((prev) => (prev - 1 + allItems.length) % allItems.length)
    const nextIdx = (safeIndex - 1 + allItems.length) % allItems.length
    const nextItem = allItems[nextIdx]
    if (nextItem) {
      onAssignmentChange?.(slot.id, [nextItem])
    }
  }, [allItems, safeIndex, slot.id, onAssignmentChange])

  const rotateNext = useCallback(() => {
    setRotateIndex((prev) => (prev + 1) % allItems.length)
    const nextIdx = (safeIndex + 1) % allItems.length
    const nextItem = allItems[nextIdx]
    if (nextItem) {
      onAssignmentChange?.(slot.id, [nextItem])
    }
  }, [allItems, safeIndex, slot.id, onAssignmentChange])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleUpload = useCallback(
    (value: string, index: number) => {
      const newRef: MediaReference = {
        nodeId: `manual:${Date.now()}`,
        nodeType: slot.mediaType,
        url: value,
        path: value,
      }
      const next = [...assigned]
      if (index < next.length) {
        next[index] = newRef
      } else {
        next.push(newRef)
      }
      onAssignmentChange?.(slot.id, next)
    },
    [assigned, slot.id, slot.mediaType, onAssignmentChange],
  )

  const handleRemove = useCallback(
    (index: number) => {
      const next = assigned.filter((_, i) => i !== index)
      onAssignmentChange?.(slot.id, next)
    },
    [assigned, slot.id, onAssignmentChange],
  )

  const handleOverflowReplace = useCallback(
    (item: MediaReference, slotIdx: number) => {
      const next = [...assigned]
      if (next.length === 0) {
        next.push(item)
      } else {
        const idx = Math.min(slotIdx, next.length - 1)
        next[idx] = item
      }
      onAssignmentChange?.(slot.id, next)
    },
    [assigned, slot.id, onAssignmentChange],
  )

  // ---------------------------------------------------------------------------
  // Rotate mode (single-item slots with navigation)
  // ---------------------------------------------------------------------------

  if (slot.overflowStrategy === 'rotate' && allItems.length > 1) {
    const current = allItems[safeIndex]
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          {label}
          {isRequired ? <span className="ml-0.5 text-[10px] text-red-400">*</span> : null}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Prev arrow */}
          <button
            type="button"
            disabled={disabled}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors duration-150 hover:bg-muted/50 hover:text-muted-foreground disabled:opacity-40"
            onClick={rotatePrev}
          >
            <ChevronLeft size={14} />
          </button>

          {/* Current media slot */}
          <MediaSlot
            label=""
            src={current?.url}
            required={isRequired}
            uploadAccept={uploadAccept}
            disabled={disabled}
            onUpload={(v) => handleUpload(v, 0)}
            onRemove={() => handleRemove(0)}
            boardId={upstream.boardId}
            projectId={upstream.projectId}
            boardFolderUri={upstream.boardFolderUri}
            compact
          />

          {/* Next arrow */}
          <button
            type="button"
            disabled={disabled}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors duration-150 hover:bg-muted/50 hover:text-muted-foreground disabled:opacity-40"
            onClick={rotateNext}
          >
            <ChevronRight size={14} />
          </button>

          {/* Counter */}
          <span className="text-[10px] text-muted-foreground/50">
            {safeIndex + 1}/{allItems.length}
          </span>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Truncate mode (multi-item slots) and single-item without overflow
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
        {isRequired ? <span className="ml-0.5 text-[10px] text-red-400">*</span> : null}
      </span>

      <div className="flex flex-wrap items-start gap-2">
        {/* Assigned items */}
        {assigned.map((ref, idx) => (
          <MediaSlot
            key={ref.nodeId}
            label=""
            src={ref.url}
            uploadAccept={uploadAccept}
            disabled={disabled}
            onUpload={(v) => handleUpload(v, idx)}
            onRemove={() => handleRemove(idx)}
            boardId={upstream.boardId}
            projectId={upstream.projectId}
            boardFolderUri={upstream.boardFolderUri}
            compact
          />
        ))}

        {/* Add button when below max capacity */}
        {canAdd && !disabled ? (
          <MediaSlot
            label=""
            icon={<Plus size={14} />}
            uploadAccept={uploadAccept}
            onUpload={(v) => handleUpload(v, assigned.length)}
            boardId={upstream.boardId}
            projectId={upstream.projectId}
            boardFolderUri={upstream.boardFolderUri}
            compact
          />
        ) : null}
      </div>

      {/* Overflow hint for truncate strategy */}
      {overflow.length > 0 ? (
        <OverflowHint
          count={overflow.length}
          maxAllowed={slot.max}
          items={overflow}
          onReplace={handleOverflowReplace}
        />
      ) : null}
    </div>
  )
}
