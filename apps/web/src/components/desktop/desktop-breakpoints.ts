/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import type { DesktopItem, DesktopItemLayout } from "./types";
import { reflowAllBreakpoints, type ReflowItem } from "./desktop-reflow";

export type DesktopBreakpoint = "sm" | "md" | "lg";

export type DesktopBreakpointLock = "auto" | DesktopBreakpoint;

export type DesktopBreakpointConfig = {
  /** Minimum width for this breakpoint (px). */
  minWidth: number;
  /** Grid columns. */
  columns: number;
  /** Grid cell height (px). */
  rowHeight: number;
  /** Grid gap size (px). */
  gap: number;
  /** Grid padding (px). */
  padding: number;
};

/** Desktop breakpoint configs (three-size layout). */
export const DESKTOP_BREAKPOINTS: Record<DesktopBreakpoint, DesktopBreakpointConfig> = {
  sm: { minWidth: 0, columns: 4, rowHeight: 78, gap: 4, padding: 16 },
  md: { minWidth: 560, columns: 6, rowHeight: 82, gap: 6, padding: 20 },
  lg: { minWidth: 960, columns: 10, rowHeight: 88, gap: 8, padding: 24 },
};

/** Ordered breakpoints from large to small for fallback logic. */
const DESKTOP_BREAKPOINT_ORDER: DesktopBreakpoint[] = ["lg", "md", "sm"];

/** Resolve the breakpoint name by container width. */
export function getBreakpointForWidth(width: number): DesktopBreakpoint {
  if (width >= DESKTOP_BREAKPOINTS.lg.minWidth) return "lg";
  if (width >= DESKTOP_BREAKPOINTS.md.minWidth) return "md";
  return "sm";
}

/** Get config for a breakpoint. */
export function getBreakpointConfig(breakpoint: DesktopBreakpoint): DesktopBreakpointConfig {
  return DESKTOP_BREAKPOINTS[breakpoint];
}

/** Build a layout map for all breakpoints from a single layout. */
export function createLayoutByBreakpoint(
  layout: DesktopItemLayout
): Record<DesktopBreakpoint, DesktopItemLayout> {
  return {
    sm: { ...layout },
    md: { ...layout },
    lg: { ...layout },
  };
}

/** Resolve a layout for the breakpoint with fallback to stored layout. */
export function getItemLayoutForBreakpoint(
  item: DesktopItem,
  breakpoint: DesktopBreakpoint
): DesktopItemLayout {
  const direct = item.layoutByBreakpoint?.[breakpoint];
  if (direct) return direct;
  // 中文注释：如果当前断点无布局，按大到小回退到最近可用的布局。
  for (const key of DESKTOP_BREAKPOINT_ORDER) {
    const fallback = item.layoutByBreakpoint?.[key];
    if (fallback) return fallback;
  }
  return item.layout;
}

/** Ensure every item has layoutByBreakpoint initialized. */
export function ensureLayoutByBreakpoint(items: DesktopItem[]): DesktopItem[] {
  // Check if all items already have complete layouts for all breakpoints.
  const allComplete = items.every(
    (item) =>
      item.layoutByBreakpoint?.sm &&
      item.layoutByBreakpoint?.md &&
      item.layoutByBreakpoint?.lg
  );
  if (allComplete) return items;

  // Some items are missing breakpoint layouts — reflow from lg.
  return reflowItemsFromBreakpoint(items, "lg");
}

/** Extract a ReflowItem from a DesktopItem using its layout at the given breakpoint. */
function toReflowItem(item: DesktopItem, bp: DesktopBreakpoint): ReflowItem {
  const layout = getItemLayoutForBreakpoint(item, bp);
  if (item.kind === "icon") {
    return { id: item.id, layout, minW: 1, maxW: 2 };
  }
  return {
    id: item.id,
    layout,
    minW: item.constraints.minW,
    maxW: item.constraints.maxW,
  };
}

/**
 * Reflow all items from a source breakpoint to all other breakpoints.
 * Preserves existing manually-customized layouts (marked in customizedBreakpoints).
 */
export function reflowItemsFromBreakpoint(
  items: DesktopItem[],
  sourceBp: DesktopBreakpoint,
): DesktopItem[] {
  const reflowItems = items.map((item) => toReflowItem(item, sourceBp));
  const reflowed = reflowAllBreakpoints(reflowItems, sourceBp);

  return items.map((item) => {
    const layouts = reflowed.get(item.id);
    if (!layouts) return item;

    const existing = item.layoutByBreakpoint ?? {};
    const customized = item.customizedBreakpoints ?? [];

    const merged: Partial<Record<DesktopBreakpoint, DesktopItemLayout>> = {};
    for (const bp of ["sm", "md", "lg"] as DesktopBreakpoint[]) {
      if (bp === sourceBp) {
        // Source breakpoint: keep the current layout.
        merged[bp] = existing[bp] ?? layouts[bp];
      } else if (customized.includes(bp) && existing[bp]) {
        // Customized breakpoint: preserve manual layout.
        merged[bp] = existing[bp];
      } else {
        // Auto breakpoint: use reflowed layout.
        merged[bp] = layouts[bp] ?? existing[bp];
      }
    }

    return {
      ...item,
      layoutByBreakpoint: merged as Record<DesktopBreakpoint, DesktopItemLayout>,
    };
  });
}

/** Apply a breakpoint layout to the item and keep layout in sync. */
export function updateItemLayoutForBreakpoint(
  item: DesktopItem,
  breakpoint: DesktopBreakpoint,
  layout: DesktopItemLayout,
  /** When true, mark this breakpoint as manually customized. Defaults to true. */
  markCustomized = true,
): DesktopItem {
  const nextLayouts = {
    ...(item.layoutByBreakpoint ?? createLayoutByBreakpoint(item.layout)),
    [breakpoint]: layout,
  };

  let customized = item.customizedBreakpoints ?? [];
  if (markCustomized && !customized.includes(breakpoint)) {
    customized = [...customized, breakpoint];
  }

  return { ...item, layout, layoutByBreakpoint: nextLayouts, customizedBreakpoints: customized };
}
