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

import { Cloud, HardDrive, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface ModelPreferencesHeaderProps {
  isCloudSource: boolean
  showCloudSwitch?: boolean
  showManageButton?: boolean
  onCloudSourceChange: (cloud: boolean) => void
  onManageModels?: () => void
}

export function ModelPreferencesHeader({
  isCloudSource,
  showCloudSwitch = true,
  showManageButton,
  onCloudSourceChange,
  onManageModels,
}: ModelPreferencesHeaderProps) {
  const { t } = useTranslation('ai')
  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-foreground">
          {t('mode.preferences')}
        </span>
        {showManageButton && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-3xl px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onManageModels}
          >
            <Settings2 className="h-3 w-3" />
            {t('mode.manage')}
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        {showCloudSwitch && (
          <div
            className="relative inline-flex h-6 cursor-pointer items-center rounded-3xl border border-border/60 bg-muted/60 p-0.5"
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
                'absolute top-0.5 h-5 w-[calc(50%-2px)] rounded-3xl transition-all duration-200',
                isCloudSource
                  ? 'left-[calc(50%+1px)] bg-foreground/10'
                  : 'left-0.5 bg-foreground/10',
              )}
            />
            <span
              className={cn(
                'relative z-10 inline-flex h-5 items-center justify-center gap-0.5 px-1.5 transition-colors text-[11px]',
                !isCloudSource
                  ? 'text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              <HardDrive className="h-3 w-3" />
              {t('mode.local')}
            </span>
            <span
              className={cn(
                'relative z-10 inline-flex h-5 items-center justify-center gap-0.5 px-1.5 transition-colors text-[11px]',
                isCloudSource
                  ? 'text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              <Cloud className="h-3 w-3" />
              {t('mode.cloud')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
