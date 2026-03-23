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
  InputSlotDefinition,
  MediaReference,
  MediaType,
  PersistedSlotMap,
  PoolReference,
  ReferencePools,
  SlotAssignment,
  TextReference,
} from './slot-types'

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
// assignUpstreamToSlots
// ---------------------------------------------------------------------------

/**
 * Distribute reference pools across declared input slots.
 *
 * Algorithm:
 * 1. Clone pools to avoid mutating the caller's data.
 * 2. Sort slots: required (min > 0) first, then optional — ensures required
 *    slots are filled before optional ones compete for the same media type.
 * 3. For each slot:
 *    - Text slots with overflowStrategy='merge' and more items than max:
 *      merge all text into one synthetic TextReference.
 *    - Otherwise: splice up to max items from the pool for that media type.
 * 4. Collect missingRequired for slots where assigned.length < min.
 * 5. Remaining pool items become overflow entries.
 */
export function assignUpstreamToSlots(
  slots: InputSlotDefinition[],
  pools: ReferencePools,
): SlotAssignment {
  if (slots.length === 0) {
    return { assigned: {}, overflow: {}, missingRequired: [] }
  }

  // Clone pools so we can splice without side effects
  const workPools: ReferencePools = {
    text: [...pools.text],
    image: [...pools.image],
    video: [...pools.video],
    audio: [...pools.audio],
  }

  const assigned: Record<string, PoolReference[]> = {}
  const missingRequired: string[] = []

  // Required slots first
  const sorted = [...slots].sort((a, b) => {
    const aRequired = a.min > 0 ? 0 : 1
    const bRequired = b.min > 0 ? 0 : 1
    return aRequired - bRequired
  })

  for (const slot of sorted) {
    const pool = workPools[slot.mediaType] as PoolReference[]

    if (
      slot.mediaType === 'text' &&
      slot.overflowStrategy === 'merge' &&
      pool.length > slot.max
    ) {
      // Merge all text entries into one synthetic TextReference
      const textRefs = pool.filter(isTextReference)
      const merged = mergeTextReferences(textRefs, slot.id)
      pool.length = 0 // consume entire pool
      assigned[slot.id] = [merged]
    } else {
      const take = Math.min(pool.length, slot.max)
      assigned[slot.id] = pool.splice(0, take)
    }

    if (assigned[slot.id].length < slot.min) {
      missingRequired.push(slot.id)
    }
  }

  // Any remaining pool items become overflow, keyed by media type
  const overflow: Record<string, PoolReference[]> = {}
  for (const mediaType of ['text', 'image', 'video', 'audio'] as MediaType[]) {
    const remaining = workPools[mediaType]
    if (remaining.length > 0) {
      overflow[mediaType] = remaining
    }
  }

  return { assigned, overflow, missingRequired }
}

// ---------------------------------------------------------------------------
// restoreOrAssign
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
 * Unified slot assignment with cache restore support.
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
  // First validate that all required slots' cached values are still connected.
  // If any required slot's cache is stale (non-manual and nodeId not in pool),
  // abandon the entire cache restore and fall through to full auto-assignment.
  if (cachedAssignment) {
    let cacheValid = true
    for (const slot of slots) {
      if (slot.min === 0) continue // optional slots don't invalidate the cache
      const cachedValue = cachedAssignment[slot.id]
      if (!cachedValue) continue
      if (cachedValue.startsWith('manual:')) continue // manual refs are always valid
      if (!mediaRefMap.has(cachedValue)) {
        cacheValid = false
        break
      }
    }

    if (cacheValid) {
      for (const slot of slots) {
        const cachedValue = cachedAssignment[slot.id]
        if (!cachedValue) continue

        if (cachedValue.startsWith('manual:')) {
          const manualPath = cachedValue.slice('manual:'.length)
          assigned[slot.id] = [
            {
              nodeId: `__manual_${slot.id}__`,
              nodeType: slot.mediaType,
              url: manualPath,
              path: manualPath,
            } as MediaReference,
          ]
          continue
        }

        const ref = mediaRefMap.get(cachedValue)
        if (ref && !usedNodeIds.has(cachedValue)) {
          assigned[slot.id] = [ref]
          usedNodeIds.add(cachedValue)
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

  // Pass 3: Collect associated (unassigned media refs)
  const associated: MediaReference[] = []
  for (const type of ['image', 'video', 'audio'] as const) {
    for (const ref of pools[type] ?? []) {
      if (isMediaReference(ref) && !usedNodeIds.has(ref.nodeId)) {
        associated.push(ref)
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

/**
 * Merge multiple TextReferences into a single synthetic one.
 * Contents are joined with double newlines.
 */
function mergeTextReferences(refs: TextReference[], slotId: string): TextReference {
  const content = refs.map((r) => r.content).join('\n\n')
  return {
    nodeId: `merged:${slotId}`,
    label: `Merged (${refs.length})`,
    content,
    charCount: content.length,
  }
}
