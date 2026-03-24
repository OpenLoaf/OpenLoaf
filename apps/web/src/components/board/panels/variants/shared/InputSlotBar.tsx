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
import { Paintbrush, Plus, Redo2, Undo2, Upload } from 'lucide-react'
import { cn } from '@udecode/cn'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@openloaf/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'
import type { BoardFileContext } from '../../../board-contracts'
import type { UpstreamData } from '../../../engine/upstream-data'
import {
  buildReferencePools,
  isMediaReference,
  isTextReference,
  restoreOrAssign,
} from '../slot-engine'
import type {
  InputSlotDefinition,
  MediaReference,
  MediaType,
  PersistedSlotMap,
  PoolReference,
  TextReference,
} from '../slot-types'
import { toMediaInput } from './index'
import { MediaSlot } from './MediaSlot'
import { TextReferencePool } from './TextReferencePool'
import { TextSlotField } from './TextSlotField'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResolvedSlotInputs = {
  /** slotId -> resolved values ready for API submission */
  inputs: Record<string, unknown>
  /** slotId -> raw MediaReference list (for framework-level slot persistence) */
  mediaRefs: Record<string, MediaReference[]>
  /** Whether all required slots are satisfied */
  isValid: boolean
}

/** Handle exposed by MaskPaintOverlay for brush control. */
export type MaskPaintHandle = {
  brushSize: number
  setBrushSize: (size: number) => void
  undo: () => void
  redo: () => void
  clear: () => void
  canUndo: boolean
  canRedo: boolean
}

/** Result produced by MaskPaintOverlay. */
export type MaskPaintResult = {
  maskDataUrl: string
  maskBlob: Blob
  hasStroke: boolean
}

export type InputSlotBarProps = {
  slots: InputSlotDefinition[]
  upstream: UpstreamData
  fileContext: BoardFileContext | undefined
  nodeResource?: { type: MediaType; url?: string; path?: string }
  disabled?: boolean
  /** Called whenever slot assignments change */
  onAssignmentChange?: (resolved: ResolvedSlotInputs) => void
  /** Cached slot assignment from paramsCache (persisted across sessions) */
  cachedAssignment?: PersistedSlotMap
  /** Called when slot assignment changes so parent can persist it */
  onSlotAssignmentChange?: (map: PersistedSlotMap) => void
  /** Ref to MaskPaintOverlay handle for brush control (paintable slots) */
  maskPaintRef?: React.RefObject<MaskPaintHandle | null>
  /** Whether mask painting is currently active */
  maskPainting?: boolean
  /** Current mask result (thumbnail + data) */
  maskResult?: MaskPaintResult | null
  /** Current brush size (synced from MaskPaintOverlay) */
  brushSize?: number
  /** Toggle mask painting on/off */
  onMaskPaintToggle?: (active: boolean) => void
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

/** Get the upload accept filter for a media type */
function uploadAcceptForType(mediaType: MediaType): string {
  switch (mediaType) {
    case 'video':
      return 'video/*'
    case 'audio':
      return 'audio/*'
    default:
      return 'image/*'
  }
}

// ---------------------------------------------------------------------------
// InputSlotBar
// ---------------------------------------------------------------------------

/**
 * Top-level orchestrator for declarative input slot rendering.
 *
 * Takes raw upstream data + slot definitions, handles auto-assignment,
 * user overrides, and outputs resolved inputs ready for API submission.
 *
 * Renders in a dual-zone layout:
 * - Text slots at the top (via TextSlotField)
 * - Active media slots zone (variant-declared slots with semantic labels)
 * - Associated refs zone (unassigned upstream media nodes)
 * - Click-to-swap interaction between active slots and associated refs
 */
export function InputSlotBar({
  slots,
  upstream,
  fileContext,
  nodeResource,
  disabled,
  onAssignmentChange,
  cachedAssignment,
  onSlotAssignmentChange,
  maskPaintRef,
  maskPainting,
  maskResult,
  brushSize: brushSizeProp,
  onMaskPaintToggle,
}: InputSlotBarProps) {
  const { t } = useTranslation('board')

  // ---------------------------------------------------------------------------
  // Early return for empty / undefined slots
  // ---------------------------------------------------------------------------

  if (!slots || slots.length === 0) return null

  // ---------------------------------------------------------------------------
  // Build reference pools from upstream data
  // ---------------------------------------------------------------------------

  // When paintable slots exist (e.g. mask), the node's own image is the editing
  // canvas — it should NOT be added to the reference pool as a candidate.
  const hasPaintableSlot = useMemo(() => slots.some((s) => s.isPaintable), [slots])

  const nodeRef = useMemo(() => {
    if (hasPaintableSlot) return undefined // node image = editing canvas, not a reference
    if (!nodeResource?.path) return undefined
    return {
      nodeId: '__self__',
      nodeType: nodeResource.type,
      path: nodeResource.path,
    }
  }, [nodeResource?.path, nodeResource?.type, hasPaintableSlot])

  const pools = useMemo(
    () => buildReferencePools(upstream, fileContext, nodeRef),
    [upstream, fileContext, nodeRef],
  )

  // ---------------------------------------------------------------------------
  // Unified assignment (restoreOrAssign replaces assignUpstreamToSlots)
  // cachedAssignment is ONLY used for initial restore (not on every change)
  // to avoid feedback loop: assign → persist → cache prop changes → re-assign
  // ---------------------------------------------------------------------------

  const initialCacheRef = useRef(cachedAssignment)

  // Accepted media types from slot declarations (e.g., only 'image' for image variants)
  const acceptedMediaTypes = useMemo(() => {
    const types = new Set<string>()
    for (const slot of slots) {
      if (slot.mediaType !== 'text') types.add(slot.mediaType)
    }
    return types
  }, [slots])

  // Exclude paintable slots (e.g. mask) from pool assignment — they get data
  // from painting, not from upstream nodes, so they should not consume image refs.
  const assignableSlots = useMemo(
    () => slots.filter((s) => !s.isPaintable),
    [slots],
  )

  const unifiedResult = useMemo(() => {
    const raw = restoreOrAssign(assignableSlots, pools, initialCacheRef.current)
    // Filter associated refs to only include types the variant accepts
    // (e.g., image variant shouldn't show video refs in associated area)
    const filtered = raw.associated.filter((r) => acceptedMediaTypes.has(r.nodeType))
    return { ...raw, associated: filtered }
  }, [assignableSlots, pools, acceptedMediaTypes])

  // ---------------------------------------------------------------------------
  // Local state for user overrides
  // ---------------------------------------------------------------------------

  // Assigned refs per slot — initialized from unified result
  const [slotAssignments, setSlotAssignments] = useState<
    Record<string, PoolReference[]>
  >(() => unifiedResult.assigned)

  // User-typed text per text slot
  const [userTexts, setUserTexts] = useState<Record<string, string>>({})

  // Track associated refs locally so we can update on swap
  const [associatedRefs, setAssociatedRefs] = useState<MediaReference[]>(
    () => unifiedResult.associated,
  )

  // Sync when upstream / pools change (e.g. new connection added/removed)
  // Update initialCacheRef when slots change (variant switch with new cache)
  const prevPoolsRef = useRef(pools)
  const prevSlotsRef = useRef(slots)
  useEffect(() => {
    const poolsChanged = prevPoolsRef.current !== pools
    const slotsChanged = prevSlotsRef.current !== slots
    if (poolsChanged || slotsChanged) {
      prevPoolsRef.current = pools
      prevSlotsRef.current = slots
      // On variant switch, load the new cache; on upstream change, keep current
      if (slotsChanged) {
        initialCacheRef.current = cachedAssignment
      }
      const fresh = restoreOrAssign(assignableSlots, pools, initialCacheRef.current)
      setSlotAssignments(fresh.assigned)
      setAssociatedRefs(fresh.associated.filter((r) => acceptedMediaTypes.has(r.nodeType)))
    }
  }, [slots, pools, cachedAssignment, acceptedMediaTypes])

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
  // Persistence callback
  // ---------------------------------------------------------------------------

  // Emit slot assignment when assignments change (inline to avoid callback dep chain)
  const onSlotAssignmentChangeRef = useRef(onSlotAssignmentChange)
  onSlotAssignmentChangeRef.current = onSlotAssignmentChange
  const prevAssignmentsRef = useRef(slotAssignments)
  useEffect(() => {
    if (prevAssignmentsRef.current === slotAssignments) return
    prevAssignmentsRef.current = slotAssignments
    if (!onSlotAssignmentChangeRef.current) return
    const map: PersistedSlotMap = {}
    for (const slot of slots) {
      if (slot.mediaType === 'text') continue
      const refs = slotAssignments[slot.id] ?? []
      const mediaRefs = refs.filter(isMediaReference) as MediaReference[]
      if (mediaRefs.length === 0) continue

      if (slot.max > 1) {
        // Multi-item slot: persist as array
        map[slot.id] = mediaRefs.map((r) =>
          r.nodeId.startsWith('__manual_') ? `manual:${r.path}` : r.nodeId,
        )
      } else {
        // Single-item slot: persist as string (backward compat)
        const mediaRef = mediaRefs[0]
        map[slot.id] = mediaRef.nodeId.startsWith('__manual_')
          ? `manual:${mediaRef.path}`
          : mediaRef.nodeId
      }
    }
    onSlotAssignmentChangeRef.current(map)
  }, [slots, slotAssignments])

  // ---------------------------------------------------------------------------
  // Callbacks — text slots
  // ---------------------------------------------------------------------------

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
  // Callbacks — media slot upload
  // ---------------------------------------------------------------------------

  /** Lookup slot max by slotId */
  const slotMaxMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of slots) map[s.id] = s.max
    return map
  }, [slots])

  const handleMediaUpload = useCallback(
    (slotId: string, mediaType: MediaType, value: string) => {
      const max = slotMaxMap[slotId] ?? 1
      setSlotAssignments((prev) => {
        const current = prev[slotId] ?? []
        const currentMedia = current.filter(isMediaReference)

        // Generate unique nodeId for manual uploads
        const manualIdx = currentMedia.filter((r) => r.nodeId.startsWith('__manual_')).length
        const newRef: MediaReference = {
          nodeId: `__manual_${slotId}_${manualIdx}__`,
          nodeType: mediaType,
          url: value,
          path: value,
        }

        if (max > 1 && currentMedia.length < max) {
          // Multi-item slot with room: append
          return { ...prev, [slotId]: [...current, newRef] }
        }

        // Single-item or full: replace (move displaced upstream refs to associated)
        const displaced = currentMedia
          .filter((r) => !r.nodeId.startsWith('__manual_'))
        if (displaced.length > 0) {
          setAssociatedRefs((prevAssoc) => {
            const existing = new Set(prevAssoc.map((r) => r.nodeId))
            const toAdd = displaced.filter((r) => !existing.has(r.nodeId))
            return toAdd.length > 0 ? [...prevAssoc, ...toAdd] : prevAssoc
          })
        }
        return { ...prev, [slotId]: [newRef] }
      })
    },
    [slotMaxMap],
  )

  /** Remove a specific ref from a slot (by nodeId), or clear the entire slot. */
  const handleMediaRemove = useCallback((slotId: string, removeNodeId?: string) => {
    setSlotAssignments((prev) => {
      const current = prev[slotId] ?? []

      if (removeNodeId) {
        // Remove a specific ref (multi-item mode)
        const removed = current.find(
          (r) => isMediaReference(r) && r.nodeId === removeNodeId,
        ) as MediaReference | undefined
        if (removed && !removed.nodeId.startsWith('__manual_')) {
          setAssociatedRefs((prevAssoc) => {
            if (prevAssoc.some((r) => r.nodeId === removed.nodeId)) return prevAssoc
            return [...prevAssoc, removed]
          })
        }
        return { ...prev, [slotId]: current.filter((r) => !isMediaReference(r) || r.nodeId !== removeNodeId) }
      }

      // Remove all (legacy single-item mode)
      const removedRefs = current.filter(isMediaReference)
      const upstreamRefs = removedRefs.filter(
        (r) => !r.nodeId.startsWith('__manual_'),
      )
      if (upstreamRefs.length > 0) {
        setAssociatedRefs((prevAssoc) => {
          const existing = new Set(prevAssoc.map((r) => r.nodeId))
          const toAdd = upstreamRefs.filter((r) => !existing.has(r.nodeId))
          return toAdd.length > 0 ? [...prevAssoc, ...toAdd] : prevAssoc
        })
      }
      return { ...prev, [slotId]: [] }
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Click-to-swap: associated ref -> active slot
  // ---------------------------------------------------------------------------

  const handleAssociatedToSlot = useCallback(
    (assocRef: MediaReference, targetSlotId: string) => {
      setSlotAssignments((prev) => {
        const targetSlot = slots.find((s) => s.id === targetSlotId)
        if (!targetSlot) return prev

        const currentRefs = prev[targetSlotId] ?? []
        const currentMedia = currentRefs.filter(isMediaReference)

        if (targetSlot.max > 1 && currentMedia.length < targetSlot.max) {
          // Multi-item slot with room: append
          setAssociatedRefs((prevAssoc) =>
            prevAssoc.filter((r) => r.nodeId !== assocRef.nodeId),
          )
          return { ...prev, [targetSlotId]: [...currentRefs, assocRef] }
        }

        // Single-item or full: replace oldest, move it to associated
        const evictedRef = currentMedia[0]

        const next = {
          ...prev,
          [targetSlotId]: [assocRef],
        }

        // Update associated refs: remove the incoming ref, add evicted ref
        setAssociatedRefs((prevAssoc) => {
          let updated = prevAssoc.filter((r) => r.nodeId !== assocRef.nodeId)
          if (evictedRef && !updated.some((r) => r.nodeId === evictedRef.nodeId)) {
            updated = [...updated, evictedRef]
          }
          return updated
        })

        return next
      })
    },
    [slots],
  )

  // ---------------------------------------------------------------------------
  // Click-to-swap: active slot -> swap with associated ref
  // ---------------------------------------------------------------------------

  const handleSlotSwapWithAssociated = useCallback(
    (slotId: string, assocRef: MediaReference) => {
      setSlotAssignments((prev) => {
        const currentRefs = prev[slotId] ?? []
        const currentMedia = currentRefs.filter(isMediaReference)
        const evictedRef = currentMedia[0]

        const next = {
          ...prev,
          [slotId]: [assocRef],
        }

        setAssociatedRefs((prevAssoc) => {
          let updated = prevAssoc.filter((r) => r.nodeId !== assocRef.nodeId)
          if (evictedRef && !updated.some((r) => r.nodeId === evictedRef.nodeId)) {
            updated = [...updated, evictedRef]
          }
          return updated
        })

        return next
      })
    },
    [],
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

      // Build mediaRefs: slotId -> assigned MediaReference[]
      const mediaRefs: Record<string, MediaReference[]> = {}
      for (const slot of slots) {
        if (slot.mediaType === 'text') continue
        mediaRefs[slot.id] = (slotAssignments[slot.id] ?? []).filter(isMediaReference)
      }

      onAssignmentChange({ inputs, mediaRefs, isValid })
    }, DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [slots, slotAssignments, userTexts, onAssignmentChange])

  // ---------------------------------------------------------------------------
  // Build VariantUpstream for MediaSlot (board context passthrough)
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
  // Split slots into text and media
  // ---------------------------------------------------------------------------

  const textSlots = useMemo(
    () => slots.filter((s) => s.mediaType === 'text'),
    [slots],
  )
  const mediaSlots = useMemo(
    () => slots.filter((s) => s.mediaType !== 'text' && !s.isPaintable),
    [slots],
  )
  const paintableSlots = useMemo(
    () => slots.filter((s) => s.isPaintable),
    [slots],
  )
  /** All non-text slots in declaration order (paintable + regular) for inline rendering */
  const allMediaSlots = useMemo(
    () => slots.filter((s) => s.mediaType !== 'text'),
    [slots],
  )

  // ---------------------------------------------------------------------------
  // Determine if associated refs have matching-type refs for a given slot
  // ---------------------------------------------------------------------------

  const matchingAssociatedForSlot = useCallback(
    (slot: InputSlotDefinition) =>
      associatedRefs.filter((r) => r.nodeType === slot.mediaType),
    [associatedRefs],
  )

  // ---------------------------------------------------------------------------
  // Layout: determine single-row vs two-row
  // ---------------------------------------------------------------------------

  // Count total chips: each assigned ref + add button + associated refs
  const totalAssigned = mediaSlots.reduce((sum, s) => {
    const refs = (slotAssignments[s.id] ?? []).filter(isMediaReference)
    const canAdd = refs.length < s.max ? 1 : 0
    return sum + refs.length + canAdd
  }, 0)
  const totalCount = totalAssigned + associatedRefs.length
  const isSingleRow = totalCount <= 7

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3">
      {/* Text slots are NOT rendered here — each variant handles its own
          text input UX (prompt, negative prompt, description, etc.).
          InputSlotBar only manages media slot assignment and display. */}

      {/* Dual-zone media layout */}
      {allMediaSlots.length > 0 ? (() => {
        const hasAssociated = associatedRefs.length > 0
        const hasPaintableSlot = paintableSlots.length > 0
        const isPaintActive = maskPainting ?? false

        /** Renders all active slot chips (supports multi-item + paintable slots) */
        const activeSlotChips = allMediaSlots.flatMap((slot): React.ReactNode[] => {
          // ── Paintable slot: render inline paint chip ──
          if (slot.isPaintable) {
            // Only show mask when the node itself has an image resource
            if (!nodeResource?.url) return []

            const slotLabel = t(slot.labelKey, { defaultValue: slot.id })
            const hasMask = maskResult?.hasStroke ?? false
            return [(
              <div key={`paint:${slot.id}`} className="flex flex-col items-center gap-1">
                <div className="relative h-[44px] w-[44px] shrink-0">
                  <button
                    type="button"
                    disabled={disabled}
                    className={cn(
                      'flex h-full w-full items-center justify-center rounded-xl border transition-colors duration-150',
                      isPaintActive
                        ? 'border-foreground/30 bg-foreground/10 text-foreground'
                        : hasMask
                          ? 'border-border bg-background text-foreground hover:border-foreground/20'
                          : 'border-dashed border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                      disabled && 'cursor-not-allowed opacity-60',
                    )}
                    onClick={() => onMaskPaintToggle?.(!isPaintActive)}
                  >
                    {hasMask && maskResult?.maskDataUrl ? (
                      <img
                        src={maskResult.maskDataUrl}
                        alt="mask"
                        className="h-full w-full rounded-xl object-contain p-0.5 opacity-60"
                      />
                    ) : (
                      <Paintbrush size={14} />
                    )}
                  </button>
                </div>
                <span className="text-center text-[9px] leading-tight text-muted-foreground/60">
                  {slotLabel}
                  {slot.min > 0 ? <span className="text-amber-500"> *</span> : null}
                </span>
              </div>
            )]
          }

          // ── Regular media slot ──
          const assignedMedia = (slotAssignments[slot.id] ?? []).filter(
            isMediaReference,
          )
          const matchingAssociated = matchingAssociatedForSlot(slot)
          const slotLabel = t(slot.labelKey, { defaultValue: slot.labelKey })
          const uploadAccept = uploadAcceptForType(slot.mediaType)
          const isMulti = slot.max > 1
          const canAddMore = assignedMedia.length < slot.max

          const chips: React.ReactNode[] = []

          // Render each assigned ref as a chip
          for (let i = 0; i < assignedMedia.length; i++) {
            const ref = assignedMedia[i]
            const isFirst = i === 0
            const chipKey = `${slot.id}:${ref.nodeId}`

            if (matchingAssociated.length > 0) {
              chips.push(
                <FilledSlotWithPopover
                  key={chipKey}
                  slotId={slot.id}
                  label={isFirst ? slotLabel : ''}
                  currentRef={ref}
                  required={isFirst && slot.min > 0}
                  disabled={disabled}
                  uploadAccept={uploadAccept}
                  mediaType={slot.mediaType}
                  candidates={matchingAssociated}
                  variantUpstream={variantUpstream}
                  onSwap={(newRef) =>
                    isMulti
                      ? handleAssociatedToSlot(newRef, slot.id)
                      : handleSlotSwapWithAssociated(slot.id, newRef)
                  }
                  onUpload={(v) =>
                    handleMediaUpload(slot.id, slot.mediaType, v)
                  }
                  onRemove={() =>
                    isMulti
                      ? handleMediaRemove(slot.id, ref.nodeId)
                      : handleMediaRemove(slot.id)
                  }
                  t={t}
                />,
              )
            } else {
              chips.push(
                <MediaSlot
                  key={chipKey}
                  label={isFirst ? slotLabel : ''}
                  src={ref.url}
                  required={isFirst && slot.min > 0}
                  uploadAccept={uploadAccept}
                  disabled={disabled}
                  onUpload={(v) =>
                    handleMediaUpload(slot.id, slot.mediaType, v)
                  }
                  onRemove={() =>
                    isMulti
                      ? handleMediaRemove(slot.id, ref.nodeId)
                      : handleMediaRemove(slot.id)
                  }
                  boardId={variantUpstream.boardId}
                  projectId={variantUpstream.projectId}
                  boardFolderUri={variantUpstream.boardFolderUri}
                  compact
                />,
              )
            }
          }

          // "Add more" button when under max
          if (canAddMore && !disabled) {
            const isEmpty = assignedMedia.length === 0
            const shouldPulse = isEmpty && matchingAssociated.length > 0

            if (matchingAssociated.length > 0) {
              chips.push(
                <ActiveSlotWithPopover
                  key={`${slot.id}:add`}
                  slotId={slot.id}
                  label={isEmpty ? slotLabel : ''}
                  required={isEmpty && slot.min > 0}
                  disabled={disabled}
                  pulse={shouldPulse}
                  uploadAccept={uploadAccept}
                  mediaType={slot.mediaType}
                  candidates={matchingAssociated}
                  variantUpstream={variantUpstream}
                  onSelect={(ref) =>
                    handleAssociatedToSlot(ref, slot.id)
                  }
                  onUpload={(v) =>
                    handleMediaUpload(slot.id, slot.mediaType, v)
                  }
                  t={t}
                />,
              )
            } else {
              chips.push(
                <MediaSlot
                  key={`${slot.id}:add`}
                  label={isEmpty ? slotLabel : ''}
                  icon={<Plus size={14} />}
                  required={isEmpty && slot.min > 0}
                  uploadAccept={uploadAccept}
                  disabled={disabled}
                  onUpload={(v) =>
                    handleMediaUpload(slot.id, slot.mediaType, v)
                  }
                  boardId={variantUpstream.boardId}
                  projectId={variantUpstream.projectId}
                  boardFolderUri={variantUpstream.boardFolderUri}
                  compact
                />,
              )
            }
          }

          return chips
        })

        /** Renders all associated ref chips */
        const associatedRefChips = associatedRefs.map((ref) => (
          <AssociatedRefSlot
            key={`assoc:${ref.nodeId}`}
            ref_={ref}
            mediaSlots={mediaSlots}
            slotAssignments={slotAssignments}
            variantUpstream={variantUpstream}
            disabled={disabled}
            onAssignToSlot={handleAssociatedToSlot}
            t={t}
          />
        ))

        if (isSingleRow) {
          return (
            <div className="flex flex-wrap items-start gap-2">
              {activeSlotChips}
              {hasAssociated && (
                <div className="mt-2 h-8 w-px self-start bg-border" />
              )}
              {associatedRefChips}
            </div>
          )
        }

        return (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-start gap-2">
              {activeSlotChips}
            </div>
            {hasAssociated && (
              <div className="flex flex-wrap items-start gap-2 opacity-70">
                {associatedRefChips}
              </div>
            )}
          </div>
        )
      })() : null}

      {/* ── Brush controls for paintable slots (below chip row) ── */}
      {paintableSlots.length > 0 && (maskPainting ?? false) && maskPaintRef?.current ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 transition-colors"
            title={t('slot.clearMask', { defaultValue: '清除遮罩' })}
            onClick={() => maskPaintRef.current?.clear()}
          >
            <Paintbrush size={13} />
          </button>
          <input
            type="range"
            min={8}
            max={120}
            value={brushSizeProp ?? 40}
            onChange={(e) => maskPaintRef.current?.setBrushSize(Number(e.target.value))}
            className="h-1 min-w-0 flex-1 cursor-pointer accent-foreground"
          />
          <span className="mx-0.5 h-4 w-px bg-border" />
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 transition-colors disabled:opacity-30"
            onClick={() => maskPaintRef.current?.undo()}
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 transition-colors disabled:opacity-30"
            onClick={() => maskPaintRef.current?.redo()}
          >
            <Redo2 size={13} />
          </button>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components: Active slot popover (empty slot with matching associated)
// ---------------------------------------------------------------------------

type ActiveSlotWithPopoverProps = {
  slotId: string
  label: string
  required: boolean
  disabled?: boolean
  pulse: boolean
  uploadAccept: string
  mediaType: MediaType
  candidates: MediaReference[]
  variantUpstream: { boardId?: string; projectId?: string; boardFolderUri?: string }
  onSelect: (ref: MediaReference) => void
  onUpload: (value: string) => void
  t: (key: string, options?: Record<string, unknown>) => string
}

function ActiveSlotWithPopover({
  slotId,
  label,
  required,
  disabled,
  pulse,
  uploadAccept,
  candidates,
  variantUpstream,
  onSelect,
  onUpload,
  t,
}: ActiveSlotWithPopoverProps) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    // Read as data URL for simplicity (MediaSlot handles board asset saving)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpload(reader.result)
        setOpen(false)
      }
    }
    reader.readAsDataURL(file)
  }

  // Auto-assign if only one candidate
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && candidates.length === 1) {
      onSelect(candidates[0])
      return
    }
    setOpen(nextOpen)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'group/slot flex flex-col items-center gap-1',
            disabled && 'pointer-events-none',
          )}
        >
          <div
            className={cn(
              'relative flex h-[44px] w-[44px] shrink-0 items-center justify-center',
              'overflow-hidden rounded-xl border border-dashed border-border',
              'bg-ol-surface-muted/50 transition-colors duration-150',
              'hover:bg-ol-surface-muted hover:border-primary/40',
              pulse && 'animate-pulse',
            )}
          >
            <Plus size={14} className="text-muted-foreground/50" />
          </div>
          <span className="text-center text-[9px] leading-tight text-muted-foreground/60">
            {label}
            {required ? <span className="text-amber-500"> *</span> : null}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto min-w-[140px] max-w-[260px] p-2"
        side="top"
        align="start"
      >
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[10px] font-medium text-muted-foreground">
            {t('slot.swapHint')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((ref) => (
              <button
                key={ref.nodeId}
                type="button"
                className={cn(
                  'h-[36px] w-[36px] shrink-0 overflow-hidden rounded-lg border',
                  'border-border bg-ol-surface-muted transition-colors duration-150',
                  'hover:border-primary/50',
                )}
                onClick={() => {
                  onSelect(ref)
                  setOpen(false)
                }}
              >
                <img
                  src={ref.url}
                  alt={ref.nodeId}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </button>
            ))}
          </div>
          {/* Upload option */}
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px]',
              'text-muted-foreground transition-colors duration-150',
              'hover:bg-muted/50 hover:text-foreground',
            )}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={12} />
            {t('slot.uploadFile')}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={uploadAccept}
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Sub-components: Filled slot popover (swap with associated ref)
// ---------------------------------------------------------------------------

type FilledSlotWithPopoverProps = {
  slotId: string
  label: string
  currentRef: MediaReference
  required: boolean
  disabled?: boolean
  uploadAccept: string
  mediaType: MediaType
  candidates: MediaReference[]
  variantUpstream: { boardId?: string; projectId?: string; boardFolderUri?: string }
  onSwap: (ref: MediaReference) => void
  onUpload: (value: string) => void
  onRemove: () => void
  t: (key: string, options?: Record<string, unknown>) => string
}

function FilledSlotWithPopover({
  label,
  currentRef,
  required,
  disabled,
  uploadAccept,
  candidates,
  variantUpstream,
  onSwap,
  onUpload,
  onRemove,
  t,
}: FilledSlotWithPopoverProps) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpload(reader.result)
        setOpen(false)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <div className="group/slot flex flex-col items-center gap-1">
          <MediaSlot
            label=""
            src={currentRef.url}
            uploadAccept={uploadAccept}
            disabled={disabled}
            onRemove={onRemove}
            boardId={variantUpstream.boardId}
            projectId={variantUpstream.projectId}
            boardFolderUri={variantUpstream.boardFolderUri}
            compact
          />
          <span className="text-center text-[9px] leading-tight text-muted-foreground/60">
            {label}
            {required ? <span className="text-amber-500"> *</span> : null}
          </span>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto min-w-[140px] max-w-[260px] p-2"
        side="top"
        align="start"
      >
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[10px] font-medium text-muted-foreground">
            {t('slot.swapHint')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((ref) => (
              <button
                key={ref.nodeId}
                type="button"
                className={cn(
                  'h-[36px] w-[36px] shrink-0 overflow-hidden rounded-lg border',
                  'border-border bg-ol-surface-muted transition-colors duration-150',
                  'hover:border-primary/50',
                )}
                onClick={() => {
                  onSwap(ref)
                  setOpen(false)
                }}
              >
                <img
                  src={ref.url}
                  alt={ref.nodeId}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </button>
            ))}
          </div>
          {/* Upload option */}
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px]',
              'text-muted-foreground transition-colors duration-150',
              'hover:bg-muted/50 hover:text-foreground',
            )}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={12} />
            {t('slot.uploadFile')}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={uploadAccept}
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Sub-components: Associated ref slot (with click-to-assign)
// ---------------------------------------------------------------------------

type AssociatedRefSlotProps = {
  ref_: MediaReference
  mediaSlots: InputSlotDefinition[]
  slotAssignments: Record<string, PoolReference[]>
  variantUpstream: { boardId?: string; projectId?: string; boardFolderUri?: string }
  disabled?: boolean
  onAssignToSlot: (ref: MediaReference, slotId: string) => void
  t: (key: string, options?: Record<string, unknown>) => string
}

function AssociatedRefSlot({
  ref_,
  mediaSlots,
  slotAssignments,
  variantUpstream,
  disabled,
  onAssignToSlot,
  t,
}: AssociatedRefSlotProps) {
  const [open, setOpen] = useState(false)

  // Find matching-type active slots
  const matchingSlots = mediaSlots.filter((s) => s.mediaType === ref_.nodeType)
  // Find matching empty slots
  const emptyMatchingSlots = matchingSlots.filter((s) => {
    const refs = slotAssignments[s.id] ?? []
    return refs.filter(isMediaReference).length === 0
  })

  const handleClick = () => {
    if (disabled) return
    if (emptyMatchingSlots.length > 0) {
      // Auto-assign to first empty matching slot
      onAssignToSlot(ref_, emptyMatchingSlots[0].id)
    } else if (matchingSlots.length === 1) {
      // Only one matching slot, replace directly
      onAssignToSlot(ref_, matchingSlots[0].id)
    } else if (matchingSlots.length > 1) {
      // Multiple matching filled slots: show popover
      setOpen(true)
    }
  }

  // If only one target or empty slot exists, use simple tooltip + click
  if (emptyMatchingSlots.length > 0 || matchingSlots.length <= 1) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleClick()
            }}
          >
            <MediaSlot
              label=""
              src={ref_.url}
              disabled={disabled}
              boardId={variantUpstream.boardId}
              projectId={variantUpstream.projectId}
              boardFolderUri={variantUpstream.boardFolderUri}
              compact
              associated
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          {t('slot.swapHint')}
        </TooltipContent>
      </Tooltip>
    )
  }

  // Multiple matching filled slots: popover to pick which slot to replace
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
        >
          <MediaSlot
            label=""
            src={ref_.url}
            disabled={disabled}
            boardId={variantUpstream.boardId}
            projectId={variantUpstream.projectId}
            boardFolderUri={variantUpstream.boardFolderUri}
            compact
            associated
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto min-w-[140px] max-w-[260px] p-2"
        side="top"
        align="start"
      >
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[10px] font-medium text-muted-foreground">
            {t('slot.swapHint')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {matchingSlots.map((slot) => {
              const assignedMedia = (slotAssignments[slot.id] ?? []).filter(
                isMediaReference,
              )
              const slotLabel = t(slot.labelKey, {
                defaultValue: slot.labelKey,
              })
              return (
                <button
                  key={slot.id}
                  type="button"
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-lg p-1',
                    'transition-colors duration-150 hover:bg-muted/50',
                  )}
                  onClick={() => {
                    onAssignToSlot(ref_, slot.id)
                    setOpen(false)
                  }}
                >
                  {assignedMedia[0] ? (
                    <div className="h-[36px] w-[36px] shrink-0 overflow-hidden rounded-lg border border-border">
                      <img
                        src={assignedMedia[0].url}
                        alt={slot.id}
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    </div>
                  ) : (
                    <div className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border">
                      <Plus size={12} className="text-muted-foreground/50" />
                    </div>
                  )}
                  <span className="text-[9px] text-muted-foreground/60">
                    {slotLabel}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
