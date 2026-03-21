/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@udecode/cn"
import {
  FileText,
  Image,
  Video,
  Music,
  Search,
  X,
} from "lucide-react"

import type { CanvasElement, CanvasNodeElement } from "../engine/types"
import type { CanvasEngine } from "../engine/CanvasEngine"
import { extractTextNodePlainText } from "../nodes/lib/text-node-utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Node type filter options. */
type NodeTypeFilter = "all" | "text" | "image" | "video" | "audio"

/** A search result entry. */
type SearchResult = {
  /** Element id. */
  id: string
  /** Node type string. */
  type: string
  /** Display label (file name, text excerpt, or type fallback). */
  label: string
  /** Node position and size for viewport focus. */
  xywh: [number, number, number, number]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Searchable node types. */
const SEARCHABLE_NODE_TYPES = new Set(["text", "image", "video", "audio"])

/** Node type filter tabs. */
const TYPE_FILTER_OPTIONS: NodeTypeFilter[] = ["all", "text", "image", "video", "audio"]

/** Maximum label length for display. */
const MAX_LABEL_LENGTH = 40

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve icon for a node type. */
function getNodeTypeIcon(type: string) {
  switch (type) {
    case "text":
      return <FileText size={14} className="shrink-0 text-muted-foreground" />
    case "image":
      return <Image size={14} className="shrink-0 text-muted-foreground" />
    case "video":
      return <Video size={14} className="shrink-0 text-muted-foreground" />
    case "audio":
      return <Music size={14} className="shrink-0 text-muted-foreground" />
    default:
      return <FileText size={14} className="shrink-0 text-muted-foreground" />
  }
}

/** Extract searchable text from a node element. */
function getSearchableText(element: CanvasNodeElement): string {
  const props = element.props as Record<string, unknown>
  const parts: string[] = []

  // Text node value
  if (element.type === "text") {
    const text = extractTextNodePlainText(props.value)
    if (text) parts.push(text)
    if (typeof props.markdownText === "string" && props.markdownText) {
      parts.push(props.markdownText)
    }
  }

  // fileName (image, video, audio, file-attachment)
  if (typeof props.fileName === "string" && props.fileName) {
    parts.push(props.fileName)
  }

  // AI prompt
  const aiConfig = props.aiConfig as Record<string, unknown> | undefined
  if (aiConfig && typeof aiConfig.prompt === "string" && aiConfig.prompt) {
    parts.push(aiConfig.prompt)
  }

  // Link node
  if (element.type === "link") {
    if (typeof props.title === "string" && props.title) parts.push(props.title)
    if (typeof props.url === "string" && props.url) parts.push(props.url)
  }

  return parts.join(" ")
}

/** Build display label for a search result. */
function buildLabel(element: CanvasNodeElement): string {
  const props = element.props as Record<string, unknown>

  if (typeof props.fileName === "string" && props.fileName) {
    return truncate(props.fileName)
  }

  if (element.type === "text") {
    const text = extractTextNodePlainText(props.value)
    if (text.trim()) return truncate(text.trim())
  }

  if (element.type === "link" && typeof props.title === "string" && props.title) {
    return truncate(props.title)
  }

  const aiConfig = props.aiConfig as Record<string, unknown> | undefined
  if (aiConfig && typeof aiConfig.prompt === "string" && aiConfig.prompt) {
    return truncate(aiConfig.prompt)
  }

  return element.type
}

/** Truncate a string to a maximum length. */
function truncate(text: string): string {
  const singleLine = text.replace(/\n/g, " ")
  if (singleLine.length <= MAX_LABEL_LENGTH) return singleLine
  return `${singleLine.slice(0, MAX_LABEL_LENGTH)}...`
}

/** Search node elements by query and optional type filter. */
function searchNodes(
  elements: CanvasElement[],
  query: string,
  typeFilter: NodeTypeFilter,
): SearchResult[] {
  const lowerQuery = query.toLowerCase()
  const results: SearchResult[] = []

  for (const el of elements) {
    if (el.kind !== "node") continue
    if (!SEARCHABLE_NODE_TYPES.has(el.type) && el.type !== "link") continue
    if (typeFilter !== "all" && el.type !== typeFilter) continue

    if (lowerQuery) {
      const searchText = getSearchableText(el).toLowerCase()
      if (!searchText.includes(lowerQuery)) continue
    }

    results.push({
      id: el.id,
      type: el.type,
      label: buildLabel(el),
      xywh: el.xywh,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type NodeSearchPanelProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine
  /** All canvas elements from the current snapshot. */
  elements: CanvasElement[]
  /** Callback to close the search panel. */
  onClose: () => void
}

/** Search panel for finding and navigating to canvas nodes. */
export function NodeSearchPanel({
  engine,
  elements,
  onClose,
}: NodeSearchPanelProps) {
  const { t } = useTranslation("board")
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<NodeTypeFilter>("all")
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-focus the input on mount.
  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => window.clearTimeout(timer)
  }, [])

  const results = useMemo(
    () => searchNodes(elements, query, typeFilter),
    [elements, query, typeFilter],
  )

  // Reset active index when results change.
  useEffect(() => {
    setActiveIndex(-1)
  }, [results.length, query, typeFilter])

  const focusOnResult = useCallback(
    (result: SearchResult) => {
      const [x, y, w, h] = result.xywh
      engine.selection.setSelection([result.id])
      engine.focusViewportToRect({ x, y, w, h }, { padding: 80 })
    },
    [engine],
  )

  // Keyboard navigation inside the panel.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActiveIndex((prev) => {
          const next = Math.min(prev + 1, results.length - 1)
          scrollToIndex(listRef.current, next)
          return next
        })
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex((prev) => {
          const next = Math.max(prev - 1, 0)
          scrollToIndex(listRef.current, next)
          return next
        })
        return
      }
      if (event.key === "Enter" && activeIndex >= 0 && activeIndex < results.length) {
        event.preventDefault()
        focusOnResult(results[activeIndex])
        return
      }
    },
    [activeIndex, results, focusOnResult, onClose],
  )

  return (
    <div
      className={cn(
        "pointer-events-auto absolute right-3 top-3 z-30",
        "flex w-80 flex-col rounded-3xl",
        "border border-border bg-background/95 shadow-none backdrop-blur-sm",
        "animate-in fade-in slide-in-from-top-2 duration-200",
      )}
      onKeyDown={handleKeyDown}
    >
      {/* Search input */}
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2.5">
        <Search size={16} className="shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("nodeSearch.placeholder")}
          className={cn(
            "flex-1 bg-transparent text-sm outline-none",
            "placeholder:text-muted-foreground/60",
          )}
        />
        <button
          type="button"
          onClick={onClose}
          className="rounded-3xl p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("nodeInspector.close")}
        >
          <X size={16} />
        </button>
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-1 border-b border-border/40 px-3 py-2">
        {TYPE_FILTER_OPTIONS.map((filterType) => (
          <button
            key={filterType}
            type="button"
            onClick={() => setTypeFilter(filterType)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150",
              typeFilter === filterType
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t(`nodeSearch.types.${filterType}`)}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          {t("nodeSearch.results", { count: results.length })}
        </span>
      </div>

      <div
        ref={listRef}
        className="max-h-64 overflow-y-auto px-1.5 pb-2"
      >
        {results.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            {t("nodeSearch.noResults")}
          </div>
        ) : (
          results.map((result, index) => (
            <button
              key={result.id}
              type="button"
              data-search-index={index}
              onClick={() => focusOnResult(result)}
              className={cn(
                "flex w-full items-center gap-2 rounded-3xl px-2.5 py-2 text-left transition-colors duration-100",
                index === activeIndex
                  ? "bg-foreground/10 text-foreground"
                  : "text-foreground/80 hover:bg-muted",
              )}
            >
              {getNodeTypeIcon(result.type)}
              <span className="min-w-0 flex-1 truncate text-sm">{result.label}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {result.type}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/** Scroll a result item into view within the list container. */
function scrollToIndex(container: HTMLDivElement | null, index: number) {
  if (!container) return
  const item = container.querySelector(`[data-search-index="${index}"]`)
  if (item) {
    item.scrollIntoView({ block: "nearest" })
  }
}
