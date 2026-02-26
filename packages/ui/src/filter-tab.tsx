/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface FilterTabProps {
  text: string
  selected: boolean
  onSelect: (text: string) => void
  icon?: React.ReactNode
  count?: number
  layoutId?: string
}

export function FilterTab({
  text,
  selected,
  onSelect,
  icon,
  count,
  layoutId = 'filter-tab',
}: FilterTabProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(text)}
      className={cn(
        'relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium',
        'transition-colors',
        selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon ? <span className="relative z-10">{icon}</span> : null}
      <span className="relative z-10">{text}</span>
      {count !== undefined ? (
        <span className={cn(
          'relative z-10 text-[10px] tabular-nums',
          selected ? 'text-muted-foreground' : 'text-muted-foreground/60',
        )}>
          {count}
        </span>
      ) : null}
      {selected ? (
        <motion.span
          layoutId={layoutId}
          transition={{ type: 'spring', duration: 0.4 }}
          className="absolute inset-0 z-0 rounded-full bg-background shadow-sm"
        />
      ) : null}
    </button>
  )
}
