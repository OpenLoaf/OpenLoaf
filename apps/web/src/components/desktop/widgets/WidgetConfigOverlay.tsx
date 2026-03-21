/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client"

import { Settings } from "lucide-react"
import { useTranslation } from "react-i18next"

export interface WidgetConfigOverlayProps {
  /** Callback when the settings button is clicked. */
  onConfigure: () => void
  /** Optional label for the button. */
  label?: string
}

/** Frosted-glass overlay with a centered settings button for unconfigured widgets. */
export default function WidgetConfigOverlay({
  onConfigure,
  label,
}: WidgetConfigOverlayProps) {
  const { t } = useTranslation('desktop');
  const displayLabel = label ?? t('overlay.defaultLabel');
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl">
      <div className="absolute inset-0 rounded-3xl ol-glass-float" />
      <button
        type="button"
        className="relative z-10 flex items-center gap-2 rounded-3xl ol-glass-toolbar px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        onClick={(e) => {
          e.stopPropagation()
          onConfigure()
        }}
      >
        <Settings className="size-4" />
        {displayLabel}
      </button>
    </div>
  )
}
