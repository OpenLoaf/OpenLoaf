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
import { ChevronRight, CircleAlert, Minus, Plus } from 'lucide-react'
import { cn } from '@udecode/cn'
import { Input } from '@openloaf/ui/input'
import { Switch } from '@openloaf/ui/switch'
import { Slider } from '@openloaf/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@openloaf/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@openloaf/ui/collapsible'
import type {
  VariantUpstream,
  VariantSnapshot,
  ParamField,
  SelectField,
  BooleanField,
  TextField,
  SliderField,
  NumberField,
  TabField,
  ResolveContext,
} from '../types'
import type { MediaReference } from '../slot-types'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'
import { PillSelect } from './PillSelect'
import { useCatalog } from '../../../hooks/useCatalog'
import {
  CameraAngleControl,
  CAMERA_ANGLE_DEFAULTS,
  isCameraAngleParams,
  splitCameraAngleFields,
} from './CameraAngleControl'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GenericVariantFormProps {
  variantId: string
  upstream: VariantUpstream
  nodeResourceUrl?: string
  nodeResourcePath?: string
  disabled?: boolean
  initialParams?: VariantSnapshot
  resolvedSlots?: Record<string, MediaReference[]>
  onParamsChange: (params: VariantSnapshot) => void
  onWarningChange?: (warning: string | null) => void
  /** Override params from remote schema (takes precedence over definition.params). */
  overrideParams?: ParamField[]
  /** Content injected into the CameraAngleControl right column (e.g. prompt text slot). */
  cameraChildren?: React.ReactNode
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultParams(fields: ParamField[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.key in CAMERA_ANGLE_DEFAULTS) {
      result[f.key] = CAMERA_ANGLE_DEFAULTS[f.key]
    } else if (f.default !== undefined) {
      result[f.key] = f.default
    }
  }
  return result
}


// ---------------------------------------------------------------------------
// SelectFieldRenderer — extracted to allow hooks (useCatalog)
// ---------------------------------------------------------------------------

function SelectFieldRenderer({
  field,
  value,
  onChange,
  disabled,
}: {
  field: SelectField
  value: unknown
  onChange: (key: string, val: unknown) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const { items: catalogItems, isLoading: catalogLoading } = useCatalog(field.catalog)
  const options = field.catalog
    ? catalogItems.map((i) => ({ value: i.value, label: i.label }))
    : (field.options ?? [])
  const strVal = String(value ?? field.default ?? '')

  if (field.display === 'pills') {
    return (
      <PillSelect
        options={options.map((o) => ({
          value: String(o.value),
          label: o.label,
        }))}
        value={strVal}
        onChange={(v) => onChange(field.key, v)}
        disabled={disabled || catalogLoading}
        fullWidth
      />
    )
  }

  return (
    <Select
      value={strVal}
      onValueChange={(v) => onChange(field.key, v)}
      disabled={disabled || catalogLoading}
    >
      <SelectTrigger className="h-8 rounded-3xl border-neutral-200 bg-white text-xs shadow-none dark:border-neutral-700 dark:bg-neutral-900">
        <SelectValue placeholder={catalogLoading ? t('common.loading', '加载中…') : field.label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={String(o.value)} value={String(o.value)}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ---------------------------------------------------------------------------
// ParamFieldRenderer
// ---------------------------------------------------------------------------

function ParamFieldRenderer({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ParamField
  value: unknown
  onChange: (key: string, val: unknown) => void
  disabled?: boolean
}) {
  switch (field.type) {
    case 'select': {
      return (
        <SelectFieldRenderer
          field={field as SelectField}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      )
    }

    case 'boolean': {
      const f = field as BooleanField
      const checked = Boolean(value ?? f.default ?? false)
      return (
        <Switch
          checked={checked}
          onCheckedChange={(v) => onChange(f.key, v)}
          disabled={disabled}
        />
      )
    }

    case 'text': {
      const f = field as TextField
      const strVal = String(value ?? '')
      return (
        <textarea
          value={strVal}
          onChange={(e) => onChange(f.key, e.target.value)}
          placeholder={f.placeholder ?? f.label}
          disabled={disabled}
          rows={2}
          className="min-h-0 w-full resize-none rounded-2xl bg-muted/30 px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/40 transition-colors duration-150 focus:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
        />
      )
    }

    case 'slider': {
      const f = field as SliderField
      const numVal = Number(value ?? f.default ?? f.min)
      return (
        <div className="flex items-center gap-3">
          <Slider
            value={[numVal]}
            onValueChange={([v]) => onChange(f.key, v)}
            min={f.min}
            max={f.max}
            step={f.step ?? 1}
            disabled={disabled}
            className="flex-1"
          />
          <span className="min-w-[2.5rem] text-right text-xs tabular-nums text-neutral-500">
            {numVal}
          </span>
        </div>
      )
    }

    case 'number': {
      const f = field as NumberField
      const numVal = value !== undefined ? Number(value) : (f.default as number) ?? 0
      return (
        <Input
          type="number"
          value={numVal}
          onChange={(e) => onChange(f.key, Number(e.target.value))}
          min={f.min}
          max={f.max}
          step={f.step}
          disabled={disabled}
          className="h-8 w-24 rounded-3xl border-neutral-200 bg-white text-xs shadow-none dark:border-neutral-700 dark:bg-neutral-900"
        />
      )
    }

    case 'tab': {
      const f = field as TabField
      const strVal = String(value ?? f.default ?? '')
      return (
        <div className="inline-flex rounded-3xl border border-neutral-200 dark:border-neutral-700">
          {(f.options ?? []).map((o) => {
            const isActive = String(o.value) === strVal
            return (
              <button
                key={String(o.value)}
                type="button"
                disabled={disabled}
                className={cn(
                  'px-2.5 py-0.5 text-[11px] font-medium transition-colors duration-150 first:rounded-l-3xl last:rounded-r-3xl',
                  isActive
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
                onClick={() => onChange(f.key, String(o.value))}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      )
    }

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// AdvancedSection
// ---------------------------------------------------------------------------

function AdvancedSection({
  fields,
  params,
  onChange,
  disabled,
  resolveCtx,
}: {
  fields: ParamField[]
  params: Record<string, unknown>
  onChange: (key: string, val: unknown) => void
  disabled?: boolean
  resolveCtx: ResolveContext
}) {
  const { t } = useTranslation('board')
  const [open, setOpen] = useState(false)

  const visibleFields = fields.filter(
    (f) => !f.visible || f.visible(resolveCtx),
  )
  if (visibleFields.length === 0) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 py-1 text-[11px] font-medium text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300">
        <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
        {t('generateAction.advancedOptions')}
        <ChevronRight
          className={cn(
            'size-3 transition-transform duration-150',
            open && 'rotate-90',
          )}
        />
        <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
      </CollapsibleTrigger>
      <CollapsibleContent className="max-h-[200px] overflow-y-auto px-0 py-2.5">
        <div className="flex flex-col gap-1.5">
          {renderFieldRows(visibleFields, params, onChange, resolveCtx, disabled)}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// renderFieldRows — groups boolean fields 2-per-row, others full-width
// ---------------------------------------------------------------------------

function renderFieldRows(
  fields: ParamField[],
  params: Record<string, unknown>,
  onChange: (key: string, val: unknown) => void,
  resolveCtx: ResolveContext,
  disabled?: boolean,
): React.ReactNode[] {
  const result: React.ReactNode[] = []
  let i = 0
  while (i < fields.length) {
    const field = fields[i]
    if (field.visible && !field.visible(resolveCtx)) { i++; continue }

    if (field.type === 'boolean') {
      // Collect up to 2 consecutive visible booleans
      const next = fields[i + 1]
      const nextVisible = next && next.type === 'boolean' && (!next.visible || next.visible(resolveCtx))
      if (nextVisible) {
        result.push(
          <div key={`bool-pair:${field.key}`} className="grid grid-cols-2 gap-3">
            <BooleanFieldInline field={field} value={params[field.key]} onChange={onChange} disabled={disabled} />
            <BooleanFieldInline field={next} value={params[next.key]} onChange={onChange} disabled={disabled} />
          </div>,
        )
        i += 2
      } else {
        result.push(
          <BooleanFieldInline key={field.key} field={field} value={params[field.key]} onChange={onChange} disabled={disabled} />,
        )
        i++
      }
    } else {
      const inlineTypes = new Set(['select', 'number', 'slider', 'tab'])
      result.push(
        <FieldRow key={field.key} label={field.label} hint={field.hint} inline={inlineTypes.has(field.type)}>
          <ParamFieldRenderer field={field} value={params[field.key]} onChange={onChange} disabled={disabled} />
        </FieldRow>,
      )
      i++
    }
  }
  return result
}

function BooleanFieldInline({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ParamField
  value: unknown
  onChange: (key: string, val: unknown) => void
  disabled?: boolean
}) {
  const checked = Boolean(value ?? (field as BooleanField).default ?? false)
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
        <LabelWithHint label={field.label} hint={field.hint} />
      </label>
      <Switch
        checked={checked}
        onCheckedChange={(v) => onChange(field.key, v)}
        disabled={disabled}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// FieldRow — label + control layout
// ---------------------------------------------------------------------------

function LabelWithHint({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      {hint ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <CircleAlert className="size-3 text-neutral-400 dark:text-neutral-500" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[320px] text-xs">
            {hint}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  )
}

function FieldRow({
  label,
  hint,
  inline,
  children,
}: {
  label: string
  hint?: string
  /** When true, render label and control on the same row (for switches etc.) */
  inline?: boolean
  children: React.ReactNode
}) {
  if (inline) {
    return (
      <div className="grid grid-cols-[3fr_7fr] items-center gap-3">
        <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          <LabelWithHint label={label} hint={hint} />
        </label>
        <div className="text-right">{children}</div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
        <LabelWithHint label={label} hint={hint} />
      </label>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// GenericVariantForm
// ---------------------------------------------------------------------------

export function GenericVariantForm({
  variantId,
  upstream,
  nodeResourceUrl,
  nodeResourcePath,
  disabled,
  initialParams,
  resolvedSlots,
  onParamsChange,
  onWarningChange,
  overrideParams,
  cameraChildren,
}: GenericVariantFormProps) {
  const { t } = useTranslation()

  // 参数字段完全来自远端 schema（API 驱动）
  const effectiveParamFields = overrideParams ?? []

  // ---- State ----
  const [params, setParams] = useState<Record<string, unknown>>(() => ({
    ...getDefaultParams(effectiveParamFields),
    ...initialParams?.params,
  }))

  const [modes, setModes] = useState<Record<string, string>>({})

  const [repeatGroups, setRepeatGroups] = useState<
    Record<string, Record<string, unknown>[]>
  >({})

  // ---- Resolve context ----
  const slotsState = useMemo<Record<string, boolean>>(() => {
    const result: Record<string, boolean> = {}
    if (resolvedSlots) {
      for (const [key, refs] of Object.entries(resolvedSlots)) {
        result[key] = refs.length > 0
      }
    }
    return result
  }, [resolvedSlots])

  const resolveCtx = useMemo<ResolveContext>(
    () => ({
      params,
      variantId,
      slots: slotsState,
      modes,
    }),
    [params, variantId, slotsState, modes],
  )

  // ---- Sync params upstream ----
  const onParamsChangeRef = useRef(onParamsChange)
  onParamsChangeRef.current = onParamsChange
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    onParamsChangeRef.current({
      inputs: {},
      params,
    })
  }, [params])

  // ---- Handlers ----
  const handleFieldChange = useCallback((key: string, val: unknown) => {
    setParams((prev) => ({ ...prev, [key]: val }))
  }, [])

  const handleModeChange = useCallback(
    (groupKey: string, mode: string) => {
      setModes((prev) => ({ ...prev, [groupKey]: mode }))
    },
    [],
  )

  const handleRepeatRowsChange = useCallback(
    (groupKey: string, rows: Record<string, unknown>[]) => {
      setRepeatGroups((prev) => ({ ...prev, [groupKey]: rows }))
    },
    [],
  )

  // ---- Derived ----
  const allParams = effectiveParamFields
  const primaryFields = allParams.filter(
    (f) => (f.group ?? 'primary') === 'primary',
  )
  const advancedFields = allParams.filter((f) => f.group === 'advanced')

  // ---- Camera angle detection ----
  const hasCameraAngle = isCameraAngleParams(primaryFields)
  const { cameraFields, otherFields: normalPrimaryFields } = hasCameraAngle
    ? splitCameraAngleFields(primaryFields)
    : { cameraFields: [], otherFields: primaryFields }

  // Derive source image URL for camera angle preview (from resolved slots or node resource)
  const cameraSourceImageUrl = hasCameraAngle
    ? (resolvedSlots?.source?.[0]?.url ?? nodeResourceUrl)
    : undefined

  return (
    <div className="flex flex-col gap-3">

      {/* Camera angle control (replaces default sliders when detected) */}
      {hasCameraAngle && cameraFields.length > 0 ? (
        <CameraAngleControl
          fields={cameraFields}
          params={params}
          onChange={handleFieldChange}
          disabled={disabled}
          sourceImageUrl={cameraSourceImageUrl}
        >
          {cameraChildren}
        </CameraAngleControl>
      ) : null}

      {/* Remaining primary params */}
      {renderFieldRows(normalPrimaryFields, params, handleFieldChange, resolveCtx, disabled)}

      {/* Advanced */}
      {advancedFields.length > 0 && (
        <AdvancedSection
          fields={advancedFields}
          params={params}
          onChange={handleFieldChange}
          disabled={disabled}
          resolveCtx={resolveCtx}
        />
      )}
    </div>
  )
}
