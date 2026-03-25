/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

// ---------------------------------------------------------------------------
// Slot assignment engine — pure functions, no React hooks, no side effects
// ---------------------------------------------------------------------------

import type { BoardFileContext } from '../../board-contracts'
import type { UpstreamData, UpstreamEntry } from '../../engine/upstream-data'
import { resolveMediaSource } from '../../nodes/shared/resolveMediaSource'
import type {
  AnySlot,
  InputSlotDefinition,
  MediaReference,
  MediaType,
  MultiSlotDefinition,
  PersistedSlotMap,
  PoolReference,
  ReferencePools,
  TextReference,
  V3InputSlotDefinition,
} from './slot-types'
import type { ResolveContext } from './types'

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isTextReference(ref: PoolReference): ref is TextReference {
  return 'content' in ref
}

export function isMediaReference(ref: PoolReference): ref is MediaReference {
  return 'url' in ref
}

// ---------------------------------------------------------------------------
// buildReferencePools
// ---------------------------------------------------------------------------

/**
 * Convert UpstreamData entries into typed TextReference / MediaReference pools.
 *
 * - Node resource (if provided) is inserted at the front of the matching pool
 *   so it takes highest priority during slot assignment.
 * - Uses resolveMediaSource to produce browser-friendly display URLs while
 *   preserving the original path for API submission.
 */
export function buildReferencePools(
  upstream: UpstreamData,
  fileContext: BoardFileContext | undefined,
  nodeResource?: { nodeId: string; nodeType: string; path: string },
): ReferencePools {
  const pools: ReferencePools = {
    text: [],
    image: [],
    video: [],
    audio: [],
  }

  for (const entry of upstream.entries) {
    const mediaType = entryMediaType(entry)
    if (!mediaType) continue

    if (mediaType === 'text') {
      const ref: TextReference = {
        nodeId: entry.nodeId,
        label: entry.label ?? `Text·${entry.nodeId.slice(0, 6)}`,
        content: entry.data,
        charCount: entry.data.length,
      }
      pools.text.push(ref)
    } else {
      const url = resolveMediaSource(entry.data, fileContext) ?? entry.data
      const ref: MediaReference = {
        nodeId: entry.nodeId,
        nodeType: entry.nodeType,
        url,
        path: entry.data,
      }
      pools[mediaType].push(ref)
    }
  }

  // Node resource gets highest priority — unshift to the front of its pool
  if (nodeResource) {
    const mediaType = nodeTypeToMediaType(nodeResource.nodeType)
    if (mediaType && mediaType !== 'text') {
      const url = resolveMediaSource(nodeResource.path, fileContext) ?? nodeResource.path
      const ref: MediaReference = {
        nodeId: nodeResource.nodeId,
        nodeType: nodeResource.nodeType,
        url,
        path: nodeResource.path,
      }
      // Remove any existing entry for this node to avoid duplicates
      const pool = pools[mediaType] as MediaReference[]
      const existingIdx = pool.findIndex((r) => r.nodeId === nodeResource.nodeId)
      if (existingIdx !== -1) pool.splice(existingIdx, 1)
      pool.unshift(ref)
    }
  }

  return pools
}

// ---------------------------------------------------------------------------
// restoreOrAssign (legacy)
// ---------------------------------------------------------------------------

export type UnifiedSlotResult = {
  /** 功能插槽分配：slotId → 引用列表 */
  assigned: Record<string, PoolReference[]>
  /** 未分配到任何功能插槽的媒体父节点 */
  associated: MediaReference[]
  /** 必填但为空的插槽 ID */
  missingRequired: string[]
}

/**
 * Unified slot assignment with cache restore support (legacy v2).
 *
 * Algorithm:
 * 1. Build a nodeId → MediaReference lookup from the pools.
 * 2. Pass 1 (Restore): If cachedAssignment exists, try to restore each slot
 *    from its cached value. Manual refs (manual:<path>) are reconstructed as
 *    synthetic MediaReferences. Upstream node refs are validated against the
 *    current pools — stale (disconnected) refs are silently skipped.
 * 3. Pass 2 (Auto-assign): For slots not yet filled after Pass 1, pick from
 *    the available pool in order, skipping already-used nodes.
 * 4. Pass 3 (Associated): Any media pool entries not assigned to any slot are
 *    collected as associated references (shown in the overflow tray).
 * 5. Pass 4 (Missing): Slots where assigned.length < min are flagged.
 */
export function restoreOrAssign(
  slots: InputSlotDefinition[],
  pools: ReferencePools,
  cachedAssignment: PersistedSlotMap | undefined,
): UnifiedSlotResult {
  const assigned: Record<string, PoolReference[]> = {}
  const usedNodeIds = new Set<string>()

  // Build nodeId → MediaReference lookup across all media pools
  const mediaRefMap = new Map<string, MediaReference>()
  for (const type of ['image', 'video', 'audio'] as const) {
    for (const ref of pools[type] ?? []) {
      if (isMediaReference(ref)) {
        mediaRefMap.set(ref.nodeId, ref)
      }
    }
  }

  // Pass 1: Restore from cache
  if (cachedAssignment) {
    let cacheValid = true
    for (const slot of slots) {
      if (slot.min === 0) continue
      const cachedValue = cachedAssignment[slot.id]
      if (!cachedValue) continue
      const values = Array.isArray(cachedValue) ? cachedValue : [cachedValue]
      const hasValidRef = values.some((v) => v.startsWith('manual:') || mediaRefMap.has(v))
      if (!hasValidRef) {
        cacheValid = false
        break
      }
    }

    if (cacheValid) {
      for (const slot of slots) {
        const cachedValue = cachedAssignment[slot.id]
        if (!cachedValue) continue

        const values = Array.isArray(cachedValue) ? cachedValue : [cachedValue]
        const refs: PoolReference[] = []

        for (let i = 0; i < values.length; i++) {
          const v = values[i]
          if (v.startsWith('manual:')) {
            const manualPath = v.slice('manual:'.length)
            refs.push({
              nodeId: `__manual_${slot.id}_${i}__`,
              nodeType: slot.mediaType,
              url: manualPath,
              path: manualPath,
            } as MediaReference)
          } else {
            const ref = mediaRefMap.get(v)
            if (ref && !usedNodeIds.has(v)) {
              refs.push(ref)
              usedNodeIds.add(v)
            }
          }
        }

        if (refs.length > 0) {
          assigned[slot.id] = refs
        }
      }
    }
  }

  // Pass 2: Auto-assign unassigned slots
  for (const slot of slots) {
    if (assigned[slot.id]?.length) continue
    assigned[slot.id] = []

    if (slot.mediaType === 'text') {
      const textRefs = (pools.text ?? []).filter(isTextReference)
      if (textRefs.length > 0) {
        assigned[slot.id] = textRefs.slice(0, slot.max)
      }
      continue
    }

    const pool = (pools[slot.mediaType] ?? []).filter(isMediaReference)
    const available = pool.filter((r) => !usedNodeIds.has(r.nodeId))
    const toAssign = available.slice(0, slot.max)
    assigned[slot.id] = toAssign
    for (const ref of toAssign) {
      usedNodeIds.add(ref.nodeId)
    }
  }

  // Pass 3: Collect associated (unassigned media refs, deduplicated)
  const associated: MediaReference[] = []
  const seenAssocIds = new Set<string>()
  for (const type of ['image', 'video', 'audio'] as const) {
    for (const ref of pools[type] ?? []) {
      if (isMediaReference(ref) && !usedNodeIds.has(ref.nodeId) && !seenAssocIds.has(ref.nodeId)) {
        associated.push(ref)
        seenAssocIds.add(ref.nodeId)
      }
    }
  }

  // Pass 4: Collect missingRequired
  const missingRequired: string[] = []
  for (const slot of slots) {
    if (slot.min > 0 && (!assigned[slot.id] || assigned[slot.id].length < slot.min)) {
      missingRequired.push(slot.id)
    }
  }

  return { assigned, associated, missingRequired }
}

// ---------------------------------------------------------------------------
// restoreOrAssignV3
// ---------------------------------------------------------------------------

// Type guards for V3 slot kinds
function isTaskRefSlot(slot: AnySlot): slot is import('./slot-types').TaskRefSlot {
  return 'kind' in slot && (slot as any).kind === 'taskRef'
}

function isMultiSlot(slot: AnySlot): slot is MultiSlotDefinition {
  return 'kind' in slot && (slot as any).kind === 'multi'
}

function getSlotMax(slot: V3InputSlotDefinition | MultiSlotDefinition): number {
  if (isMultiSlot(slot)) return slot.max
  return slot.max ?? 1
}

function getSlotMin(slot: V3InputSlotDefinition | MultiSlotDefinition): number {
  return slot.min ?? 0
}

/**
 * V3 slot assignment engine (API-driven, no source/visible/hidden).
 *
 * All slots go through pool assignment, EXCEPT:
 * - TaskRefSlot: skipped entirely (not pool-assigned)
 * - role === 'mask': skipped from auto-assignment, kept empty (user paints manually)
 *
 * Node resource is already included in the pool via buildReferencePools.
 */
export function restoreOrAssignV3(
  slots: AnySlot[],
  pools: ReferencePools,
  resolveContext: ResolveContext,
  cache?: PersistedSlotMap,
): UnifiedSlotResult {
  const assigned: Record<string, PoolReference[]> = {}
  const usedNodeIds = new Set<string>()

  // Build nodeId → MediaReference lookup
  const mediaRefMap = new Map<string, MediaReference>()
  for (const type of ['image', 'video', 'audio'] as const) {
    for (const ref of pools[type] ?? []) {
      if (isMediaReference(ref)) {
        mediaRefMap.set(ref.nodeId, ref)
      }
    }
  }

  // Filter: skip taskRef slots
  const activeSlots: (V3InputSlotDefinition | MultiSlotDefinition)[] = []
  for (const slot of slots) {
    if (isTaskRefSlot(slot)) continue
    activeSlots.push(slot as V3InputSlotDefinition | MultiSlotDefinition)
  }

  // Separate mask slots (user paints manually) from pool slots
  const poolSlots: typeof activeSlots = []
  for (const slot of activeSlots) {
    if (slot.role === 'mask') {
      // Mask slots stay empty — user paints manually
      assigned[slot.role] = []
    } else {
      poolSlots.push(slot)
    }
  }

  // Pass 1: Restore pool slots from cache
  if (cache) {
    let cacheValid = true
    for (const slot of poolSlots) {
      if (getSlotMin(slot) === 0) continue
      const cachedValue = cache[slot.role]
      if (!cachedValue) continue
      const values = Array.isArray(cachedValue) ? cachedValue : [cachedValue]
      const hasValidRef = values.some((v) => v.startsWith('manual:') || mediaRefMap.has(v))
      if (!hasValidRef) {
        cacheValid = false
        break
      }
    }

    if (cacheValid) {
      for (const slot of poolSlots) {
        const cachedValue = cache[slot.role]
        if (!cachedValue) continue

        const values = Array.isArray(cachedValue) ? cachedValue : [cachedValue]
        const refs: PoolReference[] = []

        for (let i = 0; i < values.length; i++) {
          const v = values[i]
          if (v.startsWith('manual:')) {
            const manualPath = v.slice('manual:'.length)
            refs.push({
              nodeId: `__manual_${slot.role}_${i}__`,
              nodeType: slot.accept,
              url: manualPath,
              path: manualPath,
            } as MediaReference)
          } else {
            const ref = mediaRefMap.get(v)
            if (ref && !usedNodeIds.has(v)) {
              refs.push(ref)
              usedNodeIds.add(v)
            }
          }
        }

        if (refs.length > 0) {
          assigned[slot.role] = refs
        }
      }
    }
  }

  // Pass 2: Auto-assign unassigned pool slots
  for (const slot of poolSlots) {
    if (assigned[slot.role]?.length) continue
    assigned[slot.role] = []

    if (slot.accept === 'text') {
      const textRefs = (pools.text ?? []).filter(isTextReference)
      if (textRefs.length > 0) {
        assigned[slot.role] = textRefs.slice(0, getSlotMax(slot))
      }
      continue
    }

    const acceptKey = slot.accept as MediaType
    if (!(acceptKey in pools)) continue
    const pool = (pools[acceptKey] ?? []).filter(isMediaReference)
    const available = pool.filter(
      (r: MediaReference) => !usedNodeIds.has(r.nodeId),
    )
    const toAssign = available.slice(0, getSlotMax(slot))
    assigned[slot.role] = toAssign
    for (const ref of toAssign) {
      usedNodeIds.add(ref.nodeId)
    }
  }

  // Pass 3: Collect associated (unassigned media refs)
  const associated: MediaReference[] = []
  const seenAssocIds = new Set<string>()
  for (const type of ['image', 'video', 'audio'] as const) {
    for (const ref of pools[type] ?? []) {
      if (
        isMediaReference(ref) &&
        !usedNodeIds.has(ref.nodeId) &&
        !seenAssocIds.has(ref.nodeId)
      ) {
        associated.push(ref)
        seenAssocIds.add(ref.nodeId)
      }
    }
  }

  // Pass 4: Collect missingRequired
  const missingRequired: string[] = []
  for (const slot of activeSlots) {
    const min = getSlotMin(slot)
    if (min > 0 && (!assigned[slot.role] || assigned[slot.role].length < min)) {
      missingRequired.push(slot.role)
    }
  }

  return { assigned, associated, missingRequired }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entryMediaType(entry: UpstreamEntry): MediaType | null {
  return nodeTypeToMediaType(entry.nodeType)
}

function nodeTypeToMediaType(nodeType: string): MediaType | null {
  switch (nodeType) {
    case 'text':
      return 'text'
    case 'image':
      return 'image'
    case 'video':
      return 'video'
    case 'audio':
      return 'audio'
    default:
      return null
  }
}
