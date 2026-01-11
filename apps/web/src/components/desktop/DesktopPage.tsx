"use client";

import * as React from "react";
import { FileText, ListTodo, Search, Settings } from "lucide-react";
import type { DesktopItem } from "./types";
import DesktopGrid from "./DesktopGrid";

const initialItems: DesktopItem[] = [
  {
    id: "w-clock",
    kind: "widget",
    title: "Clock",
    widgetKey: "clock",
    size: "2x2",
    layout: { x: 0, y: 0, w: 2, h: 2 },
  },
  {
    id: "w-actions",
    kind: "widget",
    title: "Actions",
    widgetKey: "quick-actions",
    size: "4x2",
    layout: { x: 0, y: 2, w: 4, h: 2 },
  },
  {
    id: "i-files",
    kind: "icon",
    title: "Files",
    icon: <FileText className="size-5" />,
    layout: { x: 2, y: 0, w: 1, h: 1 },
  },
  {
    id: "i-tasks",
    kind: "icon",
    title: "Tasks",
    icon: <ListTodo className="size-5" />,
    layout: { x: 3, y: 0, w: 1, h: 1 },
  },
  {
    id: "i-search",
    kind: "icon",
    title: "Search",
    icon: <Search className="size-5" />,
    layout: { x: 2, y: 1, w: 1, h: 1 },
  },
  {
    id: "i-settings",
    kind: "icon",
    title: "Settings",
    icon: <Settings className="size-5" />,
    layout: { x: 3, y: 1, w: 1, h: 1 },
  },
];

interface DesktopPageProps {
  /** Items in rendering order. */
  items: DesktopItem[];
  /** Whether desktop is in edit mode. */
  editMode: boolean;
  /** Update edit mode. */
  onSetEditMode: (nextEditMode: boolean) => void;
  /** Update items order after a drag ends. */
  onChangeItems: (nextItems: DesktopItem[]) => void;
}

/** Render a single-page desktop (MVP). */
export default function DesktopPage({
  items,
  editMode,
  onSetEditMode,
  onChangeItems,
}: DesktopPageProps) {
  return (
    <div className="h-full w-full overflow-hidden" title="Desktop" aria-label="Desktop">
      <div className="h-full w-full bg-gradient-to-b from-background to-muted/40">
        <DesktopGrid
          items={items}
          editMode={editMode}
          onSetEditMode={onSetEditMode}
          onChangeItems={onChangeItems}
          onDeleteItem={(itemId) => onChangeItems(items.filter((item) => item.id !== itemId))}
        />
      </div>
    </div>
  );
}

export { initialItems };
