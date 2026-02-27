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

import { Cloud, HardDrive, Settings2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModelPreferencesHeaderProps {
  isCloudSource: boolean
  isAuto: boolean
  showCloudSwitch?: boolean
  showManageButton?: boolean
  disableAuto?: boolean
  onCloudSourceChange: (cloud: boolean) => void
  onAutoChange: (auto: boolean) => void
  onManageModels?: () => void
}

export function ModelPreferencesHeader({
  isCloudSource,
  isAuto,
  showCloudSwitch = true,
  showManageButton,
  disableAuto,
  onCloudSourceChange,
  onAutoChange,
  onManageModels,
}: ModelPreferencesHeaderProps) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-foreground">
          偏好设置
        </span>
        {showManageButton && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onManageModels}
          >
            <Settings2 className="h-3 w-3" />
            管理
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        {showCloudSwitch && (
          <div
            className="relative inline-flex h-6 cursor-pointer items-center rounded-full border border-border/60 bg-muted/60 p-0.5"
            onClick={() => onCloudSourceChange(!isCloudSource)}
            role="switch"
            aria-checked={isCloudSource}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onCloudSourceChange(!isCloudSource)
              }
            }}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-[calc(50%-2px)] rounded-full transition-all duration-200',
                isCloudSource
                  ? 'left-[calc(50%+1px)] bg-sky-500/15 dark:bg-sky-500/20'
                  : 'left-0.5 bg-amber-500/15 dark:bg-amber-500/20',
              )}
            />
            <span
              className={cn(
                'relative z-10 inline-flex h-5 items-center justify-center gap-0.5 px-1.5 transition-colors text-[11px]',
                !isCloudSource
                  ? 'text-amber-600 dark:text-amber-300'
                  : 'text-muted-foreground',
              )}
            >
              <HardDrive className="h-3 w-3" />
              本地
            </span>
            <span
              className={cn(
                'relative z-10 inline-flex h-5 items-center justify-center gap-0.5 px-1.5 transition-colors text-[11px]',
                isCloudSource
                  ? 'text-sky-600 dark:text-sky-300'
                  : 'text-muted-foreground',
              )}
            >
              <Cloud className="h-3 w-3" />
              云端
            </span>
          </div>
        )}
        <button
          type="button"
          disabled={disableAuto}
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] transition-colors',
            disableAuto && 'cursor-not-allowed opacity-40',
            isAuto
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
              : 'bg-muted/60 text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onAutoChange(true)}
        >
          <Sparkles className="h-3 w-3" />
          自动
        </button>
      </div>
    </div>
  )
}
