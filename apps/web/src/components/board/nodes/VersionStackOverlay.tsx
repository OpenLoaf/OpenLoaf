/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import i18next from 'i18next'
import type { CanvasEngine } from '../engine/CanvasEngine'
import type { VersionStack } from '../engine/types'
import { getVersionCount, getPrimaryEntry } from '../engine/version-stack'

export type VersionStackOverlayProps = {
  stack: VersionStack | undefined
  /** Semantic color for the badge: 'blue' | 'purple' | 'green' */
  semanticColor: 'blue' | 'purple' | 'green'
  /** Optional callback for bottom hover navigation. Omit to hide bottom nav (use toolbar instead). */
  onSwitchPrimary?: (entryId: string) => void
  /** Resolved thumbnail URLs for animated card stacking effect. */
  thumbnails?: Array<{ id: string; src: string }>
  /** Canvas engine instance — used to keep badge size constant across zoom levels. */
  engine: CanvasEngine
  /** Whether the parent node is selected — badge shows index/total when selected, total only otherwise. */
  selected?: boolean
  /** Use smaller badge for compact nodes (e.g. audio). */
  compact?: boolean
}

const badgeColorMap = {
  blue: 'bg-blue-500 text-white',
  purple: 'bg-purple-500 text-white',
  green: 'bg-green-500 text-white',
} as const

/** Max number of animated background cards to render. */
const MAX_BG_CARDS = 2

/**
 * Scale factor for all cards (primary + background).
 * Both primary and bg cards are scaled to this value; bg cards add rotation.
 * At 0.84 scale + ≤10° rotation the bounding box stays within ~97% for 1:1 images.
 */
export const STACK_CARD_SCALE = 0.84

/**
 * Reusable overlay that renders version stack indicators on top of any media node.
 * When thumbnails are provided, renders background photo-cards with rotation behind the primary.
 * The parent is expected to scale the primary content to STACK_CARD_SCALE.
 */
export const VersionStackOverlay = memo(function VersionStackOverlay({
  stack,
  semanticColor,
  onSwitchPrimary,
  thumbnails,
  engine,
  selected,
  compact,
}: VersionStackOverlayProps) {
  const count = getVersionCount(stack)
  const primaryEntry = getPrimaryEntry(stack)
  const badgeRef = useRef<HTMLDivElement>(null)

  const currentIndex = useMemo(() => {
    if (!stack || !primaryEntry) return 0
    const idx = stack.entries.findIndex((e) => e.id === primaryEntry.id)
    return idx >= 0 ? idx : 0
  }, [stack, primaryEntry])

  // 逻辑：通过 subscribeView 直接操作 DOM，让 badge 在画布缩放时保持恒定屏幕大小。
  // MAX_SCALE 防止缩小画布时 badge 相对节点过大；MIN_NODE_OFFSET 防止放大时和圆角重叠。
  const MAX_SCALE = compact ? 1.5 : 2
  const BADGE_OFFSET_PX = compact ? 4 : 5
  const MIN_NODE_OFFSET = compact ? 3 : 4
  useEffect(() => {
    if (count <= 1) return
    const syncBadgeScale = () => {
      const badge = badgeRef.current
      if (!badge) return
      const zoom = engine.viewport.getState().zoom
      const scale = Math.min(1 / zoom, MAX_SCALE)
      const offset = Math.max(BADGE_OFFSET_PX * scale, MIN_NODE_OFFSET)
      badge.style.transform = `scale(${scale})`
      badge.style.top = `${offset}px`
      badge.style.right = `${offset}px`
    }
    syncBadgeScale()
    const unsub = engine.subscribeView(syncBadgeScale)
    return unsub
  }, [engine, count])

  // 逻辑：背景卡片按渲染顺序（离 primary 的距离）确定性地递增角度，统一向左倾斜。
  // 不依赖 random，切换 primary 时卡片位置稳定不跳动。

  const handlePrev = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (!stack || currentIndex <= 0 || !onSwitchPrimary) return
      onSwitchPrimary(stack.entries[currentIndex - 1].id)
    },
    [stack, currentIndex, onSwitchPrimary],
  )

  const handleNext = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (!stack || currentIndex >= count - 1 || !onSwitchPrimary) return
      onSwitchPrimary(stack.entries[currentIndex + 1].id)
    },
    [stack, currentIndex, count, onSwitchPrimary],
  )

  if (count <= 1) return null

  const hasAnimatedCards = thumbnails && thumbnails.length > 1
  const bgThumbnails = hasAnimatedCards
    ? thumbnails.filter((t) => t.id !== primaryEntry?.id).slice(0, MAX_BG_CARDS)
    : []

  return (
    <>
      {/* Background photo-cards — scaled + rotated, peek out behind the primary */}
      {hasAnimatedCards && bgThumbnails.length > 0 ? (
        <AnimatePresence>
          {bgThumbnails.map((thumb, i) => {
            // 确定性角度：第 1 张 -6°，第 2 张 -10°，无随机，切换时不跳动
            const rot = -(6 + i * 4)
            return (
              <motion.div
                key={thumb.id}
                initial={{ opacity: 0, scale: 0.76 }}
                animate={{ opacity: 1, scale: STACK_CARD_SCALE, rotate: rot }}
                exit={{ opacity: 0, scale: 0.76 }}
                transition={{ duration: 0.35, ease: 'easeInOut' }}
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl shadow-sm"
                style={{ zIndex: -1 - i, transformOrigin: 'center' }}
              >
                <img
                  src={thumb.src}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </motion.div>
            )
          })}
        </AnimatePresence>
      ) : (
        // 逻辑：没有缩略图时回退为静态阴影层（用于 Video/Audio 节点）。
        <>
          {count > 2 && (
            <div
              className="pointer-events-none absolute inset-0 z-[-1] rounded-3xl border border-border bg-card opacity-20"
              style={{ transform: 'translate(6px, 6px)' }}
            />
          )}
          <div
            className="pointer-events-none absolute inset-0 z-[-1] rounded-3xl border border-border bg-card opacity-40"
            style={{ transform: 'translate(3px, 3px)' }}
          />
        </>
      )}

      {/* Version badge (top-right corner) — shows current/total, zoom-independent size */}
      <div
        ref={badgeRef}
        className={[
          'pointer-events-auto absolute z-20',
          'flex items-center justify-center rounded-full font-semibold shadow-sm',
          'transition-opacity duration-150',
          compact
            ? 'min-w-[14px] h-[14px] px-0.5 text-[8px]'
            : 'min-w-[18px] h-[18px] px-1 text-[9px]',
          badgeColorMap[semanticColor],
          // 逻辑：未选中时 badge 半透明，降低对画布整体视觉的干扰。
          selected ? 'opacity-100' : 'opacity-50',
        ].join(' ')}
        style={{ transformOrigin: 'top right' }}
        title={i18next.t('board:versionStack.badge', { count })}
      >
        {selected ? `${currentIndex + 1}/${count}` : count}
      </div>

      {/* Hover version navigator (bottom center) — only shown when onSwitchPrimary is provided */}
      {onSwitchPrimary ? (
        <div
          className={[
            'pointer-events-auto absolute -bottom-8 left-1/2 -translate-x-1/2 z-20',
            'flex items-center gap-1.5 rounded-full bg-card border border-border px-2.5 py-1 shadow-sm',
            'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          ].join(' ')}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex items-center justify-center disabled:opacity-30 transition-opacity"
            disabled={currentIndex <= 0}
            onPointerDown={handlePrev}
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-[11px] font-mono select-none">
            {currentIndex + 1}/{count}
          </span>
          <button
            type="button"
            className="flex items-center justify-center disabled:opacity-30 transition-opacity"
            disabled={currentIndex >= count - 1}
            onPointerDown={handleNext}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      ) : null}
    </>
  )
})
