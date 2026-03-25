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
import { CircleAlert, Paintbrush, Plus, Redo2, Undo2, Upload } from 'lucide-react'
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
import { TextSlotField, parseRefTokenNodeIds, expandRefTokens } from './TextSlotField'
import type { BoardFileContext } from '../../../board-contracts'
import type { UpstreamData } from '../../../engine/upstream-data'
import {
  buildReferencePools,
  isMediaReference,
  isTextReference,
  restoreOrAssignV3,
} from '../slot-engine'
import { isMaskSlot } from '../slot-conventions'
import type {
  AnySlot,
  MediaReference,
  MediaType,
  MultiSlotDefinition,
  PersistedSlotMap,
  PoolReference,
  TextReference,
  V3InputSlotDefinition,
} from '../slot-types'
import type { ResolveContext } from '../types'
import { toMediaInput } from './toMediaInput'
import { MediaSlot } from './MediaSlot'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResolvedSlotInputs = {
  /** slotKey -> resolved values ready for API submission */
  inputs: Record<string, unknown>
  /** slotKey -> raw MediaReference list (for framework-level slot persistence) */
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

/**
 * Internal renderable slot — derived from V3 AnySlot after filtering.
 * Not exposed in props; only used internally for rendering logic.
 */
interface RenderableSlot {
  role: string
  accept: MediaType
  label: string
  min: number
  max: number
  allowUpload: boolean
  referenceMode?: 'inline' | 'replace'
  isPaintable?: boolean
  hint?: string
  // Input constraints (SDK v0.1.27)
  minLength?: number
  maxLength?: number
  maxFileSize?: number
  acceptFormats?: string[]
  minResolution?: number
  maxResolution?: number
  minDuration?: number
  maxDuration?: number
}

/** Convert a filtered V3 slot to the internal RenderableSlot format */
function toRenderable(s: V3InputSlotDefinition | MultiSlotDefinition): RenderableSlot {
  const isMulti = 'kind' in s && (s as { kind: string }).kind === 'multi'
  return {
    role: s.role,
    accept: s.accept as MediaType,
    label: s.label,
    min: s.min ?? 0,
    max: isMulti ? (s as MultiSlotDefinition).max : (s.max ?? 1),
    allowUpload: s.allowUpload !== false,
    referenceMode: s.referenceMode,
    isPaintable: isMaskSlot(s.role),
    hint: s.hint,
    // Input constraints (SDK v0.1.27)
    minLength: s.minLength,
    maxLength: s.maxLength,
    maxFileSize: s.maxFileSize,
    acceptFormats: s.acceptFormats,
    minResolution: s.minResolution,
    maxResolution: s.maxResolution,
    minDuration: s.minDuration,
    maxDuration: s.maxDuration,
  }
}

export type InputSlotBarProps = {
  slots: AnySlot[]
  upstream: UpstreamData
  fileContext: BoardFileContext | undefined
  nodeResource?: { type: MediaType; url?: string; path?: string }
  disabled?: boolean
  onAssignmentChange?: (resolved: ResolvedSlotInputs) => void
  cachedAssignment?: PersistedSlotMap
  /** Cached raw user texts for text slots (with @ref{} tokens preserved). */
  cachedUserTexts?: Record<string, string>
  onSlotAssignmentChange?: (map: PersistedSlotMap) => void
  /** Called when userTexts change — persists raw text with @ref{} tokens to cache. */
  onUserTextsChange?: (texts: Record<string, string>) => void
  maskPaintRef?: React.RefObject<MaskPaintHandle | null>
  maskPainting?: boolean
  maskResult?: MaskPaintResult | null
  brushSize?: number
  onMaskPaintToggle?: (active: boolean) => void
  resolveContext?: ResolveContext
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 150

function resolveSlotInput(
  slot: RenderableSlot,
  refs: PoolReference[],
  userTexts: Record<string, string>,
  allTextRefs?: TextReference[],
): unknown {
  if (slot.accept === 'text') {
    const user = userTexts[slot.role] ?? ''
    // Expand embedded @ref{nodeId} tokens to actual content
    if (allTextRefs && allTextRefs.length > 0) {
      const expanded = expandRefTokens(user, allTextRefs)
      return expanded.trim() || undefined
    }
    // Fallback: legacy separate refs + user text
    const refTexts = refs.filter(isTextReference).map((r) => r.content)
    const parts = [...refTexts, user].filter((s) => s.trim().length > 0)
    return parts.join('\n\n')
  }
  const mediaRefs = refs.filter(isMediaReference)
  if (mediaRefs.length === 0) return undefined
  if (slot.max === 1) {
    const ref = mediaRefs[0]
    return ref.path ? toMediaInput(ref.path) : toMediaInput(ref.url)
  }
  return mediaRefs.map((ref) => (ref.path ? toMediaInput(ref.path) : toMediaInput(ref.url)))
}

function uploadAcceptForType(mediaType: MediaType): string {
  switch (mediaType) {
    case 'video': return 'video/*'
    case 'audio': return 'audio/*'
    default: return 'image/*'
  }
}

// ---------------------------------------------------------------------------
// InputSlotBar
// ---------------------------------------------------------------------------

export function InputSlotBar({
  slots: rawSlots,
  upstream,
  fileContext,
  nodeResource,
  disabled,
  onAssignmentChange,
  cachedAssignment,
  cachedUserTexts,
  onSlotAssignmentChange,
  onUserTextsChange,
  maskPaintRef,
  maskPainting,
  maskResult,
  brushSize: brushSizeProp,
  onMaskPaintToggle,
  resolveContext,
}: InputSlotBarProps) {
  const { t } = useTranslation('board')

  const defaultResolveContext = useMemo<ResolveContext>(
    () => resolveContext ?? { params: {}, variantId: '', slots: {}, modes: {} },
    [resolveContext],
  )

  const slots = useMemo<RenderableSlot[]>(() => {
    const result: RenderableSlot[] = []
    for (const s of rawSlots) {
      if ('kind' in s && (s as { kind: string }).kind === 'taskRef') continue
      const vs = s as V3InputSlotDefinition | MultiSlotDefinition
      if (vs.accept === ('file' as MediaType)) continue
      result.push(toRenderable(vs))
    }
    return result
  }, [rawSlots])

  const hasPaintableSlot = useMemo(() => slots.some((s) => s.isPaintable), [slots])

  const nodeRef = useMemo(() => {
    if (!nodeResource?.path) return undefined
    return {
      nodeId: '__self__',
      nodeType: nodeResource.type,
      url: nodeResource.url ?? nodeResource.path,
      path: nodeResource.path,
    }
  }, [nodeResource?.path, nodeResource?.type, nodeResource?.url])

  const pools = useMemo(
    () => buildReferencePools(upstream, fileContext, nodeRef),
    [upstream, fileContext, nodeRef],
  )

  const initialCacheRef = useRef(cachedAssignment)

  const acceptedMediaTypes = useMemo(() => {
    const types = new Set<string>()
    for (const slot of slots) {
      if (slot.accept !== 'text') types.add(slot.accept)
    }
    return types
  }, [slots])

  const unifiedResult = useMemo(() => {
    const raw = restoreOrAssignV3(rawSlots, pools, defaultResolveContext, initialCacheRef.current)
    const filtered = raw.associated.filter((r: MediaReference) => acceptedMediaTypes.has(r.nodeType))
    return { ...raw, associated: filtered }
  }, [rawSlots, pools, defaultResolveContext, acceptedMediaTypes])

  const [slotAssignments, setSlotAssignments] = useState<Record<string, PoolReference[]>>(() => unifiedResult.assigned)
  const [userTexts, setUserTexts] = useState<Record<string, string>>(() => {
    // Restore from cache if available
    if (cachedUserTexts && Object.keys(cachedUserTexts).length > 0) return { ...cachedUserTexts }
    // Only auto-fill on first mount when no cached assignment exists
    if (cachedAssignment && Object.keys(cachedAssignment).length > 0) return {}
    const textRefs = pools.text.filter(isTextReference)
    if (textRefs.length === 0) return {}
    const texts: Record<string, string> = {}
    for (const slot of slots) {
      if (slot.accept !== 'text') continue
      const tokens = textRefs
        .slice(0, slot.max)
        .map((r) => `@ref{${r.nodeId}}`)
        .join(' ')
      if (tokens) texts[slot.role] = `${tokens} `
    }
    return texts
  })
  const [associatedRefs, setAssociatedRefs] = useState<MediaReference[]>(() => unifiedResult.associated)

  const prevPoolsRef = useRef(pools)
  const prevSlotsRef = useRef(rawSlots)
  const prevTextRefIdsRef = useRef<Set<string>>(new Set(pools.text.filter(isTextReference).map((r) => r.nodeId)))
  useEffect(() => {
    const poolsChanged = prevPoolsRef.current !== pools
    const slotsChanged = prevSlotsRef.current !== rawSlots
    if (poolsChanged || slotsChanged) {
      prevPoolsRef.current = pools
      prevSlotsRef.current = rawSlots
      if (slotsChanged) initialCacheRef.current = cachedAssignment
      const fresh = restoreOrAssignV3(rawSlots, pools, defaultResolveContext, initialCacheRef.current)
      setSlotAssignments(fresh.assigned)
      setAssociatedRefs(fresh.associated.filter((r: MediaReference) => acceptedMediaTypes.has(r.nodeType)))

      // Auto-insert newly connected upstream text refs into text slots
      if (poolsChanged) {
        const freshTextRefs = pools.text.filter(isTextReference)
        const prevIds = prevTextRefIdsRef.current
        const newRefs = freshTextRefs.filter((r) => !prevIds.has(r.nodeId))
        prevTextRefIdsRef.current = new Set(freshTextRefs.map((r) => r.nodeId))
        if (newRefs.length > 0) {
          setUserTexts((prev) => {
            const next = { ...prev }
            for (const slot of slots) {
              if (slot.accept !== 'text') continue
              const existing = prev[slot.role] ?? ''
              // Skip refs already present in text (prevents duplication on cache restore)
              const existingIds = new Set(parseRefTokenNodeIds(existing))
              const deduped = newRefs.filter((r) => !existingIds.has(r.nodeId))
              if (deduped.length === 0) continue
              const tokens = deduped.map((r) => `@ref{${r.nodeId}}`).join(' ')
              next[slot.role] = existing ? `${tokens} ${existing}` : `${tokens} `
            }
            return next
          })
        }
      }
    }
  }, [rawSlots, pools, cachedAssignment, acceptedMediaTypes, defaultResolveContext, slots])

  // Unassigned text references
  const unassignedTextRefs = useMemo(() => {
    const assignedIds = new Set<string>()
    for (const slot of slots) {
      if (slot.accept !== 'text') continue
      for (const id of parseRefTokenNodeIds(userTexts[slot.role] ?? '')) {
        assignedIds.add(id)
      }
    }
    return pools.text.filter(isTextReference).filter((r) => !assignedIds.has(r.nodeId))
  }, [slots, pools.text, userTexts])

  // Persistence
  const onSlotAssignmentChangeRef = useRef(onSlotAssignmentChange)
  onSlotAssignmentChangeRef.current = onSlotAssignmentChange
  const prevAssignmentsRef = useRef(slotAssignments)
  useEffect(() => {
    if (prevAssignmentsRef.current === slotAssignments) return
    prevAssignmentsRef.current = slotAssignments
    if (!onSlotAssignmentChangeRef.current) return
    const map: PersistedSlotMap = {}
    for (const slot of slots) {
      if (slot.accept === 'text') continue
      const refs = slotAssignments[slot.role] ?? []
      const mRefs = refs.filter(isMediaReference) as MediaReference[]
      if (mRefs.length === 0) continue
      if (slot.max > 1) {
        map[slot.role] = mRefs.map((r) => r.nodeId.startsWith('__manual_') ? `manual:${r.path}` : r.nodeId)
      } else {
        const mr = mRefs[0]
        map[slot.role] = mr.nodeId.startsWith('__manual_') ? `manual:${mr.path}` : mr.nodeId
      }
    }
    onSlotAssignmentChangeRef.current(map)
  }, [slots, slotAssignments])

  // Persist userTexts to cache when they change
  const onUserTextsChangeRef = useRef(onUserTextsChange)
  onUserTextsChangeRef.current = onUserTextsChange
  const prevUserTextsRef = useRef(userTexts)
  useEffect(() => {
    if (prevUserTextsRef.current === userTexts) return
    prevUserTextsRef.current = userTexts
    onUserTextsChangeRef.current?.(userTexts)
  }, [userTexts])

  // Text callbacks
  const handleTextUserChange = useCallback((slotKey: string, text: string) => {
    setUserTexts((prev) => ({ ...prev, [slotKey]: text }))
  }, [])

  const handleTextAddRef = useCallback(
    (slotKey: string, ref: TextReference) => {
      setSlotAssignments((prev) => {
        const current = prev[slotKey] ?? []
        if (current.some((r) => isTextReference(r) && r.nodeId === ref.nodeId)) return prev
        return { ...prev, [slotKey]: [...current, ref] }
      })
    },
    [],
  )

  const handleTextRemoveRef = useCallback(
    (slotKey: string, nodeId: string) => {
      setSlotAssignments((prev) => {
        const current = prev[slotKey] ?? []
        return { ...prev, [slotKey]: current.filter((r) => !(isTextReference(r) && r.nodeId === nodeId)) }
      })
    },
    [],
  )

  const handleInsertUnassignedText = useCallback(
    (ref: TextReference) => {
      const targetSlot = slots.find((s) => {
        if (s.accept !== 'text') return false
        return (slotAssignments[s.role] ?? []).length < s.max
      })
      if (targetSlot) handleTextAddRef(targetSlot.role, ref)
    },
    [slots, slotAssignments, handleTextAddRef],
  )

  // Media upload
  const slotMaxMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of slots) map[s.role] = s.max
    return map
  }, [slots])

  const handleMediaUpload = useCallback(
    (slotKey: string, mediaType: MediaType, value: string) => {
      const max = slotMaxMap[slotKey] ?? 1
      setSlotAssignments((prev) => {
        const current = prev[slotKey] ?? []
        const currentMedia = current.filter(isMediaReference)
        const manualIdx = currentMedia.filter((r) => r.nodeId.startsWith('__manual_')).length
        const newRef: MediaReference = { nodeId: `__manual_${slotKey}_${manualIdx}__`, nodeType: mediaType, url: value, path: value }
        if (max > 1 && currentMedia.length < max) return { ...prev, [slotKey]: [...current, newRef] }
        const displaced = currentMedia.filter((r) => !r.nodeId.startsWith('__manual_'))
        if (displaced.length > 0) {
          setAssociatedRefs((prevAssoc) => {
            const existing = new Set(prevAssoc.map((r) => r.nodeId))
            const toAdd = displaced.filter((r) => !existing.has(r.nodeId))
            return toAdd.length > 0 ? [...prevAssoc, ...toAdd] : prevAssoc
          })
        }
        return { ...prev, [slotKey]: [newRef] }
      })
    },
    [slotMaxMap],
  )

  const handleMediaRemove = useCallback((slotKey: string, removeNodeId?: string) => {
    setSlotAssignments((prev) => {
      const current = prev[slotKey] ?? []
      if (removeNodeId) {
        const removed = current.find((r) => isMediaReference(r) && r.nodeId === removeNodeId) as MediaReference | undefined
        if (removed && !removed.nodeId.startsWith('__manual_')) {
          setAssociatedRefs((prevAssoc) => {
            if (prevAssoc.some((r) => r.nodeId === removed.nodeId)) return prevAssoc
            return [...prevAssoc, removed]
          })
        }
        return { ...prev, [slotKey]: current.filter((r) => !isMediaReference(r) || r.nodeId !== removeNodeId) }
      }
      const removedRefs = current.filter(isMediaReference)
      const upstreamRefs = removedRefs.filter((r) => !r.nodeId.startsWith('__manual_'))
      if (upstreamRefs.length > 0) {
        setAssociatedRefs((prevAssoc) => {
          const existing = new Set(prevAssoc.map((r) => r.nodeId))
          const toAdd = upstreamRefs.filter((r) => !existing.has(r.nodeId))
          return toAdd.length > 0 ? [...prevAssoc, ...toAdd] : prevAssoc
        })
      }
      return { ...prev, [slotKey]: [] }
    })
  }, [])

  const handleAssociatedToSlot = useCallback(
    (assocRef: MediaReference, targetSlotKey: string) => {
      setSlotAssignments((prev) => {
        const targetSlot = slots.find((s) => s.role === targetSlotKey)
        if (!targetSlot) return prev
        const currentRefs = prev[targetSlotKey] ?? []
        const currentMedia = currentRefs.filter(isMediaReference)
        if (targetSlot.max > 1 && currentMedia.length < targetSlot.max) {
          setAssociatedRefs((prevAssoc) => prevAssoc.filter((r) => r.nodeId !== assocRef.nodeId))
          return { ...prev, [targetSlotKey]: [...currentRefs, assocRef] }
        }
        const evictedRef = currentMedia[0]
        const next = { ...prev, [targetSlotKey]: [assocRef] }
        setAssociatedRefs((prevAssoc) => {
          let updated = prevAssoc.filter((r) => r.nodeId !== assocRef.nodeId)
          if (evictedRef && !updated.some((r) => r.nodeId === evictedRef.nodeId)) updated = [...updated, evictedRef]
          return updated
        })
        return next
      })
    },
    [slots],
  )

  const handleSlotSwapWithAssociated = useCallback(
    (slotKey: string, assocRef: MediaReference) => {
      setSlotAssignments((prev) => {
        const currentRefs = prev[slotKey] ?? []
        const currentMedia = currentRefs.filter(isMediaReference)
        const evictedRef = currentMedia[0]
        const next = { ...prev, [slotKey]: [assocRef] }
        setAssociatedRefs((prevAssoc) => {
          let updated = prevAssoc.filter((r) => r.nodeId !== assocRef.nodeId)
          if (evictedRef && !updated.some((r) => r.nodeId === evictedRef.nodeId)) updated = [...updated, evictedRef]
          return updated
        })
        return next
      })
    },
    [],
  )

  const allTextRefs = useMemo(() => pools.text.filter(isTextReference), [pools.text])

  // Resolve + emit (debounced)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!onAssignmentChange) return
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      const inputs: Record<string, unknown> = {}
      let isValid = true
      for (const slot of slots) {
        const refs = slotAssignments[slot.role] ?? []
        const resolved = resolveSlotInput(slot, refs, userTexts, allTextRefs)
        inputs[slot.role] = resolved
        if (slot.min > 0) {
          if (slot.accept === 'text') {
            const textVal = resolved as string
            if (!textVal || textVal.trim().length === 0) isValid = false
          } else {
            if (resolved === undefined) isValid = false
            if (Array.isArray(resolved) && resolved.length < slot.min) isValid = false
          }
        }
        // Text length constraints (SDK v0.1.27)
        if (slot.accept === 'text') {
          const textVal = (resolved as string) ?? ''
          const len = textVal.trim().length
          if (slot.minLength != null && len > 0 && len < slot.minLength) isValid = false
          if (slot.maxLength != null && len > slot.maxLength) isValid = false
        }
      }
      const mediaRefs: Record<string, MediaReference[]> = {}
      for (const slot of slots) {
        if (slot.accept === 'text') continue
        mediaRefs[slot.role] = (slotAssignments[slot.role] ?? []).filter(isMediaReference)
      }
      onAssignmentChange({ inputs, mediaRefs, isValid })
    }, DEBOUNCE_MS)
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current) }
  }, [slots, rawSlots, slotAssignments, userTexts, allTextRefs, onAssignmentChange])

  const variantUpstream = useMemo(
    () => ({ boardId: fileContext?.boardId, projectId: fileContext?.projectId, boardFolderUri: fileContext?.boardFolderUri }),
    [fileContext?.boardId, fileContext?.projectId, fileContext?.boardFolderUri],
  )
  const textSlots = useMemo(() => slots.filter((s) => s.accept === 'text'), [slots])
  const mediaSlots = useMemo(() => slots.filter((s) => s.accept !== 'text' && !s.isPaintable), [slots])
  const paintableSlots = useMemo(() => slots.filter((s) => s.isPaintable), [slots])
  const allMediaSlots = useMemo(() => slots.filter((s) => s.accept !== 'text'), [slots])

  const matchingAssociatedForSlot = useCallback(
    (slot: RenderableSlot) => associatedRefs.filter((r) => r.nodeType === slot.accept),
    [associatedRefs],
  )

  if (!slots || slots.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {allMediaSlots.length > 0 ? (() => {
        const hasAssociated = associatedRefs.length > 0
        const isPaintActive = maskPainting ?? false

        // Build slot groups: each media slot role is a group
        const slotGroups: React.ReactNode[] = []

        for (let gi = 0; gi < allMediaSlots.length; gi++) {
          const slot = allMediaSlots[gi]

          // Add separator between groups
          if (gi > 0) {
            slotGroups.push(<div key={`sep:${gi}`} className="mt-5 h-[44px] w-px self-start bg-border" />)
          }

          if (slot.isPaintable) {
            const slotLabel = slot.label
            const hasMask = maskResult?.hasStroke ?? false
            slotGroups.push(
              <div key={`group:${slot.role}`} className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  {slotLabel}
                  {slot.min > 0 ? <span className="text-amber-500"> *</span> : null}
                  {slot.hint ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CircleAlert className="size-3 text-neutral-400 dark:text-neutral-500" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[320px] text-xs">{slot.hint}</TooltipContent>
                    </Tooltip>
                  ) : null}
                </span>
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
                      <img src={maskResult.maskDataUrl} alt="mask" className="h-full w-full rounded-xl object-contain p-0.5 opacity-60" />
                    ) : (
                      <Paintbrush size={14} />
                    )}
                  </button>
                </div>
              </div>,
            )
            continue
          }

          // Non-paintable media slot: render exactly `max` positions
          const assignedMedia = (slotAssignments[slot.role] ?? []).filter(isMediaReference)
          const matchingAssociated = matchingAssociatedForSlot(slot)
          const slotLabel = slot.label
          const uploadAccept = uploadAcceptForType(slot.accept)
          const isMulti = slot.max > 1
          const positions: React.ReactNode[] = []

          // Render filled positions
          for (let i = 0; i < slot.max; i++) {
            const ref = assignedMedia[i]
            if (ref) {
              // Filled position
              const chipKey = `${slot.role}:${ref.nodeId}`
              if (matchingAssociated.length > 0) {
                positions.push(
                  <FilledSlotWithPopover
                    key={chipKey} slotKey={slot.role} label="" currentRef={ref}
                    required={false} disabled={disabled} uploadAccept={uploadAccept}
                    mediaType={slot.accept} candidates={matchingAssociated} variantUpstream={variantUpstream}
                    onSwap={(newRef) => isMulti ? handleAssociatedToSlot(newRef, slot.role) : handleSlotSwapWithAssociated(slot.role, newRef)}
                    onUpload={(v) => handleMediaUpload(slot.role, slot.accept, v)}
                    onRemove={() => isMulti ? handleMediaRemove(slot.role, ref.nodeId) : handleMediaRemove(slot.role)}
                    t={t}
                  />,
                )
              } else {
                positions.push(
                  <MediaSlot
                    key={chipKey} label="" src={ref.url}
                    uploadAccept={uploadAccept} disabled={disabled}
                    onUpload={(v) => handleMediaUpload(slot.role, slot.accept, v)}
                    onRemove={() => isMulti ? handleMediaRemove(slot.role, ref.nodeId) : handleMediaRemove(slot.role)}
                    boardId={variantUpstream.boardId} projectId={variantUpstream.projectId}
                    boardFolderUri={variantUpstream.boardFolderUri} compact
                  />,
                )
              }
            } else {
              // Empty position
              if (matchingAssociated.length > 0 && !disabled) {
                positions.push(
                  <ActiveSlotWithPopover
                    key={`${slot.role}:empty:${i}`} slotKey={slot.role} label=""
                    required={false} disabled={disabled} pulse={false}
                    uploadAccept={uploadAccept} mediaType={slot.accept} candidates={matchingAssociated}
                    variantUpstream={variantUpstream}
                    onSelect={(r) => handleAssociatedToSlot(r, slot.role)}
                    onUpload={(v) => handleMediaUpload(slot.role, slot.accept, v)} t={t}
                  />,
                )
              } else {
                positions.push(
                  <MediaSlot
                    key={`${slot.role}:empty:${i}`} label="" icon={<Plus size={14} />}
                    uploadAccept={uploadAccept} disabled={disabled}
                    onUpload={(v) => handleMediaUpload(slot.role, slot.accept, v)}
                    boardId={variantUpstream.boardId} projectId={variantUpstream.projectId}
                    boardFolderUri={variantUpstream.boardFolderUri} compact
                  />,
                )
              }
            }
          }

          // Wrap positions with top label
          slotGroups.push(
            <div key={`group:${slot.role}`} className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                {slotLabel}
                {slot.min > 0 ? <span className="text-amber-500"> *</span> : null}
                {slot.hint ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CircleAlert className="size-3 text-neutral-400 dark:text-neutral-500" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[320px] text-xs">{slot.hint}</TooltipContent>
                  </Tooltip>
                ) : null}
              </span>
              <div className="flex flex-wrap items-start gap-1.5">
                {positions}
              </div>
            </div>,
          )
        }

        // Associated refs (overflow, separate row)
        const associatedRefChips = associatedRefs.map((ref) => (
          <AssociatedRefSlot
            key={`assoc:${ref.nodeId}`} ref_={ref} mediaSlots={mediaSlots}
            slotAssignments={slotAssignments} variantUpstream={variantUpstream}
            disabled={disabled} onAssignToSlot={handleAssociatedToSlot} t={t}
          />
        ))

        return (
          <div className="flex flex-col gap-2">
            {/* Row 1: slot groups */}
            <div className="flex flex-wrap items-start gap-2">
              {slotGroups}
            </div>
            {/* Row 2: associated (unassigned upstream refs) */}
            {hasAssociated && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  {t('slot.associatedRefs')}
                </span>
                <div className="flex flex-wrap items-start gap-1.5">
                  {associatedRefChips}
                </div>
              </div>
            )}
          </div>
        )
      })() : null}

      {paintableSlots.length > 0 && (maskPainting ?? false) && maskPaintRef?.current ? (
        <div className="flex items-center gap-1.5">
          <button type="button" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 transition-colors" title={t('slot.clearMask', { defaultValue: '清除遮罩' })} onClick={() => maskPaintRef.current?.clear()}><Paintbrush size={13} /></button>
          <input type="range" min={8} max={120} value={brushSizeProp ?? 40} onChange={(e) => maskPaintRef.current?.setBrushSize(Number(e.target.value))} className="h-1 min-w-0 flex-1 cursor-pointer accent-foreground" />
          <span className="mx-0.5 h-4 w-px bg-border" />
          <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 transition-colors disabled:opacity-30" onClick={() => maskPaintRef.current?.undo()}><Undo2 size={13} /></button>
          <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 transition-colors disabled:opacity-30" onClick={() => maskPaintRef.current?.redo()}><Redo2 size={13} /></button>
        </div>
      ) : null}

      {/* ── Text slot fields (prompt, etc.) ── */}
      {textSlots.map((slot) => {
        const text = userTexts[slot.role] ?? ''
        const assignedNodeIds = new Set(parseRefTokenNodeIds(text))
        return (
          <TextSlotField
            key={slot.role}
            label={slot.label}
            userText={text}
            allReferences={allTextRefs}
            assignedNodeIds={assignedNodeIds}
            required={slot.min > 0}
            disabled={disabled}
            mode={slot.referenceMode ?? 'inline'}
            minLength={slot.minLength}
            maxLength={slot.maxLength}
            hint={slot.hint}
            onUserTextChange={(text) => handleTextUserChange(slot.role, text)}
            onAddReference={(ref) => handleTextAddRef(slot.role, ref)}
            onRemoveReference={(nodeId) => handleTextRemoveRef(slot.role, nodeId)}
          />
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type ActiveSlotWithPopoverProps = {
  slotKey: string
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

function ActiveSlotWithPopover({ label, required, disabled, pulse, uploadAccept, candidates, onSelect, onUpload, t }: ActiveSlotWithPopoverProps) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') { onUpload(reader.result); setOpen(false) } }
    reader.readAsDataURL(file)
  }
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && candidates.length === 1) { onSelect(candidates[0]); return }
    setOpen(nextOpen)
  }
  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild disabled={disabled}>
        <button type="button" className={cn('group/slot flex flex-col items-center gap-1', disabled && 'pointer-events-none')}>
          <div className={cn('relative flex h-[44px] w-[44px] shrink-0 items-center justify-center', 'overflow-hidden rounded-xl border border-dashed border-border', 'bg-ol-surface-muted/50 transition-colors duration-150', 'hover:bg-ol-surface-muted hover:border-primary/40', pulse && 'animate-pulse')}>
            <Plus size={14} className="text-muted-foreground/50" />
          </div>
          <span className="text-center text-[9px] leading-tight text-muted-foreground/60">{label}{required ? <span className="text-amber-500"> *</span> : null}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[140px] max-w-[260px] p-2" side="top" align="start">
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[10px] font-medium text-muted-foreground">{t('slot.swapHint')}</span>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((ref) => (
              <button key={ref.nodeId} type="button" className={cn('h-[36px] w-[36px] shrink-0 overflow-hidden rounded-lg border', 'border-border bg-ol-surface-muted transition-colors duration-150', 'hover:border-primary/50')} onClick={() => { onSelect(ref); setOpen(false) }}>
                <img src={ref.url} alt={ref.nodeId} className="h-full w-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
          <button type="button" className={cn('flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px]', 'text-muted-foreground transition-colors duration-150', 'hover:bg-muted/50 hover:text-foreground')} onClick={() => inputRef.current?.click()}>
            <Upload size={12} />{t('slot.uploadFile')}
          </button>
          <input ref={inputRef} type="file" accept={uploadAccept} className="hidden" onChange={handleFileChange} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

type FilledSlotWithPopoverProps = {
  slotKey: string
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

function FilledSlotWithPopover({ label, currentRef, required, disabled, uploadAccept, candidates, variantUpstream, onSwap, onUpload, onRemove, t }: FilledSlotWithPopoverProps) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') { onUpload(reader.result); setOpen(false) } }
    reader.readAsDataURL(file)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <div className="group/slot flex flex-col items-center gap-1">
          <MediaSlot label="" src={currentRef.url} uploadAccept={uploadAccept} disabled={disabled} onRemove={onRemove} boardId={variantUpstream.boardId} projectId={variantUpstream.projectId} boardFolderUri={variantUpstream.boardFolderUri} compact />
          <span className="text-center text-[9px] leading-tight text-muted-foreground/60">{label}{required ? <span className="text-amber-500"> *</span> : null}</span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[140px] max-w-[260px] p-2" side="top" align="start">
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[10px] font-medium text-muted-foreground">{t('slot.swapHint')}</span>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((ref) => (
              <button key={ref.nodeId} type="button" className={cn('h-[36px] w-[36px] shrink-0 overflow-hidden rounded-lg border', 'border-border bg-ol-surface-muted transition-colors duration-150', 'hover:border-primary/50')} onClick={() => { onSwap(ref); setOpen(false) }}>
                <img src={ref.url} alt={ref.nodeId} className="h-full w-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
          <button type="button" className={cn('flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px]', 'text-muted-foreground transition-colors duration-150', 'hover:bg-muted/50 hover:text-foreground')} onClick={() => inputRef.current?.click()}>
            <Upload size={12} />{t('slot.uploadFile')}
          </button>
          <input ref={inputRef} type="file" accept={uploadAccept} className="hidden" onChange={handleFileChange} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

type AssociatedRefSlotProps = {
  ref_: MediaReference
  mediaSlots: RenderableSlot[]
  slotAssignments: Record<string, PoolReference[]>
  variantUpstream: { boardId?: string; projectId?: string; boardFolderUri?: string }
  disabled?: boolean
  onAssignToSlot: (ref: MediaReference, slotKey: string) => void
  t: (key: string, options?: Record<string, unknown>) => string
}

function AssociatedRefSlot({ ref_, mediaSlots, slotAssignments, variantUpstream, disabled, onAssignToSlot, t }: AssociatedRefSlotProps) {
  const [open, setOpen] = useState(false)
  const matchingSlots = mediaSlots.filter((s) => s.accept === ref_.nodeType)
  const emptyMatchingSlots = matchingSlots.filter((s) => (slotAssignments[s.role] ?? []).filter(isMediaReference).length === 0)
  const handleClick = () => {
    if (disabled) return
    if (emptyMatchingSlots.length > 0) onAssignToSlot(ref_, emptyMatchingSlots[0].role)
    else if (matchingSlots.length === 1) onAssignToSlot(ref_, matchingSlots[0].role)
    else if (matchingSlots.length > 1) setOpen(true)
  }
  if (emptyMatchingSlots.length > 0 || matchingSlots.length <= 1) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div role="button" tabIndex={disabled ? -1 : 0} onClick={handleClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}>
            <MediaSlot label="" src={ref_.url} disabled={disabled} boardId={variantUpstream.boardId} projectId={variantUpstream.projectId} boardFolderUri={variantUpstream.boardFolderUri} compact associated />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">{t('slot.swapHint')}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <div role="button" tabIndex={disabled ? -1 : 0}>
          <MediaSlot label="" src={ref_.url} disabled={disabled} boardId={variantUpstream.boardId} projectId={variantUpstream.projectId} boardFolderUri={variantUpstream.boardFolderUri} compact associated />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[140px] max-w-[260px] p-2" side="top" align="start">
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[10px] font-medium text-muted-foreground">{t('slot.swapHint')}</span>
          <div className="flex flex-wrap gap-1.5">
            {matchingSlots.map((slot) => {
              const assignedMedia = (slotAssignments[slot.role] ?? []).filter(isMediaReference)
              const slotLabel = slot.label
              return (
                <button key={slot.role} type="button" className={cn('flex flex-col items-center gap-0.5 rounded-lg p-1', 'transition-colors duration-150 hover:bg-muted/50')} onClick={() => { onAssignToSlot(ref_, slot.role); setOpen(false) }}>
                  {assignedMedia[0] ? (
                    <div className="h-[36px] w-[36px] shrink-0 overflow-hidden rounded-lg border border-border">
                      <img src={assignedMedia[0].url} alt={slot.role} className="h-full w-full object-cover" draggable={false} />
                    </div>
                  ) : (
                    <div className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border">
                      <Plus size={12} className="text-muted-foreground/50" />
                    </div>
                  )}
                  <span className="text-[9px] text-muted-foreground/60">{slotLabel}</span>
                </button>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
