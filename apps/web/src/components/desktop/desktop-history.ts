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

import type { DesktopItem } from "./types";

/** Clone desktop items to avoid shared references in history. */
export function cloneDesktopItems(items: DesktopItem[]): DesktopItem[] {
  return items.map((item) => {
    if (item.kind === "icon") {
      return {
        ...item,
        layout: { ...item.layout },
        layoutByBreakpoint: item.layoutByBreakpoint
          ? {
              sm: item.layoutByBreakpoint.sm
                ? { ...item.layoutByBreakpoint.sm }
                : undefined,
              md: item.layoutByBreakpoint.md
                ? { ...item.layoutByBreakpoint.md }
                : undefined,
              lg: item.layoutByBreakpoint.lg
                ? { ...item.layoutByBreakpoint.lg }
                : undefined,
            }
          : undefined,
        customizedBreakpoints: item.customizedBreakpoints
          ? [...item.customizedBreakpoints]
          : undefined,
      };
    }

    return {
      ...item,
      layout: { ...item.layout },
      layoutByBreakpoint: item.layoutByBreakpoint
        ? {
            sm: item.layoutByBreakpoint.sm
              ? { ...item.layoutByBreakpoint.sm }
              : undefined,
            md: item.layoutByBreakpoint.md
              ? { ...item.layoutByBreakpoint.md }
              : undefined,
            lg: item.layoutByBreakpoint.lg
              ? { ...item.layoutByBreakpoint.lg }
              : undefined,
          }
        : undefined,
      constraints: { ...item.constraints },
      flipClock: item.flipClock ? { ...item.flipClock } : undefined,
      customizedBreakpoints: item.customizedBreakpoints
        ? [...item.customizedBreakpoints]
        : undefined,
    };
  });
}

/** Compare two desktop item arrays by layout and settings. */
export function areDesktopItemsEqual(a: DesktopItem[], b: DesktopItem[]): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];

    if (left.id !== right.id) return false;
    if (left.kind !== right.kind) return false;
    if (left.title !== right.title) return false;
    if ((left.pinned ?? false) !== (right.pinned ?? false)) return false;
    if (left.kind === "icon" && right.kind === "icon") {
      if (left.iconKey !== right.iconKey) return false;
    }

    const leftLayout = left.layout;
    const rightLayout = right.layout;
    if (
      leftLayout.x !== rightLayout.x ||
      leftLayout.y !== rightLayout.y ||
      leftLayout.w !== rightLayout.w ||
      leftLayout.h !== rightLayout.h
    ) {
      return false;
    }

    const leftLayouts = left.layoutByBreakpoint;
    const rightLayouts = right.layoutByBreakpoint;
    if (Boolean(leftLayouts) !== Boolean(rightLayouts)) return false;
    if (leftLayouts && rightLayouts) {
      const keys: Array<keyof typeof leftLayouts> = ["sm", "md", "lg"];
      for (const key of keys) {
        const l = leftLayouts[key];
        const r = rightLayouts[key];
        if (Boolean(l) !== Boolean(r)) return false;
        if (!l || !r) continue;
        if (l.x !== r.x || l.y !== r.y || l.w !== r.w || l.h !== r.h) return false;
      }
    }

    if (left.kind === "widget" && right.kind === "widget") {
      if (left.widgetKey !== right.widgetKey) return false;
      if (left.size !== right.size) return false;
      if (
        left.constraints.defaultW !== right.constraints.defaultW ||
        left.constraints.defaultH !== right.constraints.defaultH ||
        left.constraints.minW !== right.constraints.minW ||
        left.constraints.minH !== right.constraints.minH ||
        left.constraints.maxW !== right.constraints.maxW ||
        left.constraints.maxH !== right.constraints.maxH
      ) {
        return false;
      }

      const leftFlip = left.flipClock?.showSeconds ?? true;
      const rightFlip = right.flipClock?.showSeconds ?? true;
      if (leftFlip !== rightFlip) return false;
    }

    const leftCustom = left.customizedBreakpoints ?? [];
    const rightCustom = right.customizedBreakpoints ?? [];
    if (leftCustom.length !== rightCustom.length) return false;
    for (let j = 0; j < leftCustom.length; j += 1) {
      if (leftCustom[j] !== rightCustom[j]) return false;
    }
  }

  return true;
}
