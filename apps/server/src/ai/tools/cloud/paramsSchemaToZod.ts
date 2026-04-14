/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'
import type { V3ToolFeature } from '@openloaf-saas/sdk'

type ParamSchema = V3ToolFeature['paramsSchema'][number]
type InputSlot = V3ToolFeature['inputSlots'][number]

/**
 * Convert a single SaaS paramSchema entry into a zod schema branch.
 * Every param is wrapped as `.optional()` — the SaaS backend is the
 * source of truth for required/default, and zod-level required would
 * force the model to always emit every field.
 */
function paramEntryToZod(entry: ParamSchema): z.ZodTypeAny {
  const hint = [entry.label, entry.hint].filter(Boolean).join(' — ')

  switch (entry.type) {
    case 'select':
    case 'tab': {
      const values = (entry.options ?? []).map((o) => String(o.value))
      if (values.length === 0) return z.string().optional().describe(hint)
      const [first, ...rest] = values
      return z
        .enum([first!, ...rest] as [string, ...string[]])
        .optional()
        .describe(hint)
    }
    case 'boolean':
      return z.boolean().optional().describe(hint)
    case 'text':
      return z.string().optional().describe(hint)
    case 'slider':
    case 'number': {
      let schema = z.number()
      if ('min' in entry && typeof entry.min === 'number') schema = schema.min(entry.min)
      if ('max' in entry && typeof entry.max === 'number') schema = schema.max(entry.max)
      return schema.optional().describe(hint)
    }
    default:
      return z.unknown().optional()
  }
}

function inputSlotToZod(slot: InputSlot): z.ZodTypeAny {
  const hint = [slot.label, slot.hint].filter(Boolean).join(' — ')
  // Slot values from SaaS are always scalars/URLs/strings — keep it simple and
  // treat every slot as `string.optional()`. Role/accept distinctions
  // (text vs file URL) are documented in the description, not schema.
  return z.string().optional().describe(hint)
}

/**
 * Build the full zod input schema for a flat V3 tool feature.
 * Shape: `{ [slot.key|slot.role]: string, [param.key]: ... }` — inputs
 * and params are merged into a single flat object because the feature
 * signature is singular (no variant dispatch anymore) and a flat shape
 * is easier for the model to fill correctly.
 */
export function buildFeatureZodSchema(feature: V3ToolFeature): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const slot of feature.inputSlots) {
    const key = slot.key ?? slot.role
    if (!key) continue
    shape[key] = inputSlotToZod(slot)
  }

  for (const param of feature.paramsSchema) {
    shape[param.key] = paramEntryToZod(param)
  }

  return z.object(shape)
}

/**
 * Partition a flat input object back into `{ inputs, params }` as expected
 * by `v3ToolExecute`. Uses the feature's declared slot keys to pick which
 * fields go into `inputs`; everything else falls into `params`.
 */
export function splitInputsAndParams(
  feature: V3ToolFeature,
  flat: Record<string, unknown>,
): { inputs: Record<string, unknown>; params: Record<string, unknown> } {
  const slotKeys = new Set<string>()
  for (const slot of feature.inputSlots) {
    const k = slot.key ?? slot.role
    if (k) slotKeys.add(k)
  }

  const inputs: Record<string, unknown> = {}
  const params: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(flat)) {
    if (v === undefined) continue
    if (slotKeys.has(k)) inputs[k] = v
    else params[k] = v
  }
  return { inputs, params }
}
