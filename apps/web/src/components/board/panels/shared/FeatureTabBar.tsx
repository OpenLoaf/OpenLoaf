/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { MEDIA_FEATURES, type MediaFeatureId } from '@openloaf-saas/sdk'
import type { V3Feature } from '@/lib/saas-media'
import { ScrollableTabBar } from '../../ui/ScrollableTabBar'

interface FeatureTabBarProps {
  features: V3Feature[]
  selectedFeatureId: string
  onSelect: (featureId: string) => void
  isVariantApplicable: (variantId: string) => boolean
  prefLang: 'zh' | 'en'
  disabled?: boolean
  /** Optional icon map for audio features etc. */
  iconMap?: Record<string, React.ComponentType<{ size?: number; className?: string }>>
  /** Optional badge renderer per feature (e.g. coming-soon) */
  renderBadge?: (feat: V3Feature) => React.ReactNode
  /** When true, show features with no applicable variants (for coming-soon tabs) */
  showEmpty?: boolean
}

/** Shared feature tab bar for all AI panels. */
export function FeatureTabBar({
  features,
  selectedFeatureId,
  onSelect,
  isVariantApplicable,
  prefLang,
  disabled = false,
  iconMap,
  renderBadge,
  showEmpty = false,
}: FeatureTabBarProps) {
  if (!features.length) return null

  const visibleFeatures = features.filter((feat) => {
    if (disabled) return feat.id === selectedFeatureId
    if (showEmpty && feat.variants.length === 0) return true
    return feat.variants.some((v) => isVariantApplicable(v.id))
  })

  if (!visibleFeatures.length) return null

  return (
    <ScrollableTabBar>
      {visibleFeatures.map((feat) => {
        const Icon = iconMap?.[feat.id]
        const label =
          feat.displayName ||
          MEDIA_FEATURES[feat.id as MediaFeatureId]?.label[prefLang] ||
          feat.id
        return (
          <button
            key={feat.id}
            type="button"
            disabled={disabled}
            className={[
              'relative shrink-0 whitespace-nowrap rounded-3xl px-3 py-1.5 text-xs font-medium transition-colors duration-150',
              'flex items-center gap-1',
              disabled
                ? 'cursor-not-allowed text-muted-foreground/40'
                : selectedFeatureId === feat.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
            onClick={() => !disabled && onSelect(feat.id)}
          >
            {Icon ? <Icon size={14} /> : null}
            {label}
            {renderBadge?.(feat)}
          </button>
        )
      })}
    </ScrollableTabBar>
  )
}
