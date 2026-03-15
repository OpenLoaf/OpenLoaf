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

/** Preset color palette — matches PREVIEW_GRADIENTS in CanvasListPage. */
const COLOR_SWATCHES = [
  { light: "#5eead4", dark: "#0d9488", label: "Teal" },
  { light: "#c4b5fd", dark: "#7c3aed", label: "Violet" },
  { light: "#fcd34d", dark: "#d97706", label: "Amber" },
  { light: "#7dd3fc", dark: "#0284c7", label: "Sky" },
  { light: "#fda4af", dark: "#e11d48", label: "Rose" },
  { light: "#6ee7b7", dark: "#059669", label: "Emerald" },
  { light: "#a5b4fc", dark: "#4f46e5", label: "Indigo" },
  { light: "#bef264", dark: "#65a30d", label: "Lime" },
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
                className="relative flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ backgroundColor: swatch.light }}
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
