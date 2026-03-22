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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BoardFileContext } from '../../../board-contracts'
import type { UpstreamData } from '../../../engine/upstream-data'
import {
  assignUpstreamToSlots,
  buildReferencePools,
  isMediaReference,
  isTextReference,
} from '../slot-engine'
import type {
  InputSlotDefinition,
  MediaReference,
  MediaType,
  PoolReference,
  TextReference,
} from '../slot-types'
import { toMediaInput } from './index'
import { MediaSlotGroup } from './MediaSlotGroup'
import { TextReferencePool } from './TextReferencePool'
import { TextSlotField } from './TextSlotField'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResolvedSlotInputs = {
  /** slotId -> resolved values ready for API submission */
  inputs: Record<string, unknown>
  /** Whether all required slots are satisfied */
  isValid: boolean
}

export type InputSlotBarProps = {
  slots: InputSlotDefinition[]
  upstream: UpstreamData
  fileContext: BoardFileContext | undefined
  nodeResource?: { type: MediaType; url?: string; path?: string }
  disabled?: boolean
  /** Called whenever slot assignments change */
  onAssignmentChange?: (resolved: ResolvedSlotInputs) => void
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Debounce timeout in ms */
const DEBOUNCE_MS = 150

/** Resolve assigned references to API-ready inputs for a single slot */
function resolveSlotInput(
  slot: InputSlotDefinition,
  refs: PoolReference[],
  userTexts: Record<string, string>,
): unknown {
  if (slot.mediaType === 'text') {
    // Combine reference text + user typed text
    const refTexts = refs.filter(isTextReference).map((r) => r.content)
    const user = userTexts[slot.id] ?? ''
    const parts = [...refTexts, user].filter((s) => s.trim().length > 0)
    return parts.join('\n\n')
  }

  // Media slots: return toMediaInput for each assigned reference
  const mediaRefs = refs.filter(isMediaReference)
  if (mediaRefs.length === 0) return undefined
  if (slot.max === 1) {
    // Single-item slot: return scalar
    const ref = mediaRefs[0]
    return ref.path ? toMediaInput(ref.path) : toMediaInput(ref.url)
  }
  // Multi-item slot: return array
  return mediaRefs.map((ref) => (ref.path ? toMediaInput(ref.path) : toMediaInput(ref.url)))
}

// ---------------------------------------------------------------------------
// InputSlotBar
// ---------------------------------------------------------------------------

/**
 * Top-level orchestrator for declarative input slot rendering.
 *
 * Takes raw upstream data + slot definitions, handles auto-assignment,
 * user overrides, and outputs resolved inputs ready for API submission.
 */
export function InputSlotBar({
  slots,
  upstream,
  fileContext,
  nodeResource,
  disabled,
  onAssignmentChange,
}: InputSlotBarProps) {
  const { t } = useTranslation('board')

  // ---------------------------------------------------------------------------
  // Early return for empty / undefined slots
  // ---------------------------------------------------------------------------

  if (!slots || slots.length === 0) return null

  // ---------------------------------------------------------------------------
  // Build reference pools from upstream data
  // ---------------------------------------------------------------------------

  const nodeRef = useMemo(() => {
    if (!nodeResource?.path) return undefined
    return {
      nodeId: '__self__',
      nodeType: nodeResource.type,
      path: nodeResource.path,
    }
  }, [nodeResource?.path, nodeResource?.type])

  const pools = useMemo(
    () => buildReferencePools(upstream, fileContext, nodeRef),
    [upstream, fileContext, nodeRef],
  )

  // ---------------------------------------------------------------------------
  // Auto-assignment (initial + when upstream changes)
  // ---------------------------------------------------------------------------

  const autoAssignment = useMemo(
    () => assignUpstreamToSlots(slots, pools),
    [slots, pools],
  )

  // ---------------------------------------------------------------------------
  // Local state for user overrides
  // ---------------------------------------------------------------------------

  // Assigned refs per slot — initialized from auto-assignment
  const [slotAssignments, setSlotAssignments] = useState<
    Record<string, PoolReference[]>
  >(() => autoAssignment.assigned)

  // User-typed text per text slot
  const [userTexts, setUserTexts] = useState<Record<string, string>>({})

  // Sync auto-assignment when upstream changes
  const prevAutoRef = useRef(autoAssignment)
  useEffect(() => {
    if (prevAutoRef.current !== autoAssignment) {
      prevAutoRef.current = autoAssignment
      setSlotAssignments(autoAssignment.assigned)
    }
  }, [autoAssignment])

  // ---------------------------------------------------------------------------
  // Compute overflow per slot based on current assignments
  // ---------------------------------------------------------------------------

  const slotOverflow = useMemo(() => {
    const result: Record<string, MediaReference[]> = {}
    for (const slot of slots) {
      if (slot.mediaType === 'text') continue
      // Overflow = pool items of matching type NOT currently assigned to any slot
      const poolRefs = (pools[slot.mediaType] ?? []).filter(isMediaReference)
      const assignedIds = new Set<string>()
      for (const s of slots) {
        const assigned = slotAssignments[s.id] ?? []
        for (const ref of assigned) {
          if (isMediaReference(ref)) assignedIds.add(ref.nodeId)
        }
      }
      const overflow = poolRefs.filter((r) => !assignedIds.has(r.nodeId))
      if (overflow.length > 0) result[slot.id] = overflow
    }
    return result
  }, [slots, pools, slotAssignments])

  // ---------------------------------------------------------------------------
  // Unassigned text references (for TextReferencePool)
  // ---------------------------------------------------------------------------

  const { unassignedTextRefs, assignedTextNodeIds } = useMemo(() => {
    const assignedIds = new Set<string>()
    for (const slot of slots) {
      if (slot.mediaType !== 'text') continue
      const assigned = slotAssignments[slot.id] ?? []
      for (const ref of assigned) {
        if (isTextReference(ref)) assignedIds.add(ref.nodeId)
      }
    }
    const allTextRefs = pools.text.filter(isTextReference)
    const unassigned = allTextRefs.filter((r) => !assignedIds.has(r.nodeId))
    return { unassignedTextRefs: unassigned, assignedTextNodeIds: assignedIds }
  }, [slots, pools.text, slotAssignments])

  // ---------------------------------------------------------------------------
  // Callbacks
  // ---------------------------------------------------------------------------

  const handleMediaAssignmentChange = useCallback(
    (slotId: string, refs: MediaReference[]) => {
      setSlotAssignments((prev) => ({ ...prev, [slotId]: refs }))
    },
    [],
  )

  const handleTextUserChange = useCallback((slotId: string, text: string) => {
    setUserTexts((prev) => ({ ...prev, [slotId]: text }))
  }, [])

  const handleTextAddRef = useCallback(
    (slotId: string, ref: TextReference) => {
      setSlotAssignments((prev) => {
        const current = prev[slotId] ?? []
        // Don't add duplicates
        if (current.some((r) => isTextReference(r) && r.nodeId === ref.nodeId)) {
          return prev
        }
        return { ...prev, [slotId]: [...current, ref] }
      })
    },
    [],
  )

  const handleTextRemoveRef = useCallback(
    (slotId: string, nodeId: string) => {
      setSlotAssignments((prev) => {
        const current = prev[slotId] ?? []
        return {
          ...prev,
          [slotId]: current.filter(
            (r) => !(isTextReference(r) && r.nodeId === nodeId),
          ),
        }
      })
    },
    [],
  )

  const handleInsertUnassignedText = useCallback(
    (ref: TextReference) => {
      // Insert into the first text slot that is below max capacity
      const targetSlot = slots.find((s) => {
        if (s.mediaType !== 'text') return false
        const assigned = slotAssignments[s.id] ?? []
        return assigned.length < s.max
      })
      if (targetSlot) {
        handleTextAddRef(targetSlot.id, ref)
      }
    },
    [slots, slotAssignments, handleTextAddRef],
  )

  // ---------------------------------------------------------------------------
  // Resolve + emit (debounced)
  // ---------------------------------------------------------------------------

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!onAssignmentChange) return

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      const inputs: Record<string, unknown> = {}
      let isValid = true

      for (const slot of slots) {
        const refs = slotAssignments[slot.id] ?? []
        const resolved = resolveSlotInput(slot, refs, userTexts)
        inputs[slot.id] = resolved

        // Check required satisfaction
        if (slot.min > 0) {
          if (slot.mediaType === 'text') {
            const textVal = resolved as string
            if (!textVal || textVal.trim().length === 0) isValid = false
          } else {
            if (resolved === undefined) isValid = false
            if (Array.isArray(resolved) && resolved.length < slot.min) isValid = false
          }
        }
      }

      onAssignmentChange({ inputs, isValid })
    }, DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [slots, slotAssignments, userTexts, onAssignmentChange])

  // ---------------------------------------------------------------------------
  // Build VariantUpstream for MediaSlotGroup (board context passthrough)
  // ---------------------------------------------------------------------------

  const variantUpstream = useMemo(
    () => ({
      boardId: fileContext?.boardId,
      projectId: fileContext?.projectId,
      boardFolderUri: fileContext?.boardFolderUri,
    }),
    [fileContext?.boardId, fileContext?.projectId, fileContext?.boardFolderUri],
  )

  // All text references for @ dropdown
  const allTextRefs = useMemo(
    () => pools.text.filter(isTextReference),
    [pools.text],
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3">
      {/* Unassigned text references pool */}
      {unassignedTextRefs.length > 0 ? (
        <TextReferencePool
          references={unassignedTextRefs}
          onInsert={handleInsertUnassignedText}
        />
      ) : null}

      {/* Render each slot */}
      {slots.map((slot) => {
        if (slot.mediaType === 'text') {
          const textRefs = (slotAssignments[slot.id] ?? []).filter(isTextReference)
          return (
            <TextSlotField
              key={slot.id}
              label={t(`slot.${slot.labelKey}`, { defaultValue: slot.labelKey })}
              references={textRefs}
              userText={userTexts[slot.id] ?? ''}
              allReferences={allTextRefs}
              assignedNodeIds={assignedTextNodeIds}
              required={slot.min > 0}
              disabled={disabled}
              mode={slot.referenceMode ?? 'inline'}
              onUserTextChange={(text) => handleTextUserChange(slot.id, text)}
              onAddReference={(ref) => handleTextAddRef(slot.id, ref)}
              onRemoveReference={(nodeId) => handleTextRemoveRef(slot.id, nodeId)}
            />
          )
        }

        // Media slot
        const assignedMedia = (slotAssignments[slot.id] ?? []).filter(isMediaReference)
        const overflowMedia = slotOverflow[slot.id] ?? []

        return (
          <MediaSlotGroup
            key={slot.id}
            slot={slot}
            assigned={assignedMedia}
            overflow={overflowMedia}
            upstream={variantUpstream}
            disabled={disabled}
            onAssignmentChange={handleMediaAssignmentChange}
          />
        )
      })}
    </div>
  )
}
