'use client'

import type { DesktopWidgetConstraints } from './types'

export interface WidgetVariantConfig {
  /** Variant identifier. */
  key: string
  /** Display label for context menu. */
  label: string
  /** Layout constraints for this variant. */
  constraints: DesktopWidgetConstraints
}

/**
 * Centralized variant configuration registry.
 * To add variants for a new widget, simply add an entry here.
 */
export const widgetVariantMap: Record<string, WidgetVariantConfig[]> = {
  clock: [
    { key: 'hm', label: '时:分', constraints: { defaultW: 2, defaultH: 2, minW: 2, minH: 2, maxW: 3, maxH: 3 } },
    { key: 'hms', label: '时:分:秒', constraints: { defaultW: 3, defaultH: 2, minW: 2, minH: 2, maxW: 4, maxH: 3 } },
  ],
  'flip-clock': [
    { key: 'hm', label: '时:分', constraints: { defaultW: 3, defaultH: 2, minW: 2, minH: 2, maxW: 5, maxH: 3 } },
    { key: 'hms', label: '时:分:秒', constraints: { defaultW: 4, defaultH: 2, minW: 2, minH: 2, maxW: 6, maxH: 3 } },
  ],
  calendar: [
    { key: 'month', label: '月视图', constraints: { defaultW: 5, defaultH: 6, minW: 4, minH: 3, maxW: 8, maxH: 6 } },
    { key: 'week', label: '周视图', constraints: { defaultW: 6, defaultH: 4, minW: 4, minH: 3, maxW: 8, maxH: 5 } },
    { key: 'day', label: '日视图', constraints: { defaultW: 3, defaultH: 6, minW: 2, minH: 4, maxW: 5, maxH: 8 } },
    { key: 'full', label: '完整视图', constraints: { defaultW: 8, defaultH: 6, minW: 5, minH: 4, maxW: 12, maxH: 10 } },
  ],
}

/** Get all variant configs for a widget key. */
export function getWidgetVariants(widgetKey: string): WidgetVariantConfig[] | undefined {
  return widgetVariantMap[widgetKey]
}

/** Get a specific variant config. */
export function getWidgetVariantConfig(widgetKey: string, variantKey: string): WidgetVariantConfig | undefined {
  return widgetVariantMap[widgetKey]?.find((v) => v.key === variantKey)
}

/** Get the default (first) variant key for a widget. */
export function getDefaultVariant(widgetKey: string): string | undefined {
  return widgetVariantMap[widgetKey]?.[0]?.key
}
