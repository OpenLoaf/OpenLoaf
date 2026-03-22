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
