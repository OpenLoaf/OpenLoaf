"use client";

import type { DesktopItem, DesktopItemLayout } from "./types";

export type DesktopBreakpoint = "sm" | "md" | "lg";

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
export const DESKTOP_BREAKPOINT_ORDER: DesktopBreakpoint[] = ["lg", "md", "sm"];

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
  return items.map((item) => {
    if (!item.layoutByBreakpoint) {
      return { ...item, layoutByBreakpoint: createLayoutByBreakpoint(item.layout) };
    }
    return {
      ...item,
      layoutByBreakpoint: {
        ...createLayoutByBreakpoint(item.layout),
        ...item.layoutByBreakpoint,
      },
    };
  });
}

/** Apply a breakpoint layout to the item and keep layout in sync. */
export function updateItemLayoutForBreakpoint(
  item: DesktopItem,
  breakpoint: DesktopBreakpoint,
  layout: DesktopItemLayout
): DesktopItem {
  const nextLayouts = {
    ...(item.layoutByBreakpoint ?? createLayoutByBreakpoint(item.layout)),
    [breakpoint]: layout,
  };
  return { ...item, layout, layoutByBreakpoint: nextLayouts };
}
