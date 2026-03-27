'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@udecode/cn'

/**
 * Horizontally-scrollable tab bar with left/right fade indicators.
 * When content overflows, gradient masks appear on edges to hint
 * that more tabs exist in that direction.
 */
export function ScrollableTabBar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateOverflow = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateOverflow()
    const ro = new ResizeObserver(updateOverflow)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateOverflow])

  // Also recalc when children change (feature list may update)
  useEffect(() => {
    updateOverflow()
  }, [children, updateOverflow])

  return (
    <div className="relative">
      {/* Left fade */}
      <div
        className={cn(
          'pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-6 rounded-l-3xl',
          'bg-gradient-to-r from-ol-surface-muted to-transparent',
          'transition-opacity duration-150',
          canScrollLeft ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Scrollable container */}
      <div
        ref={scrollRef}
        className={cn(
          'no-scrollbar flex gap-0.5 overflow-x-auto rounded-3xl bg-ol-surface-muted p-0.5',
          className,
        )}
        onWheel={(e) => {
          e.stopPropagation()
          scrollRef.current!.scrollLeft += e.deltaY
        }}
        onScroll={updateOverflow}
      >
        {children}
      </div>

      {/* Right fade */}
      <div
        className={cn(
          'pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-6 rounded-r-3xl',
          'bg-gradient-to-l from-ol-surface-muted to-transparent',
          'transition-opacity duration-150',
          canScrollRight ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}
