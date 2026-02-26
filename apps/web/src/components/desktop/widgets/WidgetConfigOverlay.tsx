/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client"

import { Settings } from "lucide-react"

export interface WidgetConfigOverlayProps {
  /** Callback when the settings button is clicked. */
  onConfigure: () => void
  /** Optional label for the button. */
  label?: string
}

/** Frosted-glass overlay with a centered settings button for unconfigured widgets. */
export default function WidgetConfigOverlay({
  onConfigure,
  label = "设置",
}: WidgetConfigOverlayProps) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl">
      <div className="absolute inset-0 rounded-2xl bg-background/50 backdrop-blur-sm" />
      <button
        type="button"
        className="relative z-10 flex items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-4 py-2 text-sm font-medium text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-accent"
        onClick={(e) => {
          e.stopPropagation()
          onConfigure()
        }}
      >
        <Settings className="size-4" />
        {label}
      </button>
    </div>
  )
}
