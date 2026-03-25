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
 * Remote param schema types — mirrors the SaaS capabilities API response.
 *
 * Since SDK v0.1.24, the API resolves I18nLabel to a plain string based on
 * Accept-Language, so all label/hint/placeholder fields are `string` here.
 * The `locale` parameter in remoteSchemaToParamFields is kept for backwards
 * compat but no longer used for label resolution.
 */

import type { ParamField, ResolveContext } from './types'

// ---------------------------------------------------------------------------
// Visible expression (declarative, replaces visible() functions)
// ---------------------------------------------------------------------------

type ParamEqExpression = { param: string; eq: string | number | boolean }
type ParamInExpression = { param: string; in: (string | number | boolean)[] }
type ParamNotInExpression = { param: string; notIn: (string | number | boolean)[] }
type SlotFilledExpression = { slot: string; filled: boolean }
type AndExpression = { and: VisibleExpression[] }
type OrExpression = { or: VisibleExpression[] }

export type VisibleExpression =
  | ParamEqExpression
  | ParamInExpression
  | ParamNotInExpression
  | SlotFilledExpression
  | AndExpression
  | OrExpression

// ---------------------------------------------------------------------------
// Param option
// ---------------------------------------------------------------------------

export interface RemoteParamOption {
  value: string | number | boolean
  /** Already resolved to current locale by the API (SDK v0.1.24+) */
  label: string
  thumbnail?: string
}

// ---------------------------------------------------------------------------
// Param schema variants
// ---------------------------------------------------------------------------

interface RemoteParamSchemaBase {
  key: string
  /** Already resolved to current locale by the API */
  label: string
  /** Already resolved to current locale by the API */
  hint?: string
  default?: unknown
  group?: 'primary' | 'advanced'
  visibleWhen?: VisibleExpression
  clientOnly?: boolean
}

export interface RemoteSelectParamSchema extends RemoteParamSchemaBase {
  type: 'select'
  options?: RemoteParamOption[]
  catalog?: string
  display?: 'dropdown' | 'grid' | 'pills'
  searchable?: boolean
}

export interface RemoteBooleanParamSchema extends RemoteParamSchemaBase {
  type: 'boolean'
}

export interface RemoteTextParamSchema extends RemoteParamSchemaBase {
  type: 'text'
  multiline?: boolean
  /** Already resolved to current locale by the API */
  placeholder?: string
}

export interface RemoteSliderParamSchema extends RemoteParamSchemaBase {
  type: 'slider'
  min: number
  max: number
  step?: number
}

export interface RemoteNumberParamSchema extends RemoteParamSchemaBase {
  type: 'number'
  min?: number
  max?: number
  step?: number
}

export interface RemoteTabParamSchema extends RemoteParamSchemaBase {
  type: 'tab'
  options?: RemoteParamOption[]
}

export type RemoteParamSchema =
  | RemoteSelectParamSchema
  | RemoteBooleanParamSchema
  | RemoteTextParamSchema
  | RemoteSliderParamSchema
  | RemoteNumberParamSchema
  | RemoteTabParamSchema

// ---------------------------------------------------------------------------
// evaluateVisibleWhen — evaluate a declarative VisibleExpression
// ---------------------------------------------------------------------------

export function evaluateVisibleWhen(
  expr: VisibleExpression,
  ctx: { params: Record<string, unknown>; slots: Record<string, boolean> },
): boolean {
  if ('and' in expr) return expr.and.every((e) => evaluateVisibleWhen(e, ctx))
  if ('or' in expr) return expr.or.some((e) => evaluateVisibleWhen(e, ctx))
  if ('slot' in expr) return (ctx.slots[expr.slot] ?? false) === expr.filled
  if ('eq' in expr) return ctx.params[expr.param] === expr.eq
  if ('in' in expr) return (expr.in as unknown[]).includes(ctx.params[expr.param])
  if ('notIn' in expr) return !(expr.notIn as unknown[]).includes(ctx.params[expr.param])
  // Unknown expression type — fail-safe to hidden
  return false
}

// ---------------------------------------------------------------------------
// remoteSchemaToParamFields — convert RemoteParamSchema[] → ParamField[]
// ---------------------------------------------------------------------------

/**
 * Convert API-returned RemoteParamSchema[] to frontend ParamField[].
 *
 * Since SDK v0.1.24, labels are already resolved to the current locale,
 * so this function simply maps fields without i18n processing.
 * The `_locale` parameter is kept for API compat but unused.
 */
export function remoteSchemaToParamFields(
  schemas: RemoteParamSchema[],
  _locale?: string,
): ParamField[] {
  return schemas.map((schema): ParamField => {
    const base = {
      key: schema.key,
      label: schema.label,
      default: schema.default,
      group: schema.group,
      hint: schema.hint,
      clientOnly: schema.clientOnly,
      ...(schema.visibleWhen
        ? {
            visible: (ctx: ResolveContext) =>
              evaluateVisibleWhen(schema.visibleWhen!, {
                params: ctx.params as Record<string, unknown>,
                slots: ctx.slots as Record<string, boolean>,
              }),
          }
        : {}),
    }

    switch (schema.type) {
      case 'select':
        return {
          ...base,
          type: 'select' as const,
          options: schema.options?.map((o) => ({
            value: o.value,
            label: o.label,
            thumbnail: o.thumbnail,
          })),
          catalog: schema.catalog,
          display: schema.display,
          searchable: schema.searchable,
        }
      case 'boolean':
        return { ...base, type: 'boolean' as const }
      case 'text':
        return {
          ...base,
          type: 'text' as const,
          multiline: schema.multiline,
          placeholder: schema.placeholder,
        }
      case 'slider':
        return {
          ...base,
          type: 'slider' as const,
          min: schema.min,
          max: schema.max,
          step: schema.step,
        }
      case 'number':
        return {
          ...base,
          type: 'number' as const,
          min: schema.min,
          max: schema.max,
          step: schema.step,
        }
      case 'tab':
        return {
          ...base,
          type: 'tab' as const,
          options: (schema.options ?? []).map((o) => ({
            value: o.value,
            label: o.label,
          })),
        }
      default:
        return { ...base, type: 'text' as const }
    }
  })
}

// remoteInputSlotsToSlots has been replaced by apiSlotsToAnySlots in slot-conventions.ts
