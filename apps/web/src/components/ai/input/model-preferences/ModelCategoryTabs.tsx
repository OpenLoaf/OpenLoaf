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

import { Image, MessageSquare, Terminal, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface ModelCategoryTabsProps {
  value: string
  onValueChange: (value: string) => void
}

const TAB_CONFIGS = [
  {
    id: 'chat',
    labelKey: 'mode.chat' as const,
    icon: MessageSquare,
    activeText: 'text-foreground',
    inactiveText: 'text-muted-foreground',
    indicator: 'border-t-foreground',
  },
  // image/video tabs 暂时关闭（v1 models 接口已废弃，待迁移到 v3 capabilities）
  // {
  //   id: 'image',
  //   labelKey: 'mode.image' as const,
  //   icon: Image,
  // },
  // {
  //   id: 'video',
  //   labelKey: 'mode.video' as const,
  //   icon: Video,
  // },
  {
    id: 'cli',
    label: 'CLI',
    icon: Terminal,
    activeText: 'text-foreground',
    inactiveText: 'text-muted-foreground',
    indicator: 'border-t-foreground',
  },
] as const

export function ModelCategoryTabs({
  value,
  onValueChange,
}: ModelCategoryTabsProps) {
  const { t } = useTranslation('ai')
  return (
    <div className="flex items-stretch border-t border-border">
      {TAB_CONFIGS.map((tab, index) => {
        const isActive = value === tab.id
        const Icon = tab.icon
        const isFirst = index === 0
        const isLast = index === TAB_CONFIGS.length - 1
        const label = 'labelKey' in tab ? t(tab.labelKey) : tab.label
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
              isFirst && 'rounded-bl-sm',
              isLast && 'rounded-br-sm',
            )}
            onClick={() => onValueChange(tab.id)}
          >
            <Icon size={14} className="opacity-70" aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
