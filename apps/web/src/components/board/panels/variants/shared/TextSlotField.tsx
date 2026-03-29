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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { cn } from '@udecode/cn'
import { useTranslation } from 'react-i18next'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'
import type { TextReference } from '../slot-types'
import { ReferenceDropdown } from './ReferenceDropdown'
import type { ReferenceDropdownHandle } from './ReferenceDropdown'

// ---------------------------------------------------------------------------
// Constants & token helpers
// ---------------------------------------------------------------------------

/** Token format embedded in value: @ref{nodeId} */
const REF_TOKEN_RE = /@ref\{([^}]+)\}/g

const CHIP_CLASS = 'ol-text-ref-chip'
const LINK_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" ' +
  'style="flex-shrink:0"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
  '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'

const CHIP_STYLE_ID = 'ol-text-ref-chip-styles'
const CHIP_STYLES = `
.${CHIP_CLASS}{position:relative;display:inline-flex;align-items:center;gap:3px;padding:1px 6px;margin:0 1px;border-radius:9999px;font-size:11px;font-weight:500;line-height:18px;vertical-align:baseline;cursor:default;user-select:none;white-space:nowrap;max-width:180px;background:var(--ol-blue-bg);color:var(--ol-blue);transition:background-color .15s}
.${CHIP_CLASS}:hover{background:var(--ol-blue-bg-hover)}
.${CHIP_CLASS}>span{overflow:hidden;text-overflow:ellipsis}
.${CHIP_CLASS} .ol-ref-x{display:inline-flex;align-items:center;justify-content:center;width:12px;height:12px;margin-left:1px;border-radius:9999px;cursor:pointer;font-size:9px;line-height:1}
.${CHIP_CLASS} .ol-ref-x:hover{background:color-mix(in srgb,var(--ol-blue) 20%,transparent)}
.${CHIP_CLASS}::after{content:attr(data-ref-content);position:absolute;left:0;top:100%;margin-top:4px;z-index:100;max-width:280px;max-height:120px;padding:6px 10px;border-radius:8px;background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);font-size:11px;font-weight:400;line-height:1.5;white-space:pre-wrap;word-break:break-word;overflow:hidden;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;box-shadow:0 4px 12px rgba(0,0,0,.15);pointer-events:none;opacity:0;transition:opacity .15s}
.${CHIP_CLASS}:hover::after{opacity:1}
`

function ensureChipStyles() {
  if (typeof document === 'undefined') return
  let el = document.getElementById(CHIP_STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = CHIP_STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = CHIP_STYLES
}

// ---------------------------------------------------------------------------
// Token ↔ HTML conversion
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Build a chip HTML string for a text reference */
function chipHtml(nodeId: string, label: string, content: string): string {
  const token = `@ref{${nodeId}}`
  return (
    `<span class="${CHIP_CLASS}" data-token="${escapeAttr(token)}" data-ref-content="${escapeAttr(content)}" contenteditable="false">` +
    `${LINK_ICON_SVG}<span>${escapeHtml(label)}</span>` +
    `<span class="ol-ref-x" data-ref-remove="${escapeAttr(nodeId)}">×</span>` +
    '</span>'
  )
}

/** Convert value string (with @ref{nodeId} tokens) to innerHTML */
function valueToHtml(value: string, refMap: Map<string, TextReference>): string {
  if (!value) return ''
  let html = ''
  let lastIndex = 0
  const re = new RegExp(REF_TOKEN_RE.source, 'g')
  let match: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: intentional loop
  while ((match = re.exec(value)) !== null) {
    html += escapeHtml(value.slice(lastIndex, match.index))
    const nodeId = match[1]
    const ref = refMap.get(nodeId)
    if (ref) {
      html += chipHtml(nodeId, ref.label, ref.content)
    } else {
      html += escapeHtml(match[0])
    }
    lastIndex = match.index + match[0].length
  }
  html += escapeHtml(value.slice(lastIndex))
  return html
}

/** Walk DOM tree and reconstruct the value string */
function domToValue(node: Node): string {
  let result = ''
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent ?? ''
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement
      if (el.classList.contains(CHIP_CLASS)) {
        result += el.dataset.token ?? ''
      } else if (el.tagName === 'BR') {
        result += '\n'
      } else if (el.tagName === 'DIV' || el.tagName === 'P') {
        const inner = domToValue(el)
        if (inner) {
          if (result && !result.endsWith('\n')) result += '\n'
          result += inner
        }
      } else {
        result += domToValue(el)
      }
    }
  }
  return result
}

/** Parse @ref{nodeId} tokens from text and return nodeIds */
export function parseRefTokenNodeIds(text: string): string[] {
  const ids: string[] = []
  const re = new RegExp(REF_TOKEN_RE.source, 'g')
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: intentional loop
  while ((m = re.exec(text)) !== null) ids.push(m[1])
  return ids
}

/** Expand @ref{nodeId} tokens to actual content text */
export function expandRefTokens(text: string, refs: TextReference[]): string {
  const map = new Map(refs.map((r) => [r.nodeId, r.content]))
  return text.replace(new RegExp(REF_TOKEN_RE.source, 'g'), (_, id) => map.get(id) ?? '')
}

// ---------------------------------------------------------------------------
// @ trigger detection
// ---------------------------------------------------------------------------

const AT_TRIGGER_RE = /@(\S*)$/

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TextSlotFieldProps = {
  label: string
  /** The combined value: plain text + embedded @ref{nodeId} tokens */
  userText: string
  allReferences: TextReference[]
  assignedNodeIds: Set<string>
  placeholder?: string
  required?: boolean
  disabled?: boolean
  mode: 'inline' | 'replace'
  minLength?: number
  maxLength?: number
  hint?: string
  onUserTextChange: (text: string) => void
  onAddReference: (ref: TextReference) => void
  onRemoveReference: (nodeId: string) => void
  /** @deprecated kept for compat — references are now embedded in userText */
  references?: TextReference[]
}

// ---------------------------------------------------------------------------
// TextSlotField (contentEditable)
// ---------------------------------------------------------------------------

export function TextSlotField({
  label,
  userText,
  allReferences,
  assignedNodeIds,
  placeholder,
  required,
  disabled,
  minLength,
  maxLength,
  hint,
  onUserTextChange,
  onAddReference,
  onRemoveReference,
}: TextSlotFieldProps) {
  const { t } = useTranslation('board')

  const editorRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<ReferenceDropdownHandle>(null)
  const valueRef = useRef<string | null>(null)
  const suppressSyncRef = useRef(false)
  const composingRef = useRef(false)

  // @ dropdown state
  const [atQuery, setAtQuery] = useState<string | null>(null)
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })

  // Build ref map for chip rendering
  const refMap = useRef(new Map<string, TextReference>())
  refMap.current = new Map(allReferences.map((r) => [r.nodeId, r]))

  useEffect(() => {
    ensureChipStyles()
  }, [])

  // Compute plain text length (excluding tokens) for char counter
  const plainTextLength = userText.replace(new RegExp(REF_TOKEN_RE.source, 'g'), '').length

  // ── Sync external value → DOM (useLayoutEffect: runs synchronously before paint) ──
  const prevRefCountRef = useRef(allReferences.length)
  useLayoutEffect(() => {
    if (suppressSyncRef.current) {
      suppressSyncRef.current = false
      return
    }
    const el = editorRef.current
    if (!el) return
    const refsChanged = prevRefCountRef.current !== allReferences.length
    prevRefCountRef.current = allReferences.length
    if (valueRef.current === userText && !refsChanged) return
    valueRef.current = userText
    el.innerHTML = valueToHtml(userText, refMap.current) || ''
  }, [userText, allReferences.length])

  // ── Input handler ──
  const handleInput = useCallback(() => {
    if (composingRef.current) return
    const el = editorRef.current
    if (!el) return
    const newValue = domToValue(el)
    // Skip if value hasn't actually changed (prevents feedback from programmatic innerHTML set)
    if (newValue === valueRef.current) return
    valueRef.current = newValue
    suppressSyncRef.current = true
    onUserTextChange(newValue)

    // Detect @ trigger
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      // Get text before cursor
      const preRange = range.cloneRange()
      preRange.collapse(true)
      preRange.setStart(el, 0)
      const textBefore = preRange.toString()
      const match = AT_TRIGGER_RE.exec(textBefore)
      if (match) {
        setAtQuery(match[1])
        // Position dropdown relative to container
        const container = containerRef.current
        const editorEl = editorRef.current
        if (container && editorEl) {
          const editorRect = editorEl.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()
          setDropdownPos({
            left: editorRect.left - containerRect.left,
            top: editorRect.bottom - containerRect.top + 4,
          })
        }
      } else {
        setAtQuery(null)
      }
    }
  }, [onUserTextChange])

  // ── Composition (IME) ──
  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])
  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false
    handleInput()
  }, [handleInput])

  // ── Keyboard ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (atQuery !== null && dropdownRef.current) {
        const consumed = dropdownRef.current.handleKeyDown(e.nativeEvent)
        if (consumed) {
          e.preventDefault()
          return
        }
      }
    },
    [atQuery],
  )

  // ── Click handler (for chip × button) ──
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement
      const removeId = target.dataset?.refRemove ?? target.closest('[data-ref-remove]')?.getAttribute('data-ref-remove')
      if (removeId) {
        e.preventDefault()
        e.stopPropagation()
        // Remove the token from value
        const token = `@ref{${removeId}}`
        const newValue = (valueRef.current ?? '').replace(token, '')
        valueRef.current = newValue
        // Force DOM re-render immediately since the value changed externally
        const el = editorRef.current
        if (el) {
          el.innerHTML = valueToHtml(newValue, refMap.current)
        }
        suppressSyncRef.current = true
        onUserTextChange(newValue)
        onRemoveReference(removeId)
      }
    },
    [onUserTextChange, onRemoveReference],
  )

  // ── Select reference from dropdown ──
  const handleSelectReference = useCallback(
    (ref: TextReference) => {
      const el = editorRef.current
      if (!el) return

      // Strip the @query from the current value
      const currentValue = domToValue(el)
      const stripped = currentValue.replace(AT_TRIGGER_RE, '')
      const token = `@ref{${ref.nodeId}} `
      const newValue = stripped + token

      valueRef.current = newValue
      suppressSyncRef.current = false
      onUserTextChange(newValue)
      onAddReference(ref)
      setAtQuery(null)

      // Re-render and focus
      requestAnimationFrame(() => {
        if (!el) return
        el.innerHTML = valueToHtml(newValue, refMap.current)
        el.focus()
        // Move caret to end
        const sel = window.getSelection()
        if (sel) {
          const range = document.createRange()
          range.selectNodeContents(el)
          range.collapse(false)
          sel.removeAllRanges()
          sel.addRange(range)
        }
      })
    },
    [onUserTextChange, onAddReference],
  )

  const closeDropdown = useCallback(() => {
    setAtQuery(null)
  }, [])

  // ── Drag-drop from TextReferencePool ──
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
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
        if (!ref) return
        const token = `@ref{${ref.nodeId}} `
        const newValue = (valueRef.current ?? '') + token
        valueRef.current = newValue
        suppressSyncRef.current = false
        onUserTextChange(newValue)
        onAddReference(ref)
      } catch {
        // ignore
      }
    },
    [allReferences, onUserTextChange, onAddReference],
  )

  // ── Paste: strip HTML, keep plain text ──
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault()
      const text = e.clipboardData.getData('text/plain')
      if (text) document.execCommand('insertText', false, text)
    },
    [],
  )

  // ── Close dropdown on outside click ──
  useEffect(() => {
    if (atQuery === null) return
    const handler = (e: PointerEvent) => {
      if (
        editorRef.current && !editorRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest('[data-ref-item]')
      ) {
        setAtQuery(null)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [atQuery])

  const resolvedPlaceholder = placeholder ?? t('slot.textPlaceholder')

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col gap-1"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Label + character counter */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
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
            maxLength != null && plainTextLength > maxLength
              ? 'text-red-500'
              : minLength != null && plainTextLength > 0 && plainTextLength < minLength
                ? 'text-amber-500'
                : 'text-muted-foreground/50',
          )}>
            {plainTextLength}
            {maxLength != null ? `/${maxLength}` : null}
          </span>
        ) : null}
      </div>

      {/* contentEditable editor */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        data-placeholder={resolvedPlaceholder}
        className={cn(
          'min-h-[60px] w-full rounded-2xl bg-muted/30 px-3 py-2 text-xs outline-none',
          'transition-colors duration-150 focus:bg-muted/50',
          'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
          maxLength != null && plainTextLength > maxLength ? 'ring-1 ring-red-400' : '',
          minLength != null && plainTextLength > 0 && plainTextLength < minLength ? 'ring-1 ring-amber-400' : '',
        )}
        onInput={handleInput}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        onPaste={handlePaste}
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
