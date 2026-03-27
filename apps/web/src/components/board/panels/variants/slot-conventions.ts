/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Well-known role conventions for API-driven slot system.
 *
 * Replaces per-variant local definitions (IMAGE_VARIANTS etc.).
 * Frontend infers behavior from slot role + accept, not from hardcoded registries.
 */

import type { V3RemoteInputSlot } from '@/lib/saas-media'
import type { MediaType } from './slot-types'

/** Whether the slot is a paint mask (user draws on canvas). */
export function isMaskSlot(role: string): boolean {
  return role === 'mask'
}

/** Whether the slot is a text input (prompt, speech, etc.). */
export function isTextSlot(accept: string): boolean {
  return accept === 'text'
}

/**
 * Infer variant applicability from its inputSlots and current context.
 *
 * All variants are always applicable — required slots that lack upstream
 * input are shown as empty with a required indicator (asterisk) in the form.
 */
export function inferApplicability(
  _inputSlots: V3RemoteInputSlot[],
  _ctx: { nodeMediaType?: MediaType; upstreamTypes: Set<MediaType> },
): boolean {
  return true
}

/**
 * Extract the set of accepted media input types from inputSlots.
 * Used by dynamic-templates and connection-validator to determine compatibility.
 */
export function inferAcceptedInputTypes(inputSlots: V3RemoteInputSlot[]): Set<MediaType> {
  const types = new Set<MediaType>()
  for (const slot of inputSlots) {
    if (slot.accept !== 'text' && slot.accept !== 'file') {
      types.add(slot.accept as MediaType)
    }
  }
  return types
}

/**
 * Convert API V3RemoteInputSlot[] directly to frontend AnySlot[].
 *
 * Pure conversion — no merging with local definitions.
 * This replaces remoteInputSlotsToSlots().
 */
export function apiSlotsToAnySlots(
  remoteSlots: V3RemoteInputSlot[],
): import('./slot-types').AnySlot[] {
  return remoteSlots.map((rs) => {
    const base = {
      role: rs.role,
      accept: rs.accept as MediaType,
      label: rs.label,
      min: rs.minCount ?? (rs.required === false ? 0 : 1),
      max: rs.maxCount ?? 1,
      ...(rs.multiline != null ? { referenceMode: 'replace' as const } : {}),
      ...(rs.hint ? { hint: rs.hint } : {}),
      ...(rs.sharedGroup ? { sharedGroup: rs.sharedGroup, sharedMaxCount: rs.sharedMaxCount } : {}),
      // Input constraints (SDK v0.1.27)
      ...(rs.minLength != null ? { minLength: rs.minLength } : {}),
      ...(rs.maxLength != null ? { maxLength: rs.maxLength } : {}),
      ...(rs.maxFileSize != null ? { maxFileSize: rs.maxFileSize } : {}),
      ...(rs.acceptFormats ? { acceptFormats: rs.acceptFormats } : {}),
      ...(rs.minResolution != null ? { minResolution: rs.minResolution } : {}),
      ...(rs.maxResolution != null ? { maxResolution: rs.maxResolution } : {}),
      ...(rs.minDuration != null ? { minDuration: rs.minDuration } : {}),
      ...(rs.maxDuration != null ? { maxDuration: rs.maxDuration } : {}),
    }
    if (rs.maxCount && rs.maxCount > 1) {
      return { ...base, kind: 'multi' as const, max: rs.maxCount } as import('./slot-types').AnySlot
    }
    return base as import('./slot-types').AnySlot
  })
}
