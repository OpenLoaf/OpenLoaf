'use client'

import { useMemo } from 'react'
import LobeModelIcon from '@lobehub/icons/es/features/ModelIcon'
import ProviderIcon from '@lobehub/icons/es/features/ProviderIcon'
import { modelMappings } from '@lobehub/icons/es/features/modelConfig'

type ModelIconProps = {
  /** Provider or family id for fallback icon. */
  icon?: string | null
  /** Model id for model-level icon matching. */
  model?: string | null
  /** Icon size in pixels. */
  size?: number
  /** Additional class name. */
  className?: string
  /** @deprecated No longer used, kept for call-site compat. */
  fallbackSrc?: string
  /** @deprecated No longer used, kept for call-site compat. */
  fallbackAlt?: string
}

/** Check whether model id matches modelMappings (regex). */
function hasModelIcon(modelId: string): boolean {
  const id = modelId.toLowerCase()
  return modelMappings.some((m) =>
    m.keywords.some((kw) => new RegExp(kw, 'i').test(id)),
  )
}

/**
 * Render model icon with fallback chain:
 * 1. model id → modelMappings regex → LobeModelIcon
 * 2. icon (familyId/providerId) → ProviderIcon
 * 3. fallback → ProviderIcon default icon
 */
export function ModelIcon({
  icon,
  model,
  size = 16,
  className,
}: ModelIconProps) {
  const matchModel = useMemo(
    () => (model ? hasModelIcon(model) : false),
    [model],
  )

  // 1. model id 命中 modelMappings
  if (matchModel && model) {
    return (
      <LobeModelIcon
        model={model}
        size={size}
        type="color"
        className={className}
      />
    )
  }

  // 2 & 3. provider icon 或默认图标。
  return (
    <ProviderIcon
      provider={icon ?? undefined}
      size={size}
      type="color"
      className={className}
    />
  )
}
