/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@udecode/cn'
import {
  Calendar,
  FileText,
  Image,
  Layers,
  Link2,
  Loader2,
  Music,
  Paperclip,
  Video,
} from 'lucide-react'
import i18next from 'i18next'
import type { CanvasNodeElement } from '../engine/types'
import { extractTextNodePlainText } from './lib/text-node-utils'

const MAX_DEFAULT_LABEL_LENGTH = 40

/** Resolve a small icon for a node type. */
function getNodeTypeIcon(type: string) {
  switch (type) {
    case 'text':
      return <FileText size={12} className="shrink-0 opacity-60" />
    case 'image':
      return <Image size={12} className="shrink-0 opacity-60" />
    case 'video':
      return <Video size={12} className="shrink-0 opacity-60" />
    case 'audio':
      return <Music size={12} className="shrink-0 opacity-60" />
    case 'file-attachment':
      return <Paperclip size={12} className="shrink-0 opacity-60" />
    case 'link':
      return <Link2 size={12} className="shrink-0 opacity-60" />
    case 'calendar':
      return <Calendar size={12} className="shrink-0 opacity-60" />
    case 'loading':
      return <Loader2 size={12} className="shrink-0 opacity-60" />
    default:
      return <Layers size={12} className="shrink-0 opacity-60" />
  }
}

/** Get the translated node type name (e.g. "图片", "视频"). */
function getNodeTypeName(type: string): string {
  const key = `board:nodeLabel.${type}`
  const translated = i18next.t(key)
  return translated !== key ? translated : type
}

/** Derive a default title from node props (fileName, text content, etc.). */
export function getNodeDefaultTitle(element: CanvasNodeElement): string {
  const props = element.props as Record<string, unknown>

  // Media nodes: use fileName if available
  if (typeof props.fileName === 'string' && props.fileName) {
    return truncateLabel(props.fileName)
  }

  // Text node: extract first line of plain text
  if (element.type === 'text') {
    const text = extractTextNodePlainText(props.value)
    if (text.trim()) {
      const firstLine = text.trim().split('\n')[0]
      return truncateLabel(firstLine)
    }
    return ''
  }

  // Link node: use title or hostname
  if (element.type === 'link') {
    if (typeof props.title === 'string' && props.title) {
      return truncateLabel(props.title)
    }
    if (typeof props.url === 'string' && props.url) {
      try {
        return new URL(props.url).hostname
      } catch {
        return truncateLabel(props.url)
      }
    }
    return ''
  }

  return ''
}

function truncateLabel(text: string): string {
  const singleLine = text.replace(/\n/g, ' ')
  if (singleLine.length <= MAX_DEFAULT_LABEL_LENGTH) return singleLine
  return `${singleLine.slice(0, MAX_DEFAULT_LABEL_LENGTH)}…`
}

// ---------------------------------------------------------------------------
// NodeLabel component
// ---------------------------------------------------------------------------

export type NodeLabelProps = {
  element: CanvasNodeElement
  onLabelChange: (label: string) => void
}

/** Displays a label above the node: [icon] [type name] [editable title]. */
export const NodeLabel = memo(function NodeLabel({
  element,
  onLabelChange,
}: NodeLabelProps) {
  const typeName = getNodeTypeName(element.type)
  const customLabel =
    typeof element.meta?.label === 'string' ? element.meta.label : ''
  const defaultTitle = getNodeDefaultTitle(element)
  const displayTitle = customLabel || defaultTitle

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(displayTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync draft when the title changes externally while not editing
  useEffect(() => {
    if (!editing) setDraft(displayTitle)
  }, [displayTitle, editing])

  // Focus & select input when entering edit mode
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commit = useCallback(() => {
    setEditing(false)
    const trimmed = draft.trim()
    const defTitle = getNodeDefaultTitle(element)
    // If cleared or matches the auto-derived title, remove custom label
    if (!trimmed || trimmed === defTitle) {
      if (customLabel) onLabelChange('')
    } else if (trimmed !== customLabel) {
      onLabelChange(trimmed)
    }
  }, [draft, customLabel, element, onLabelChange])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      setEditing(true)
    },
    [],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        commit()
      } else if (e.key === 'Escape') {
        setEditing(false)
        setDraft(customLabel || defaultTitle)
      }
    },
    [commit, customLabel, defaultTitle],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Prevent drag when editing the label
      if (editing) e.stopPropagation()
    },
    [editing],
  )

  return (
    <div
      className="pointer-events-auto absolute bottom-full left-0 mb-0.5 flex origin-bottom-left items-center gap-1"
      style={{
        transform: 'scale(var(--label-scale, 1))',
        maxWidth: 'calc(100% / var(--label-scale, 1))',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Part 1: icon */}
      {getNodeTypeIcon(element.type)}
      {/* Part 2: type name (not editable) */}
      <span className="shrink-0 text-xs text-foreground/50 select-none">
        {typeName}
      </span>
      {/* Part 3: editable title */}
      {editing ? (
        <input
          ref={inputRef}
          className={cn(
            'h-4 min-w-[60px] rounded border-none bg-transparent px-0.5 text-xs outline-none',
            'text-foreground/70 focus:ring-1 focus:ring-primary/40',
          )}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <span
          className="min-w-0 truncate text-xs text-foreground/40 select-none"
          title={displayTitle}
          onDoubleClick={handleDoubleClick}
        >
          {displayTitle || '…'}
        </span>
      )}
    </div>
  )
})
