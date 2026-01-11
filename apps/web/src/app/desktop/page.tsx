"use client";

import * as React from "react";
import DesktopPage, { initialItems } from "@/components/desktop/DesktopPage";
import type { DesktopItem } from "@/components/desktop/types";
import { Button } from "@/components/ui/button";

/** Render a standalone desktop demo page for UI verification. */
export default function DesktopDemoPage() {
  const [items, setItems] = React.useState<DesktopItem[]>(() => initialItems);
  const [editMode, setEditMode] = React.useState(false);
  const snapshotRef = React.useRef<DesktopItem[] | null>(null);

  const handleSetEditMode = React.useCallback((nextEditMode: boolean) => {
    setEditMode((prev) => {
      if (!prev && nextEditMode) {
        snapshotRef.current = items.map((item) => ({
          ...item,
          layout: { ...item.layout },
        }));
      }
      if (prev && !nextEditMode) snapshotRef.current = null;
      return nextEditMode;
    });
  }, [items]);

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-3 py-2">
        <div className="min-w-0 truncate text-sm font-medium">Desktop Demo</div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const snapshot = snapshotRef.current;
                  if (snapshot) setItems(snapshot);
                  snapshotRef.current = null;
                  setEditMode(false);
                }}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() => {
                  snapshotRef.current = null;
                  setEditMode(false);
                }}
              >
                完成
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="secondary" onClick={() => handleSetEditMode(true)}>
              编辑
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <DesktopPage
          items={items}
          editMode={editMode}
          onSetEditMode={handleSetEditMode}
          onChangeItems={setItems}
        />
      </div>
    </div>
  );
}

