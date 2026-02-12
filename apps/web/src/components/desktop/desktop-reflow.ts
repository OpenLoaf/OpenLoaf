import type { DesktopItemLayout } from "./types"
import {
  DESKTOP_BREAKPOINTS,
  type DesktopBreakpoint,
} from "./desktop-breakpoints"

/**
 * Find the lowest available position in the heightmap where an item of the
 * given width fits. Returns the column (x) and row (y).
 */
function findPlacement(
  heightmap: number[],
  totalCols: number,
  w: number,
): { x: number; y: number } {
  let bestX = 0
  let bestY = Number.MAX_SAFE_INTEGER

  for (let col = 0; col <= totalCols - w; col++) {
    // The row this item would start at is the max height across its span.
    let maxH = 0
    for (let c = col; c < col + w; c++) {
      if (heightmap[c] > maxH) maxH = heightmap[c]
    }
    if (maxH < bestY) {
      bestY = maxH
      bestX = col
    }
  }

  return { x: bestX, y: bestY }
}

export interface ReflowItem {
  id: string
  /** Source layout in the reference breakpoint. */
  layout: DesktopItemLayout
  /** Minimum width constraint (grid columns). */
  minW: number
  /** Maximum width constraint (grid columns). */
  maxW: number
}

/**
 * Reflow a set of items from one breakpoint to another using greedy
 * bin-packing. Items are sorted by their source y→x reading order, then
 * placed into the target grid using a column-heightmap to find the lowest
 * available position.
 *
 * Width is proportionally scaled; height is preserved.
 */
export function reflowLayouts(
  items: ReflowItem[],
  sourceBp: DesktopBreakpoint,
  targetBp: DesktopBreakpoint,
): Map<string, DesktopItemLayout> {
  const sourceCols = DESKTOP_BREAKPOINTS[sourceBp].columns
  const targetCols = DESKTOP_BREAKPOINTS[targetBp].columns
  const result = new Map<string, DesktopItemLayout>()

  if (items.length === 0) return result

  // Sort by y then x (reading order).
  const sorted = [...items].sort((a, b) => {
    if (a.layout.y !== b.layout.y) return a.layout.y - b.layout.y
    return a.layout.x - b.layout.x
  })

  // Column heightmap — tracks the lowest occupied row per column.
  const heightmap = new Array<number>(targetCols).fill(0)

  for (const item of sorted) {
    // Scale width proportionally.
    let scaledW = Math.round((item.layout.w / sourceCols) * targetCols)
    // Clamp to [minW, min(maxW, targetCols)].
    scaledW = Math.max(item.minW, Math.min(item.maxW, targetCols, scaledW))
    const h = item.layout.h

    // Find the lowest row where this item fits.
    const { x, y } = findPlacement(heightmap, targetCols, scaledW)

    // Update heightmap.
    for (let col = x; col < x + scaledW; col++) {
      heightmap[col] = y + h
    }

    result.set(item.id, { x, y, w: scaledW, h })
  }

  return result
}

const ALL_BREAKPOINTS: DesktopBreakpoint[] = ['sm', 'md', 'lg']

/**
 * Reflow items from a source breakpoint to all other breakpoints.
 * Returns a map of item id → record of breakpoint → layout.
 */
export function reflowAllBreakpoints(
  items: ReflowItem[],
  sourceBp: DesktopBreakpoint,
): Map<string, Partial<Record<DesktopBreakpoint, DesktopItemLayout>>> {
  const result = new Map<string, Partial<Record<DesktopBreakpoint, DesktopItemLayout>>>()

  // Initialize entries for each item.
  for (const item of items) {
    result.set(item.id, { [sourceBp]: { ...item.layout } })
  }

  // Reflow to each non-source breakpoint.
  for (const bp of ALL_BREAKPOINTS) {
    if (bp === sourceBp) continue
    const reflowed = reflowLayouts(items, sourceBp, bp)
    for (const [id, layout] of reflowed) {
      const entry = result.get(id)
      if (entry) entry[bp] = layout
    }
  }

  return result
}
