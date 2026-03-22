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
import type { VariantDefinition } from '../panels/variants/types'
import { IMAGE_VARIANTS } from '../panels/variants/image'
import { VIDEO_VARIANTS } from '../panels/variants/video'
import { AUDIO_VARIANTS } from '../panels/variants/audio'
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

/** Select the variant registry for a given node type. Returns null for unknown types. */
function getVariantRegistryForNodeType(
  nodeType: string,
): Record<string, VariantDefinition> | null {
  switch (nodeType) {
    case 'image':
      return IMAGE_VARIANTS
    case 'video':
      return VIDEO_VARIANTS
    case 'audio':
      return AUDIO_VARIANTS
    default:
      return null
  }
}

/** Collect all accepted input types from a variant registry (union across all variants). */
function collectAcceptedInputTypes(
  registry: Record<string, VariantDefinition>,
): Set<MediaType> {
  const result = new Set<MediaType>()
  for (const variant of Object.values(registry)) {
    if (variant.acceptsInputTypes) {
      for (const t of variant.acceptsInputTypes) {
        result.add(t)
      }
    }
  }
  return result
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
 *     with the union of accepted input types across the target node's variant registry.
 *     Unknown node types (group, link, stroke, etc.) are allowed to connect freely.
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
  const targetRegistry = getVariantRegistryForNodeType(targetNode.type)

  // Unknown target node type — allow freely for backward compatibility
  if (targetRegistry === null) {
    return { valid: true }
  }

  const acceptedByTarget = collectAcceptedInputTypes(targetRegistry)

  // No variants declare acceptsInputTypes — allow all for backward compatibility
  if (acceptedByTarget.size === 0) {
    return { valid: true }
  }

  const sourceOutputTypes = getNodeDefinition(sourceNode.type)?.outputTypes ?? []

  // No source output types declared — cannot determine compatibility, allow freely
  if (sourceOutputTypes.length === 0) {
    return { valid: true }
  }

  const hasOverlap = sourceOutputTypes.some((t) => acceptedByTarget.has(t))
  if (!hasOverlap) {
    return { valid: false, reason: 'type-incompatible' }
  }

  return { valid: true }
}
