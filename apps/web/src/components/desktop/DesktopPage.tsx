"use client";

import * as React from "react";
import type { DesktopItem } from "./types";
import type { DesktopBreakpoint } from "./desktop-breakpoints";
import DesktopGrid from "./DesktopGrid";
import { getDesktopIconByKey } from "./desktop-icons";

const initialItems: DesktopItem[] = [
  {
    id: "w-flip-clock",
    kind: "widget",
    title: "Flip Clock",
    widgetKey: "flip-clock",
    size: "4x2",
    constraints: { defaultW: 4, defaultH: 2, minW: 2, minH: 2, maxW: 6, maxH: 3 },
    flipClock: { showSeconds: true },
    layout: { x: 0, y: 0, w: 4, h: 2 },
  },
  {
    id: "w-clock",
    kind: "widget",
    title: "Clock",
    widgetKey: "clock",
    size: "2x2",
    constraints: { defaultW: 2, defaultH: 2, minW: 2, minH: 2, maxW: 3, maxH: 3 },
    layout: { x: 0, y: 2, w: 2, h: 2 },
  },
  {
    id: "w-actions",
    kind: "widget",
    title: "Actions",
    widgetKey: "quick-actions",
    size: "4x2",
    constraints: { defaultW: 4, defaultH: 2, minW: 2, minH: 2, maxW: 6, maxH: 3 },
    layout: { x: 0, y: 4, w: 4, h: 2 },
  },
  {
    id: "i-files",
    kind: "icon",
    title: "Files",
    iconKey: "files",
    icon: getDesktopIconByKey("files"),
    layout: { x: 2, y: 2, w: 1, h: 1 },
  },
  {
    id: "i-tasks",
    kind: "icon",
    title: "Tasks",
    iconKey: "tasks",
    icon: getDesktopIconByKey("tasks"),
    layout: { x: 3, y: 2, w: 1, h: 1 },
  },
  {
    id: "i-search",
    kind: "icon",
    title: "Search",
    iconKey: "search",
    icon: getDesktopIconByKey("search"),
    layout: { x: 2, y: 3, w: 1, h: 1 },
  },
  {
    id: "i-settings",
    kind: "icon",
    title: "Settings",
    iconKey: "settings",
    icon: getDesktopIconByKey("settings"),
    layout: { x: 3, y: 3, w: 1, h: 1 },
  },
];

interface DesktopPageProps {
  /** Items in rendering order. */
  items: DesktopItem[];
  /** Whether desktop is in edit mode. */
  editMode: boolean;
  /** Active breakpoint when editing. */
  activeBreakpoint: DesktopBreakpoint;
  /** Notify view-mode breakpoint changes. */
  onViewBreakpointChange?: (breakpoint: DesktopBreakpoint) => void;
  /** Update edit mode. */
  onSetEditMode: (nextEditMode: boolean) => void;
  /** Update a single desktop item. */
  onUpdateItem: (itemId: string, updater: (item: DesktopItem) => DesktopItem) => void;
  /** Update items order after a drag ends. */
  onChangeItems: (nextItems: DesktopItem[]) => void;
  /** Signal value for triggering compact. */
  compactSignal: number;
}

/** Render a single-page desktop (MVP). */
export default function DesktopPage({
  items,
  editMode,
  activeBreakpoint,
  onViewBreakpointChange,
  onSetEditMode,
  onUpdateItem,
  onChangeItems,
  compactSignal,
}: DesktopPageProps) {
  return (
    <div className="h-full w-full overflow-hidden" title="Desktop" aria-label="Desktop">
      <div className="h-full w-full bg-gradient-to-b from-background ">
        <DesktopGrid
          items={items}
          editMode={editMode}
          activeBreakpoint={activeBreakpoint}
          onViewBreakpointChange={onViewBreakpointChange}
          onSetEditMode={onSetEditMode}
          onUpdateItem={onUpdateItem}
          onChangeItems={onChangeItems}
          onDeleteItem={(itemId) => onChangeItems(items.filter((item) => item.id !== itemId))}
          compactSignal={compactSignal}
        />
      </div>
    </div>
  );
}

export { initialItems };
