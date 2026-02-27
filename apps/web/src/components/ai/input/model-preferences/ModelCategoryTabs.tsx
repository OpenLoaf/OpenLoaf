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

import { Image, MessageSquare, Video } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModelCategoryTabsProps {
  value: string
  onValueChange: (value: string) => void
}

const tabs = [
  {
    id: 'chat',
    label: '对话',
    icon: MessageSquare,
    activeText: 'text-sky-700 dark:text-sky-200',
    inactiveText: 'text-muted-foreground',
    indicator: 'border-t-sky-500',
  },
  {
    id: 'image',
    label: '图像',
    icon: Image,
    activeText: 'text-violet-700 dark:text-violet-200',
    inactiveText: 'text-muted-foreground',
    indicator: 'border-t-violet-500',
  },
  {
    id: 'video',
    label: '视频',
    icon: Video,
    activeText: 'text-amber-700 dark:text-amber-200',
    inactiveText: 'text-muted-foreground',
    indicator: 'border-t-amber-500',
  },
] as const

export function ModelCategoryTabs({
  value,
  onValueChange,
}: ModelCategoryTabsProps) {
  return (
    <div className="flex items-stretch border-t border-border">
      {tabs.map((tab, index) => {
        const isActive = value === tab.id
        const Icon = tab.icon
        const isFirst = index === 0
        const isLast = index === tabs.length - 1
        return (
          <button
            key={tab.id}
            type="button"
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 border-t-2 py-2 text-xs font-medium transition-colors',
              isActive
                ? ['-mt-px bg-transparent', tab.indicator, tab.activeText]
                : [
                    '-mt-px border-t-transparent bg-muted/50',
                    tab.inactiveText,
                    'hover:bg-muted/70 hover:text-foreground',
                  ],
              isFirst && 'rounded-bl-xl',
              isLast && 'rounded-br-xl',
            )}
            onClick={() => onValueChange(tab.id)}
          >
            <Icon size={14} className="opacity-70" aria-hidden="true" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
