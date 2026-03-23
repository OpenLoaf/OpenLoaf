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
import { Plus, Upload } from 'lucide-react'
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
  // Unified assignment (restoreOrAssign replaces assignUpstreamToSlots)
  // cachedAssignment is ONLY used for initial restore (not on every change)
  // to avoid feedback loop: assign → persist → cache prop changes → re-assign
  // ---------------------------------------------------------------------------

  const initialCacheRef = useRef(cachedAssignment)

  const unifiedResult = useMemo(
    () => restoreOrAssign(slots, pools, initialCacheRef.current),
    [slots, pools],
  )

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
      const fresh = restoreOrAssign(slots, pools, initialCacheRef.current)
      setSlotAssignments(fresh.assigned)
      setAssociatedRefs(fresh.associated)
    }
  }, [slots, pools, cachedAssignment])

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
      const mediaRef = refs.find(isMediaReference) as MediaReference | undefined
      if (mediaRef) {
        if (mediaRef.nodeId.startsWith('__manual_')) {
          map[slot.id] = `manual:${mediaRef.path}`
        } else {
          map[slot.id] = mediaRef.nodeId
        }
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

  const handleMediaUpload = useCallback(
    (slotId: string, mediaType: MediaType, value: string) => {
      const newRef: MediaReference = {
        nodeId: `__manual_${slotId}__`,
        nodeType: mediaType,
        url: value,
        path: value,
      }
      setSlotAssignments((prev) => ({
        ...prev,
        [slotId]: [newRef],
      }))
    },
    [],
  )

  const handleMediaRemove = useCallback((slotId: string) => {
    setSlotAssignments((prev) => ({
      ...prev,
      [slotId]: [],
    }))
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

        // If the target slot already has a media ref, move it back to associated
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

  const totalCount = mediaSlots.length + associatedRefs.length
  const isSingleRow = totalCount <= 7

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

      {/* Text slots */}
      {textSlots.map((slot) => {
        const textRefs = (slotAssignments[slot.id] ?? []).filter(isTextReference)
        return (
          <TextSlotField
            key={slot.id}
            label={t(slot.labelKey, { defaultValue: slot.labelKey })}
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
      })}

      {/* Dual-zone media layout */}
      {mediaSlots.length > 0 ? (() => {
        const hasAssociated = associatedRefs.length > 0

        /** Renders all active slot chips */
        const activeSlotChips = mediaSlots.map((slot) => {
          const assignedMedia = (slotAssignments[slot.id] ?? []).filter(
            isMediaReference,
          )
          const currentRef = assignedMedia[0]
          const isEmpty = !currentRef
          const matchingAssociated = matchingAssociatedForSlot(slot)
          const shouldPulse = isEmpty && matchingAssociated.length > 0
          const slotLabel = t(slot.labelKey, { defaultValue: slot.labelKey })
          const uploadAccept = uploadAcceptForType(slot.mediaType)

          if (isEmpty) {
            // Empty active slot: click to assign from associated or upload
            if (matchingAssociated.length > 0) {
              return (
                <ActiveSlotWithPopover
                  key={slot.id}
                  slotId={slot.id}
                  label={slotLabel}
                  required={slot.min > 0}
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
                />
              )
            }
            // No matching associated refs: plain upload slot
            return (
              <MediaSlot
                key={slot.id}
                label={slotLabel}
                icon={<Plus size={14} />}
                required={slot.min > 0}
                uploadAccept={uploadAccept}
                disabled={disabled}
                onUpload={(v) =>
                  handleMediaUpload(slot.id, slot.mediaType, v)
                }
                boardId={variantUpstream.boardId}
                projectId={variantUpstream.projectId}
                boardFolderUri={variantUpstream.boardFolderUri}
                compact
              />
            )
          }

          // Filled active slot: click to swap with associated ref
          if (matchingAssociated.length > 0) {
            return (
              <FilledSlotWithPopover
                key={slot.id}
                slotId={slot.id}
                label={slotLabel}
                currentRef={currentRef}
                required={slot.min > 0}
                disabled={disabled}
                uploadAccept={uploadAccept}
                mediaType={slot.mediaType}
                candidates={matchingAssociated}
                variantUpstream={variantUpstream}
                onSwap={(ref) =>
                  handleSlotSwapWithAssociated(slot.id, ref)
                }
                onUpload={(v) =>
                  handleMediaUpload(slot.id, slot.mediaType, v)
                }
                onRemove={() => handleMediaRemove(slot.id)}
                t={t}
              />
            )
          }

          // Filled slot, no alternatives to swap with
          return (
            <MediaSlot
              key={slot.id}
              label={slotLabel}
              src={currentRef.url}
              required={slot.min > 0}
              uploadAccept={uploadAccept}
              disabled={disabled}
              onUpload={(v) =>
                handleMediaUpload(slot.id, slot.mediaType, v)
              }
              onRemove={() => handleMediaRemove(slot.id)}
              boardId={variantUpstream.boardId}
              projectId={variantUpstream.projectId}
              boardFolderUri={variantUpstream.boardFolderUri}
              compact
            />
          )
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
