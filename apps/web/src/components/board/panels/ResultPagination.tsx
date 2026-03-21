/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export type ResultPaginationProps = {
  /** All generated result variants. */
  results: Array<{ previewSrc: string; originalSrc: string }>
  /** Currently displayed result index (0-based). */
  currentIndex: number
  /** Called when the user selects a different result. */
  onSelect: (index: number) => void
}

/** Pagination strip for multi-result AI image generation. */
export function ResultPagination({
  results,
  currentIndex,
  onSelect,
}: ResultPaginationProps) {
  const { t } = useTranslation('board')
  const total = results.length

  const handlePrev = useCallback(() => {
    onSelect(currentIndex <= 0 ? total - 1 : currentIndex - 1)
  }, [currentIndex, total, onSelect])

  const handleNext = useCallback(() => {
    onSelect(currentIndex >= total - 1 ? 0 : currentIndex + 1)
  }, [currentIndex, total, onSelect])

  if (total <= 1) return null

  return (
    <div className="flex flex-col gap-2">
      {/* ── Thumbnail strip ── */}
      <div className="flex gap-1.5 overflow-x-auto py-0.5">
        {results.map((result, index) => (
          <button
            key={index}
            type="button"
            className={[
              'shrink-0 h-12 w-12 overflow-hidden rounded-3xl border-2 transition-colors duration-150',
              index === currentIndex
                ? 'border-ol-blue shadow-sm'
                : 'border-transparent hover:border-ol-blue/30',
            ].join(' ')}
            onClick={() => onSelect(index)}
          >
            <img
              src={result.previewSrc}
              alt={`Result ${index + 1}`}
              className="h-full w-full object-cover"
              draggable={false}
            />
          </button>
        ))}
      </div>

      {/* ── Navigation controls ── */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full p-1 text-ol-text-secondary transition-colors duration-150 hover:bg-ol-surface-muted hover:text-ol-text-primary"
          onClick={handlePrev}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-[3rem] text-center text-xs font-medium text-ol-text-secondary">
          {t('imagePanel.resultPagination.pageOf', {
            current: currentIndex + 1,
            total,
          })}
        </span>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full p-1 text-ol-text-secondary transition-colors duration-150 hover:bg-ol-surface-muted hover:text-ol-text-primary"
          onClick={handleNext}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
