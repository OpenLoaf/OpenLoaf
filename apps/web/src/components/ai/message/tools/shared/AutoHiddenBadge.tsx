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

import { EyeOffIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'

/**
 * 小图标徽标：提示该工具卡片默认会被自动隐藏。
 * 仅在开启「显示所有工具调用结果」的调试视图下才会渲染出它所属的工具，
 * 正常视图里用户看不到这个徽标（因为整张卡已经被 shouldShowToolPart 过滤）。
 */
export function AutoHiddenBadge({ className }: { className?: string }) {
  const { t } = useTranslation('ai')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/50',
            className,
          )}
          aria-label={t('tool.autoHiddenHint')}
        >
          <EyeOffIcon className="size-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {t('tool.autoHiddenHint')}
      </TooltipContent>
    </Tooltip>
  )
}
