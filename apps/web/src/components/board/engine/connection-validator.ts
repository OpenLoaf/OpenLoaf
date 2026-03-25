/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import type { MediaType } from '../panels/variants/slot-types'
import { isValidConnectionDirection } from './anchor-direction'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionValidation = {
  valid: boolean
  reason?: 'direction-mismatch' | 'type-incompatible' | 'self-loop'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Default accepted input types per node type.
 * Used when capabilities data is not available.
 */
const DEFAULT_ACCEPTED_TYPES: Record<string, Set<MediaType>> = {
  image: new Set(['text', 'image']),
  video: new Set(['text', 'image', 'audio', 'video']),
  audio: new Set(['text', 'audio']),
}

// ---------------------------------------------------------------------------
// Main validation function
// ---------------------------------------------------------------------------

/**
 * Pure function — validates whether a connection between two nodes is allowed.
 *
 * Rules:
 *  1. Self-loop: a node cannot connect to itself.
 *  2. Direction: source anchor must be 'output', target anchor must be 'input'.
 *  3. Type compatibility: at least one of the source's output types must overlap
 *     with the accepted input types for the target node type.
 *     Unknown node types are allowed to connect freely.
 */
export function validateConnection(
  sourceNode: { id: string; type: string },
  sourceAnchorId: string,
  targetNode: { id: string; type: string },
  targetAnchorId: string,
  getNodeDefinition: (type: string) => { outputTypes?: MediaType[] } | undefined,
): ConnectionValidation {
  // 1. Self-loop check
  if (sourceNode.id === targetNode.id) {
    return { valid: false, reason: 'self-loop' }
  }

  // 2. Direction check
  if (!isValidConnectionDirection(sourceAnchorId, targetAnchorId)) {
    return { valid: false, reason: 'direction-mismatch' }
  }

  // 3. Type compatibility check
  const acceptedByTarget = DEFAULT_ACCEPTED_TYPES[targetNode.type]

  // Unknown target node type — allow freely
  if (!acceptedByTarget) {
    return { valid: true }
  }

  const sourceOutputTypes = getNodeDefinition(sourceNode.type)?.outputTypes ?? []

  // No source output types declared — allow freely
  if (sourceOutputTypes.length === 0) {
    return { valid: true }
  }

  const hasOverlap = sourceOutputTypes.some((t) => acceptedByTarget.has(t))
  if (!hasOverlap) {
    return { valid: false, reason: 'type-incompatible' }
  }

  return { valid: true }
}
