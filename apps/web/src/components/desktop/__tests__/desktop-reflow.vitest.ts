import { describe, it, expect } from "vitest"
import { reflowLayouts, reflowAllBreakpoints, type ReflowItem } from "../desktop-reflow"
import {
  ensureLayoutByBreakpoint,
  reflowItemsFromBreakpoint,
  getItemLayoutForBreakpoint,
  updateItemLayoutForBreakpoint,
} from "../desktop-breakpoints"
import type { DesktopItem, DesktopItemLayout } from "../types"

// Helper: create a ReflowItem with defaults.
function ri(
  id: string,
  layout: DesktopItemLayout,
  minW = 1,
  maxW = 12,
): ReflowItem {
  return { id, layout, minW, maxW }
}

// Helper: create a minimal DesktopWidgetItem for testing.
function widget(
  id: string,
  layout: DesktopItemLayout,
  opts?: {
    layoutByBreakpoint?: Partial<Record<"sm" | "md" | "lg", DesktopItemLayout>>
    customizedBreakpoints?: ("sm" | "md" | "lg")[]
    minW?: number
    maxW?: number
  },
): DesktopItem {
  return {
    id,
    kind: "widget",
    title: id,
    widgetKey: "clock",
    size: "2x2",
    constraints: {
      defaultW: layout.w,
      defaultH: layout.h,
      minW: opts?.minW ?? 1,
      minH: 1,
      maxW: opts?.maxW ?? 12,
      maxH: 20,
    },
    layout,
    layoutByBreakpoint: opts?.layoutByBreakpoint,
    customizedBreakpoints: opts?.customizedBreakpoints,
  } as DesktopItem
}

// ─── reflowLayouts ───────────────────────────────────────────────

describe("reflowLayouts", () => {
  it("returns empty map for empty input", () => {
    expect(reflowLayouts([], "lg", "sm").size).toBe(0)
  })

  it("scales width proportionally from lg(10) to sm(4)", () => {
    // lg: w=5 → sm: round(5/10*4) = 2
    const items = [ri("a", { x: 0, y: 0, w: 5, h: 2 })]
    const result = reflowLayouts(items, "lg", "sm")
    expect(result.get("a")?.w).toBe(2)
  })

  it("clamps width to minW", () => {
    // lg: w=1 → sm: round(1/10*4)=0 → clamp to minW=1
    const items = [ri("a", { x: 0, y: 0, w: 1, h: 1 }, 1, 4)]
    const result = reflowLayouts(items, "lg", "sm")
    expect(result.get("a")?.w).toBeGreaterThanOrEqual(1)
  })

  it("clamps width to targetCols when maxW exceeds it", () => {
    // lg: w=10 → sm: round(10/10*4)=4, maxW=12 but targetCols=4
    const items = [ri("a", { x: 0, y: 0, w: 10, h: 2 }, 1, 12)]
    const result = reflowLayouts(items, "lg", "sm")
    expect(result.get("a")?.w).toBe(4)
  })

  it("preserves height", () => {
    const items = [ri("a", { x: 0, y: 0, w: 5, h: 7 })]
    const result = reflowLayouts(items, "lg", "sm")
    expect(result.get("a")?.h).toBe(7)
  })

  it("places items without overlap", () => {
    const items = [
      ri("a", { x: 0, y: 0, w: 5, h: 2 }),
      ri("b", { x: 5, y: 0, w: 5, h: 3 }),
    ]
    const result = reflowLayouts(items, "lg", "sm")
    const a = result.get("a")!
    const b = result.get("b")!
    // They should not overlap vertically if they share columns.
    const aRight = a.x + a.w
    const bRight = b.x + b.w
    const xOverlap = a.x < bRight && b.x < aRight
    if (xOverlap) {
      const aBottom = a.y + a.h
      const bBottom = b.y + b.h
      const yOverlap = a.y < bBottom && b.y < aBottom
      expect(yOverlap).toBe(false)
    }
  })

  it("maintains reading order (y→x sort)", () => {
    // Both items scale to w=4 in sm(4 cols), so they must stack vertically.
    const items = [
      ri("bottom", { x: 0, y: 5, w: 10, h: 2 }),
      ri("top", { x: 0, y: 0, w: 10, h: 2 }),
    ]
    const result = reflowLayouts(items, "lg", "sm")
    // "top" should be placed before "bottom" in the output.
    expect(result.get("top")!.y).toBeLessThan(result.get("bottom")!.y)
  })
})

// ─── reflowAllBreakpoints ────────────────────────────────────────

describe("reflowAllBreakpoints", () => {
  it("produces layouts for all three breakpoints", () => {
    const items = [ri("a", { x: 0, y: 0, w: 5, h: 2 })]
    const result = reflowAllBreakpoints(items, "lg")
    const entry = result.get("a")!
    expect(entry.lg).toBeDefined()
    expect(entry.md).toBeDefined()
    expect(entry.sm).toBeDefined()
  })

  it("source breakpoint layout matches input", () => {
    const layout = { x: 2, y: 1, w: 5, h: 3 }
    const items = [ri("a", layout)]
    const result = reflowAllBreakpoints(items, "lg")
    expect(result.get("a")!.lg).toEqual(layout)
  })
})

// ─── ensureLayoutByBreakpoint ────────────────────────────────────

describe("ensureLayoutByBreakpoint", () => {
  it("returns items unchanged when all breakpoints are present", () => {
    const layout = { x: 0, y: 0, w: 4, h: 2 }
    const items = [
      widget("a", layout, {
        layoutByBreakpoint: { sm: layout, md: layout, lg: layout },
      }),
    ]
    const result = ensureLayoutByBreakpoint(items)
    expect(result).toBe(items) // same reference = no reflow
  })

  it("fills missing breakpoints via reflow", () => {
    const layout = { x: 0, y: 0, w: 4, h: 2 }
    const items = [widget("a", layout)] // no layoutByBreakpoint
    const result = ensureLayoutByBreakpoint(items)
    expect(result[0].layoutByBreakpoint?.sm).toBeDefined()
    expect(result[0].layoutByBreakpoint?.md).toBeDefined()
    expect(result[0].layoutByBreakpoint?.lg).toBeDefined()
  })
})

// ─── reflowItemsFromBreakpoint ───────────────────────────────────

describe("reflowItemsFromBreakpoint", () => {
  it("preserves customized breakpoint layouts", () => {
    const lgLayout = { x: 0, y: 0, w: 8, h: 2 }
    const smCustom = { x: 1, y: 3, w: 2, h: 2 }
    const items = [
      widget("a", lgLayout, {
        layoutByBreakpoint: { lg: lgLayout, sm: smCustom },
        customizedBreakpoints: ["sm"],
      }),
    ]
    const result = reflowItemsFromBreakpoint(items, "lg")
    // sm should be preserved because it's customized.
    expect(result[0].layoutByBreakpoint?.sm).toEqual(smCustom)
    // md should be auto-generated (not the same as lg).
    expect(result[0].layoutByBreakpoint?.md).toBeDefined()
  })

  it("overwrites non-customized breakpoints", () => {
    const lgLayout = { x: 0, y: 0, w: 8, h: 2 }
    const oldMd = { x: 99, y: 99, w: 1, h: 1 }
    const items = [
      widget("a", lgLayout, {
        layoutByBreakpoint: { lg: lgLayout, md: oldMd },
        // md is NOT in customizedBreakpoints
      }),
    ]
    const result = reflowItemsFromBreakpoint(items, "lg")
    // md should be overwritten by reflow, not the old value.
    expect(result[0].layoutByBreakpoint?.md).not.toEqual(oldMd)
  })

  it("icon items get minW=maxW=1", () => {
    const lgLayout = { x: 0, y: 0, w: 1, h: 1 }
    const iconItem: DesktopItem = {
      id: "icon-1",
      kind: "icon",
      title: "Files",
      iconKey: "files",
      icon: null as any,
      layout: lgLayout,
      layoutByBreakpoint: { lg: lgLayout },
    }
    const result = reflowItemsFromBreakpoint([iconItem], "lg")
    expect(result[0].layoutByBreakpoint?.sm?.w).toBe(1)
    expect(result[0].layoutByBreakpoint?.md?.w).toBe(1)
  })
})

// ─── edit mode layout scaling ───────────────────────────────────

describe("edit mode layout scaling", () => {
  // Simulate what DesktopGrid does when breakpoint changes:
  // it reads the layout for the new breakpoint and applies it.

  it("sm layout has scaled-down widths compared to lg", () => {
    const lgLayout = { x: 0, y: 0, w: 8, h: 3 }
    const items = [widget("a", lgLayout)]
    const result = ensureLayoutByBreakpoint(items)
    const smLayout = result[0].layoutByBreakpoint?.sm
    // lg has 10 cols, sm has 4 cols → w=8 scales to round(8/10*4)=3
    expect(smLayout?.w).toBe(3)
    expect(smLayout?.h).toBe(3) // height preserved
  })

  it("lg layout is preserved exactly after reflow", () => {
    const lgLayout = { x: 2, y: 1, w: 6, h: 4 }
    const items = [widget("a", lgLayout)]
    const result = ensureLayoutByBreakpoint(items)
    expect(result[0].layoutByBreakpoint?.lg).toEqual(lgLayout)
  })

  it("switching sm→lg→sm yields same sm layout", () => {
    const lgLayout = { x: 0, y: 0, w: 8, h: 3 }
    const items = [widget("a", lgLayout)]
    const result = ensureLayoutByBreakpoint(items)
    const smFirst = result[0].layoutByBreakpoint?.sm
    // Simulate: read lg, then read sm again — should be identical.
    const smSecond = getItemLayoutForBreakpoint(result[0], "sm")
    expect(smSecond).toEqual(smFirst)
  })

  it("lg edit triggers cascade reflow to sm/md", () => {
    const lgLayout = { x: 0, y: 0, w: 5, h: 2 }
    const items = [widget("a", lgLayout, {
      layoutByBreakpoint: { lg: lgLayout, md: { x: 0, y: 0, w: 3, h: 2 }, sm: { x: 0, y: 0, w: 2, h: 2 } },
    })]
    // Simulate user resizing widget in lg to w=10.
    const newLg = { x: 0, y: 0, w: 10, h: 2 }
    const updated = updateItemLayoutForBreakpoint(items[0], "lg", newLg, false)
    // Reflow from the new lg layout.
    const reflowed = reflowItemsFromBreakpoint([updated], "lg")
    // sm should now be w=4 (full width in sm), not the old w=2.
    expect(reflowed[0].layoutByBreakpoint?.sm?.w).toBe(4)
  })

  it("updateItemLayoutForBreakpoint marks breakpoint as customized", () => {
    const lgLayout = { x: 0, y: 0, w: 5, h: 2 }
    const items = [widget("a", lgLayout, {
      layoutByBreakpoint: { lg: lgLayout, md: { x: 0, y: 0, w: 3, h: 2 }, sm: { x: 0, y: 0, w: 2, h: 2 } },
    })]
    const updated = updateItemLayoutForBreakpoint(items[0], "sm", { x: 1, y: 1, w: 3, h: 2 })
    expect(updated.customizedBreakpoints).toContain("sm")
  })

  it("manual sm edit is preserved during lg cascade reflow", () => {
    const lgLayout = { x: 0, y: 0, w: 5, h: 2 }
    const smCustom = { x: 1, y: 0, w: 3, h: 2 }
    const items = [widget("a", lgLayout, {
      layoutByBreakpoint: { lg: lgLayout, sm: smCustom },
      customizedBreakpoints: ["sm"],
    })]
    const reflowed = reflowItemsFromBreakpoint(items, "lg")
    expect(reflowed[0].layoutByBreakpoint?.sm).toEqual(smCustom)
  })

  it("multiple items do not overlap after reflow to sm", () => {
    const items = [
      widget("a", { x: 0, y: 0, w: 5, h: 2 }),
      widget("b", { x: 5, y: 0, w: 5, h: 3 }),
      widget("c", { x: 0, y: 2, w: 10, h: 1 }),
    ]
    const result = ensureLayoutByBreakpoint(items)
    const layouts = result.map((item) => item.layoutByBreakpoint?.sm!)
    // Check no pair overlaps.
    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const a = layouts[i]
        const b = layouts[j]
        const xOverlap = a.x < b.x + b.w && b.x < a.x + a.w
        const yOverlap = a.y < b.y + b.h && b.y < a.y + a.h
        expect(xOverlap && yOverlap).toBe(false)
      }
    }
  })

  it("new item added to existing layout gets all breakpoints", () => {
    const lgA = { x: 0, y: 0, w: 5, h: 2 }
    const existing = ensureLayoutByBreakpoint([widget("a", lgA)])
    // Add a new item without layoutByBreakpoint.
    const newItem = widget("b", { x: 5, y: 0, w: 5, h: 3 })
    const result = ensureLayoutByBreakpoint([...existing, newItem])
    expect(result[1].layoutByBreakpoint?.sm).toBeDefined()
    expect(result[1].layoutByBreakpoint?.md).toBeDefined()
    expect(result[1].layoutByBreakpoint?.lg).toBeDefined()
  })
})
