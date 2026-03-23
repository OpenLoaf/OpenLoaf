/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useState, useRef, useMemo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link2, Plus, X } from 'lucide-react'
import { saveBoardAssetFile } from '../../../utils/board-asset'
import { getBoardPreviewEndpoint } from '@/lib/image/uri'

export type MediaSlotProps = {
  /** Label shown below the slot. */
  label: string
  /** Icon shown when empty. */
  icon?: ReactNode
  /** Image/video URL to show as thumbnail. */
  src?: string
  /** Whether this slot is required. */
  required?: boolean
  /** Whether the slot accepts file upload on click. */
  uploadAccept?: string
  /** Called when user uploads a file (returns board-relative path or data URL as fallback). */
  onUpload?: (value: string) => void
  /** Called when the slot content is removed. */
  onRemove?: () => void
  /** Whether the slot is disabled. */
  disabled?: boolean
  /** Compact size (44px instead of 52px). */
  compact?: boolean
  /** Board id for preview resolution. */
  boardId?: string
  /** Project id for preview resolution. */
  projectId?: string
  /** Board folder URI for saving uploaded files to asset directory. */
  boardFolderUri?: string
  /** Whether this slot represents an associated (upstream) node reference. Shows dimmed style. */
  associated?: boolean
  /** Whether to show a pulse animation (hints user can assign). */
  pulse?: boolean
}

export function MediaSlot({
  label,
  icon,
  src,
  required,
  uploadAccept = 'image/*',
  onUpload,
  onRemove,
  disabled,
  compact,
  boardId,
  projectId,
  boardFolderUri,
  associated,
  pulse,
}: MediaSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const [imgFailed, setImgFailed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)

  // Reset failure state when src changes
  const prevSrcRef = useRef(src)
  if (prevSrcRef.current !== src) {
    prevSrcRef.current = src
    if (imgFailed) setImgFailed(false)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (boardFolderUri) {
      try {
        const relativePath = await saveBoardAssetFile({
          file,
          fallbackName: 'upload',
          projectId,
          boardFolderUri,
        })
        onUpload?.(relativePath)
        return
      } catch {
        // fallback to data URL below
      }
    }

    // Fallback: read as data URL
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onUpload?.(reader.result)
    }
    reader.readAsDataURL(file)
  }

  /** Resolve src to a displayable URL. Board-relative paths need server preview endpoint. */
  const displaySrc = useMemo(() => {
    if (!src) return undefined
    // data URL, http(s) URL, or blob URL — use directly
    if (/^(data:|https?:|blob:)/i.test(src)) return src
    // Board-relative path — resolve via board preview endpoint
    if (boardId) return getBoardPreviewEndpoint(src, { boardId, projectId })
    return src
  }, [src, boardId, projectId])

  const isNonImageSlot = uploadAccept !== 'image/*'
  const hasSrc = isNonImageSlot ? Boolean(src) : (displaySrc && !imgFailed)
  const size = compact ? 'h-[44px] w-[44px]' : 'h-[52px] w-[52px]'

  // Associated slots without content should not render (upstream refs always have content)
  if (associated && !hasSrc) return null

  return (
    <div
      ref={slotRef}
      className="group/slot flex flex-col items-center gap-1"
      onPointerEnter={() => {
        setHovered(true)
        if (slotRef.current) setRect(slotRef.current.getBoundingClientRect())
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <div
        className={[
          'relative shrink-0',
          size,
        ].join(' ')}
      >
        <button
          type="button"
          disabled={disabled || (!onUpload && !hasSrc)}
          className={[
            'h-full w-full overflow-hidden rounded-xl transition-colors duration-150',
            hasSrc
              ? associated
                ? 'border border-dashed border-muted-foreground/30 bg-ol-surface-muted opacity-50 hover:opacity-100 cursor-pointer'
                : 'border border-border bg-ol-surface-muted'
              : 'border border-dashed border-border bg-ol-surface-muted/50 hover:bg-ol-surface-muted',
            disabled ? 'cursor-not-allowed opacity-60' : '',
            pulse && !hasSrc ? 'animate-pulse' : '',
          ].join(' ')}
          onClick={() => !disabled && !hasSrc && inputRef.current?.click()}
        >
          {hasSrc ? (
            isNonImageSlot ? (
              <div className="flex h-full w-full items-center justify-center text-foreground/70">
                {icon ?? <Plus size={16} />}
              </div>
            ) : (
              <img
                src={displaySrc}
                alt={label}
                className="h-full w-full object-cover"
                draggable={false}
                onError={() => setImgFailed(true)}
              />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
              {icon ?? <Plus size={16} />}
            </div>
          )}
        </button>
        {/* Remove button on hover — outside overflow-hidden so it's not clipped */}
        {hasSrc && onRemove && !disabled ? (
          <div
            role="button"
            tabIndex={0}
            className="absolute -right-1 -top-1 z-10 hidden h-4 w-4 items-center justify-center rounded-full bg-foreground/80 text-background group-hover/slot:flex"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                onRemove()
              }
            }}
          >
            <X size={8} />
          </div>
        ) : null}
      </div>
      {(label || required) ? (
        <span
          className={[
            'text-center leading-tight',
            compact ? 'text-[9px]' : 'text-[10px]',
            'text-muted-foreground/60',
          ].join(' ')}
        >
          {label}
          {required ? <span className="text-amber-500"> *</span> : null}
        </span>
      ) : null}
      {onUpload ? (
        <input
          ref={inputRef}
          type="file"
          accept={uploadAccept}
          className="hidden"
          onChange={handleFileChange}
        />
      ) : null}
      {/* Hover preview portaled to body to escape stacking context */}
      {hasSrc && hovered && rect && createPortal(
        <div
          className="pointer-events-none fixed z-[9999]"
          style={{
            left: rect.left + rect.width / 2,
            top: rect.top - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <img
            src={displaySrc}
            alt={label}
            className="max-h-40 max-w-48 rounded-lg border border-border object-contain shadow-lg"
            draggable={false}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}

/** Compact badge showing upstream text content. */
export function UpstreamTextBadge({ text }: { text: string }) {
  const maxLen = 20
  const truncated = text.length > maxLen ? `${text.slice(0, maxLen)}...` : text
  return (
    <div className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
      <Link2 size={11} className="shrink-0 text-blue-500" />
      <span className="min-w-0 truncate">
        文本:{truncated}
      </span>
      <span className="shrink-0 text-muted-foreground/50">({text.length}字)</span>
    </div>
  )
}
