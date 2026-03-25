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

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { cn } from '@udecode/cn'
import { Link2 } from 'lucide-react'
import type { TextReference } from '../slot-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReferenceDropdownHandle = {
  /** Handle a keyboard event. Returns true if the event was consumed. */
  handleKeyDown(e: KeyboardEvent): boolean
}

export type ReferenceDropdownProps = {
  query: string
  references: TextReference[]
  /** nodeIds that are already assigned — shown greyed out and not selectable. */
  assignedNodeIds: Set<string>
  onSelect: (ref: TextReference) => void
  onClose: () => void
  position: { left: number; top: number }
}

// ---------------------------------------------------------------------------
// ReferenceDropdown
// ---------------------------------------------------------------------------

/**
 * An @ mention dropdown for selecting upstream text references.
 * Expose `handleKeyDown` via ref for the parent input to delegate keyboard events.
 */
export const ReferenceDropdown = forwardRef<
  ReferenceDropdownHandle,
  ReferenceDropdownProps
>(function ReferenceDropdown(
  { query, references, assignedNodeIds, onSelect, onClose, position },
  ref,
) {
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Filter by query (case-insensitive match on label + content)
  const filtered = useMemo(() => {
    if (!query) return references
    const lower = query.toLowerCase()
    return references.filter(
      (r) =>
        r.label.toLowerCase().includes(lower) ||
        r.content.toLowerCase().includes(lower),
    )
  }, [query, references])

  // Reset active index when filtered list changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on query change
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const items = list.querySelectorAll<HTMLButtonElement>('[data-ref-item]')
    const item = items[activeIndex]
    item?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useImperativeHandle(ref, () => ({
    handleKeyDown(e: KeyboardEvent): boolean {
      if (filtered.length === 0) return false

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
        return true
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        return true
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const ref = filtered[activeIndex]
        if (ref && !assignedNodeIds.has(ref.nodeId)) {
          e.preventDefault()
          onSelect(ref)
          return true
        }
        return false
      }
      if (e.key === 'Escape') {
        onClose()
        return true
      }
      return false
    },
  }))

  if (filtered.length === 0) return null

  return (
    <div
      ref={listRef}
      className={cn(
        'absolute z-50 w-64 overflow-y-auto rounded-2xl border border-border bg-card py-1 shadow-lg',
        'max-h-[240px]',
      )}
      style={{ left: position.left, top: position.top }}
    >
      {filtered.map((r, idx) => {
        const assigned = assignedNodeIds.has(r.nodeId)
        const isActive = idx === activeIndex
        const previewContent =
          r.content.length > 20 ? `${r.content.slice(0, 20)}…` : r.content

        return (
          <button
            key={r.nodeId}
            type="button"
            data-ref-item
            disabled={assigned}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-100',
              'text-[12px]',
              assigned ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
              isActive && !assigned ? 'bg-foreground/8' : 'hover:bg-foreground/5',
            )}
            onPointerDown={(e) => {
              e.stopPropagation()
              if (!assigned) onSelect(r)
            }}
          >
            <Link2
              size={12}
              className={cn('shrink-0', assigned ? 'text-muted-foreground' : 'text-ol-blue')}
            />
            <span className="min-w-0 flex-1">
              <span className={cn('font-medium', assigned ? 'text-foreground/60' : 'text-foreground')}>
                {r.label}
              </span>
              {previewContent ? (
                <span className="ml-1.5 truncate text-muted-foreground/70">{previewContent}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground/50">({r.charCount})</span>
          </button>
        )
      })}
    </div>
  )
})
