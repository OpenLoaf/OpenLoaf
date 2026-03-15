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

import { Paintbrush, Check } from "lucide-react"
import {
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@openloaf/ui/context-menu"

/**
 * Preset color palette — matches PREVIEW_GRADIENTS in CanvasListPage.
 * Uses the same Tailwind gradient classes so the swatch visually matches the card.
 */
const COLOR_SWATCHES = [
  { gradient: "from-teal-200 to-cyan-100 dark:from-teal-800 dark:to-cyan-900", label: "Teal" },
  { gradient: "from-violet-200 to-fuchsia-100 dark:from-violet-800 dark:to-fuchsia-900", label: "Violet" },
  { gradient: "from-amber-200 to-orange-100 dark:from-amber-800 dark:to-orange-900", label: "Amber" },
  { gradient: "from-sky-200 to-blue-100 dark:from-sky-800 dark:to-blue-900", label: "Sky" },
  { gradient: "from-rose-200 to-pink-100 dark:from-rose-800 dark:to-pink-900", label: "Rose" },
  { gradient: "from-emerald-200 to-green-100 dark:from-emerald-800 dark:to-green-900", label: "Emerald" },
  { gradient: "from-indigo-200 to-purple-100 dark:from-indigo-800 dark:to-purple-900", label: "Indigo" },
  { gradient: "from-lime-200 to-yellow-100 dark:from-lime-800 dark:to-yellow-900", label: "Lime" },
]

interface ColorPickerSubMenuProps {
  /** Currently selected color index (null = no color). */
  currentIndex?: number | null
  /** Callback when a color is picked. Pass `null` to clear. */
  onSelect: (colorIndex: number | null) => void
  /** Menu item label. */
  label: string
}

export function ColorPickerSubMenu({
  currentIndex,
  onSelect,
  label,
}: ColorPickerSubMenuProps) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Paintbrush className="mr-2 h-4 w-4" />
        {label}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="p-2">
        <div className="grid grid-cols-4 gap-1.5">
          {COLOR_SWATCHES.map((swatch, index) => {
            const isActive = currentIndex === index
            return (
              <button
                key={swatch.label}
                type="button"
                title={swatch.label}
                className={`relative flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r ${swatch.gradient} transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(isActive ? null : index)
                }}
              >
                {isActive && (
                  <Check className="h-3.5 w-3.5 text-white drop-shadow-sm" />
                )}
              </button>
            )
          })}
        </div>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
