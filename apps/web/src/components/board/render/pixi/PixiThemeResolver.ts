/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/** Resolved theme palette for PixiJS rendering. */
export type CanvasThemePalette = {
  /** Node background color. */
  nodeBg: number
  /** Node border color. */
  nodeBorder: number
  /** Node text color. */
  nodeText: number
  /** Connector stroke color. */
  connector: number
  /** Selection box fill color. */
  selectionFill: number
  /** Selection box border color. */
  selectionBorder: number
  /** Alignment guide color. */
  alignmentGuide: number
  /** Anchor dot color. */
  anchor: number
  /** Background color for the canvas. */
  canvasBg: number
  /** Group outline color. */
  groupOutline: number
}

/** CSS variable name → palette key mapping. */
const CSS_VAR_MAP: Record<keyof CanvasThemePalette, string> = {
  nodeBg: "--canvas-node-bg",
  nodeBorder: "--canvas-node-border",
  nodeText: "--canvas-node-text",
  connector: "--canvas-connector",
  selectionFill: "--canvas-selection-fill",
  selectionBorder: "--canvas-selection-border",
  alignmentGuide: "--canvas-alignment-guide",
  anchor: "--canvas-anchor",
  canvasBg: "--canvas-bg",
  groupOutline: "--canvas-group-outline",
}

/** Fallback palette (dark mode defaults). */
const FALLBACK_PALETTE: CanvasThemePalette = {
  nodeBg: 0x1e1e1e,
  nodeBorder: 0x3a3a3a,
  nodeText: 0xffffff,
  connector: 0x888888,
  selectionFill: 0xffffff,
  selectionBorder: 0xffffff,
  alignmentGuide: 0xf59e0b,
  anchor: 0x3b82f6,
  canvasBg: 0x0a0a0a,
  groupOutline: 0x555555,
}

/** Parse a CSS color string to a numeric hex value. */
function cssColorToHex(cssColor: string): number | null {
  if (!cssColor || cssColor === "none" || cssColor === "transparent") return null
  const trimmed = cssColor.trim()

  // #rrggbb or #rgb
  if (trimmed.startsWith("#")) {
    let hex = trimmed.slice(1)
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
    }
    if (hex.length >= 6) {
      return Number.parseInt(hex.slice(0, 6), 16)
    }
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = trimmed.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
  )
  if (rgbMatch) {
    const r = Number.parseInt(rgbMatch[1], 10)
    const g = Number.parseInt(rgbMatch[2], 10)
    const b = Number.parseInt(rgbMatch[3], 10)
    return (r << 16) | (g << 8) | b
  }

  return null
}

/**
 * Resolves CSS variables to numeric hex values for PixiJS rendering.
 * Watches for theme changes (dark/light mode toggle) via MutationObserver.
 */
export class PixiThemeResolver {
  private palette: CanvasThemePalette
  private observer: MutationObserver | null = null
  private element: HTMLElement

  constructor(element: HTMLElement) {
    this.element = element
    this.palette = { ...FALLBACK_PALETTE }
    this.resolve()
    this.observe()
  }

  /** Get the current resolved palette. */
  getPalette(): CanvasThemePalette {
    return this.palette
  }

  /** Re-resolve CSS variables from DOM. */
  resolve(): void {
    const computed = getComputedStyle(document.documentElement)
    const next = { ...FALLBACK_PALETTE }

    for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
      const value = computed.getPropertyValue(cssVar).trim()
      if (value) {
        const hex = cssColorToHex(value)
        if (hex !== null) {
          ;(next as Record<string, number>)[key] = hex
        }
      }
    }

    this.palette = next
  }

  /** Watch for class changes on <html> for dark/light mode. */
  private observe(): void {
    this.observer = new MutationObserver(() => {
      this.resolve()
    })
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    })
  }

  destroy(): void {
    this.observer?.disconnect()
    this.observer = null
  }
}
