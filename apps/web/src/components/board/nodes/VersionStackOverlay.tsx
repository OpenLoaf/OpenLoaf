/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import i18next from 'i18next'
import type { VersionStack } from '../engine/types'
import { getVersionCount, getPrimaryEntry } from '../engine/version-stack'

export type VersionStackOverlayProps = {
  stack: VersionStack | undefined
  /** Semantic color for the badge: 'blue' | 'purple' | 'green' */
  semanticColor: 'blue' | 'purple' | 'green'
  onSwitchPrimary: (entryId: string) => void
}

const badgeColorMap = {
  blue: 'bg-blue-500 text-white',
  purple: 'bg-purple-500 text-white',
  green: 'bg-green-500 text-white',
} as const

/**
 * Reusable overlay that renders version stack indicators on top of any media node.
 * Shows a version count badge, stacked shadow layers, and a hover navigation bar.
 */
export function VersionStackOverlay({
  stack,
  semanticColor,
  onSwitchPrimary,
}: VersionStackOverlayProps) {
  const count = getVersionCount(stack)
  const primaryEntry = getPrimaryEntry(stack)

  const currentIndex = useMemo(() => {
    if (!stack || !primaryEntry) return 0
    const idx = stack.entries.findIndex((e) => e.id === primaryEntry.id)
    return idx >= 0 ? idx : 0
  }, [stack, primaryEntry])

  const handlePrev = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (!stack || currentIndex <= 0) return
      onSwitchPrimary(stack.entries[currentIndex - 1].id)
    },
    [stack, currentIndex, onSwitchPrimary],
  )

  const handleNext = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (!stack || currentIndex >= count - 1) return
      onSwitchPrimary(stack.entries[currentIndex + 1].id)
    },
    [stack, currentIndex, count, onSwitchPrimary],
  )

  if (count <= 1) return null

  return (
    <>
      {/* B. Shadow hint layers (behind the node) */}
      {count > 2 && (
        <div
          className="pointer-events-none absolute inset-0 z-[-1] rounded-lg border border-border bg-card opacity-20"
          style={{ transform: 'translate(6px, 6px)' }}
        />
      )}
      <div
        className="pointer-events-none absolute inset-0 z-[-1] rounded-lg border border-border bg-card opacity-40"
        style={{ transform: 'translate(3px, 3px)' }}
      />

      {/* A. Version badge (top-right corner) */}
      <div
        className={[
          'pointer-events-auto absolute -top-1.5 -right-1.5 z-20',
          'flex items-center justify-center rounded-full',
          'min-w-[20px] h-[20px] px-1 text-[10px] font-medium',
          badgeColorMap[semanticColor],
        ].join(' ')}
        title={i18next.t('board:versionStack.badge', { count })}
      >
        {count}
      </div>

      {/* C. Hover version navigator (bottom center) */}
      <div
        className={[
          'pointer-events-auto absolute -bottom-8 left-1/2 -translate-x-1/2 z-20',
          'flex items-center gap-1 rounded-full bg-card border border-border px-2 py-0.5 shadow-sm',
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
          <ChevronLeft size={12} />
        </button>
        <span className="text-[10px] font-mono select-none">
          {currentIndex + 1}/{count}
        </span>
        <button
          type="button"
          className="flex items-center justify-center disabled:opacity-30 transition-opacity"
          disabled={currentIndex >= count - 1}
          onPointerDown={handleNext}
        >
          <ChevronRight size={12} />
        </button>
      </div>
    </>
  )
}
