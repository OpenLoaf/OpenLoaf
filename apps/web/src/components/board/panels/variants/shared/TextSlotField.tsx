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

import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { cn } from '@udecode/cn'
import { useTranslation } from 'react-i18next'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'
import type { TextReference } from '../slot-types'
import { ReferenceChip } from './ReferenceChip'
import { ReferenceDropdown } from './ReferenceDropdown'
import type { ReferenceDropdownHandle } from './ReferenceDropdown'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TextSlotFieldProps = {
  label: string
  references: TextReference[]
  userText: string
  allReferences: TextReference[]
  assignedNodeIds: Set<string>
  placeholder?: string
  required?: boolean
  disabled?: boolean
  mode: 'inline' | 'replace'
  /** Text: minimum character length (SDK v0.1.27). */
  minLength?: number
  /** Text: maximum character length (SDK v0.1.27). */
  maxLength?: number
  /** Hint text displayed as tooltip next to label. */
  hint?: string
  onUserTextChange: (text: string) => void
  onAddReference: (ref: TextReference) => void
  onRemoveReference: (nodeId: string) => void
}

// @ trigger regex: '@' followed by optional non-whitespace at end of string
const AT_TRIGGER_RE = /@(\S*)$/

// ---------------------------------------------------------------------------
// TextSlotField
// ---------------------------------------------------------------------------

/**
 * Text input component supporting inline ReferenceChip tokens (@ mentions).
 *
 * - **inline** mode: chips row above a plain textarea; user can type freely
 * - **replace** mode: when a reference is assigned, show read-only preview;
 *   clear the reference to return to manual textarea input
 */
export function TextSlotField({
  label,
  references,
  userText,
  allReferences,
  assignedNodeIds,
  placeholder,
  required,
  disabled,
  mode,
  minLength,
  maxLength,
  hint,
  onUserTextChange,
  onAddReference,
  onRemoveReference,
}: TextSlotFieldProps) {
  const { t } = useTranslation('board')

  // @ dropdown state
  const [atQuery, setAtQuery] = useState<string | null>(null)
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<ReferenceDropdownHandle>(null)

  // ---------------------------------------------------------------------------
  // @ detection helpers
  // ---------------------------------------------------------------------------

  const detectAtTrigger = useCallback((value: string) => {
    const match = AT_TRIGGER_RE.exec(value)
    if (match) {
      setAtQuery(match[1])
      // Position dropdown at textarea bottom edge
      const ta = textareaRef.current
      if (ta) {
        const rect = ta.getBoundingClientRect()
        setDropdownPos({ left: rect.left, top: rect.bottom + 4 })
      }
    } else {
      setAtQuery(null)
    }
  }, [])

  const closeDropdown = useCallback(() => {
    setAtQuery(null)
  }, [])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      onUserTextChange(value)
      detectAtTrigger(value)
    },
    [onUserTextChange, detectAtTrigger],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (atQuery !== null && dropdownRef.current) {
        const consumed = dropdownRef.current.handleKeyDown(e.nativeEvent)
        if (consumed) return
      }
    },
    [atQuery],
  )

  const handleSelectReference = useCallback(
    (ref: TextReference) => {
      // Strip the @query from the current text
      const stripped = userText.replace(AT_TRIGGER_RE, '')
      onUserTextChange(stripped)
      onAddReference(ref)
      closeDropdown()
    },
    [userText, onUserTextChange, onAddReference, closeDropdown],
  )

  // ---------------------------------------------------------------------------
  // Drag-drop from TextReferencePool
  // ---------------------------------------------------------------------------

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Allow drop
    e.preventDefault()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      try {
        const raw = e.dataTransfer.getData('application/json')
        if (!raw) return
        const payload = JSON.parse(raw) as { type: string; nodeId: string }
        if (payload.type !== 'text-reference') return
        const ref = allReferences.find((r) => r.nodeId === payload.nodeId)
        if (ref) onAddReference(ref)
      } catch {
        // ignore malformed drag data
      }
    },
    [allReferences, onAddReference],
  )

  // Close dropdown when clicking outside the textarea
  useEffect(() => {
    if (atQuery === null) return
    const handler = (e: PointerEvent) => {
      if (textareaRef.current && !textareaRef.current.contains(e.target as Node)) {
        closeDropdown()
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [atQuery, closeDropdown])

  // ---------------------------------------------------------------------------
  // Replace mode: single reference assigned
  // ---------------------------------------------------------------------------

  const hasReference = references.length > 0

  if (mode === 'replace' && hasReference) {
    const ref = references[0]
    return (
      <div className="flex flex-col gap-1">
        {/* Label row */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {label}
            {required ? (
              <span className="ml-0.5 text-[10px] text-red-400">*</span>
            ) : null}
          </span>
          <button
            type="button"
            className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors duration-150"
            onPointerDown={(e) => {
              e.stopPropagation()
              onRemoveReference(ref.nodeId)
            }}
          >
            {t('slot.clearReference')}
          </button>
        </div>

        {/* Reference chip */}
        <div className="rounded-2xl bg-muted/30 px-3 py-2">
          <div className="mb-1.5">
            <ReferenceChip
              reference={ref}
              mode="inline"
              removable
              onRemove={() => onRemoveReference(ref.nodeId)}
            />
          </div>
          {/* Full content preview */}
          <p className="whitespace-pre-wrap break-words text-xs text-foreground/70 leading-relaxed">
            {ref.content}
          </p>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Replace mode: no reference — show plain textarea
  // Inline mode: chips row + textarea
  // ---------------------------------------------------------------------------

  const resolvedPlaceholder = placeholder ?? t('slot.textPlaceholder')

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-1"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Label + character counter */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {label}
          {required ? (
            <span className="text-[10px] text-red-400">*</span>
          ) : null}
          {hint ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <CircleAlert className="size-3 text-neutral-400 dark:text-neutral-500" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[320px] text-xs">{hint}</TooltipContent>
            </Tooltip>
          ) : null}
        </span>
        {(minLength != null || maxLength != null) ? (
          <span className={cn(
            'text-[10px] tabular-nums',
            maxLength != null && userText.length > maxLength
              ? 'text-red-500'
              : minLength != null && userText.length > 0 && userText.length < minLength
                ? 'text-amber-500'
                : 'text-muted-foreground/50',
          )}>
            {userText.length}
            {maxLength != null ? `/${maxLength}` : null}
          </span>
        ) : null}
      </div>

      {/* Chips row (inline mode only, when chips exist) */}
      {mode === 'inline' && references.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {references.map((ref) => (
            <ReferenceChip
              key={ref.nodeId}
              reference={ref}
              mode="inline"
              removable
              onRemove={() => onRemoveReference(ref.nodeId)}
            />
          ))}
        </div>
      ) : null}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={userText}
        placeholder={resolvedPlaceholder}
        disabled={disabled}
        rows={3}
        maxLength={maxLength}
        className={cn(
          'min-h-[60px] w-full resize-none rounded-2xl bg-muted/30 px-3 py-2 text-xs outline-none',
          'placeholder:text-muted-foreground/40 transition-colors duration-150',
          'focus:bg-muted/50',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
          maxLength != null && userText.length > maxLength ? 'ring-1 ring-red-400' : '',
          minLength != null && userText.length > 0 && userText.length < minLength ? 'ring-1 ring-amber-400' : '',
        )}
        onChange={handleTextareaChange}
        onKeyDown={handleKeyDown}
      />

      {/* @ mention dropdown */}
      {atQuery !== null ? (
        <ReferenceDropdown
          ref={dropdownRef}
          query={atQuery}
          references={allReferences}
          assignedNodeIds={assignedNodeIds}
          onSelect={handleSelectReference}
          onClose={closeDropdown}
          position={dropdownPos}
        />
      ) : null}
    </div>
  )
}
