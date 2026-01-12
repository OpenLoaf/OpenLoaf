"use client";

import type { DesktopItem } from "./types";

/** Clone desktop items to avoid shared references in history. */
export function cloneDesktopItems(items: DesktopItem[]): DesktopItem[] {
  return items.map((item) => {
    if (item.kind === "icon") {
      return {
        ...item,
        layout: { ...item.layout },
      };
    }

    return {
      ...item,
      layout: { ...item.layout },
      constraints: { ...item.constraints },
      flipClock: item.flipClock ? { ...item.flipClock } : undefined,
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
  }

  return true;
}
