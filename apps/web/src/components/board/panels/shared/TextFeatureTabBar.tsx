/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { useTranslation } from 'react-i18next'
import { ScrollableTabBar } from '../../ui/ScrollableTabBar'
import type { TextFeatureDefinition } from '../text-features'

interface TextFeatureTabBarProps {
  features: TextFeatureDefinition[]
  selectedFeatureId: string
  onSelect: (featureId: string) => void
  disabled?: boolean
}

/** Feature tab bar for the Text AI Panel. Uses local feature definitions. */
export function TextFeatureTabBar({
  features,
  selectedFeatureId,
  onSelect,
  disabled = false,
}: TextFeatureTabBarProps) {
  const { t } = useTranslation('board')

  if (features.length <= 1) return null

  return (
    <ScrollableTabBar>
      {features.map((feat) => {
        const Icon = feat.icon
        return (
          <button
            key={feat.id}
            type="button"
            disabled={disabled}
            className={[
              'relative shrink-0 whitespace-nowrap rounded-3xl px-2.5 py-1 text-[11px] font-medium transition-colors duration-150',
              'flex items-center gap-1',
              disabled
                ? 'cursor-not-allowed text-muted-foreground/40'
                : selectedFeatureId === feat.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
            onClick={() => !disabled && onSelect(feat.id)}
          >
            <Icon size={14} />
            {t(feat.labelKey)}
          </button>
        )
      })}
    </ScrollableTabBar>
  )
}
