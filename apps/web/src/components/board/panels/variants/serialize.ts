/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import type { MediaInput } from './types'
import type {
  AnySlot,
  V3InputSlotDefinition,
  MultiSlotDefinition,
  TaskRefSlot,
} from './slot-types'
import { isMaskSlot } from './slot-conventions'

interface FormState {
  prompt?: string
  paintResults: Record<string, MediaInput>
  slotAssignments: Record<string, MediaInput[]>
  taskRefs: Record<string, string>
  params: Record<string, unknown>
  count?: number
  seed?: number
}

interface V3GenerateRequest {
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  count?: number
  seed?: number
  ticketId?: string
}

function isTaskRefSlot(slot: AnySlot): slot is TaskRefSlot {
  return 'kind' in slot && slot.kind === 'taskRef'
}

function isMultiSlot(slot: AnySlot): slot is MultiSlotDefinition {
  return 'kind' in slot && slot.kind === 'multi'
}

function toMediaInput(
  resource: MediaInput | undefined,
): MediaInput | undefined {
  if (!resource) return undefined
  return resource.url
    ? { url: resource.url }
    : resource.path
      ? { path: resource.path }
      : undefined
}

export function serializeForGenerate(
  slots: AnySlot[],
  state: FormState,
): V3GenerateRequest {
  const inputs: Record<string, unknown> = {}
  const params: Record<string, unknown> = {}

  // 1. slots → inputs
  for (const slot of slots) {
    if (isTaskRefSlot(slot)) {
      const ref = state.taskRefs[slot.role]
      if (ref) inputs[slot.role] = ref
      continue
    }

    const s = slot as V3InputSlotDefinition | MultiSlotDefinition

    // mask slot: read from paintResults
    if (isMaskSlot(s.role)) {
      const media = toMediaInput(state.paintResults.mask)
      if (media) inputs[s.role] = media
      continue
    }

    // pool slots
    const refs = state.slotAssignments[s.role] ?? []
    if (isMultiSlot(slot) || (s.max ?? 1) > 1) {
      const mapped = refs.map((r) => toMediaInput(r)).filter(Boolean)
      if (mapped.length) inputs[s.role] = mapped
    } else if (refs[0]) {
      const media = toMediaInput(refs[0])
      if (media) inputs[s.role] = media
    }
  }

  // 1.5 如果有用户输入的 prompt 且 inputs 中没有 prompt，补充进去
  if (state.prompt && !inputs.prompt) {
    inputs.prompt = state.prompt
  }

  // 2. params（直接从 state.params 序列化）
  for (const [key, val] of Object.entries(state.params)) {
    if (val !== undefined) params[key] = val
  }

  return {
    inputs,
    params,
    ...(state.count !== undefined && { count: state.count }),
    ...(state.seed !== undefined && { seed: state.seed }),
  }
}

export type { FormState, V3GenerateRequest }
