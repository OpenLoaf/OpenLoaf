"use client";

import * as React from "react";
import type { DesktopItem } from "./types";
import DesktopIconLabel from "./DesktopIconLabel";
import ClockWidget from "./widgets/ClockWidget";
import FlipClockWidget from "./widgets/FlipClockWidget";
import QuickActionsWidget from "./widgets/QuickActionsWidget";
import ThreeDFolderWidget from "./widgets/ThreeDFolderWidget";

interface DesktopTileContentProps {
  item: DesktopItem;
}

/** Render tile content (icon or widget) with shared layout styles. */
export default function DesktopTileContent({ item }: DesktopTileContentProps) {
  const hoverBoundaryRef = React.useRef<HTMLDivElement | null>(null);
  const rafIdRef = React.useRef<number | null>(null);
  const pointerRef = React.useRef<{ x: number; y: number } | null>(null);
  const hoverStateRef = React.useRef(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const widgetKey = item.kind === "widget" ? item.widgetKey : null;

  React.useEffect(() => {
    // 逻辑：仅 3d-folder 使用容器边界做 hover 命中，避免溢出元素误触发。
    if (item.kind !== "widget" || widgetKey !== "3d-folder") {
      hoverStateRef.current = false;
      setIsHovered(false);
      return;
    }

    /** Update hover state based on current pointer position. */
    const syncHoverFromPointer = (clientX: number, clientY: number) => {
      const tile = hoverBoundaryRef.current;
      if (!tile) return;
      const rect = tile.getBoundingClientRect();
      const isInside =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
      if (hoverStateRef.current === isInside) return;
      hoverStateRef.current = isInside;
      setIsHovered(isInside);
    };

    /** Handle pointer movement across the window. */
    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      if (rafIdRef.current !== null) return;
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        const point = pointerRef.current;
        if (!point) return;
        syncHoverFromPointer(point.x, point.y);
      });
    };

    /** Clear hover when pointer leaves the document. */
    const handlePointerLeave = () => {
      hoverStateRef.current = false;
      setIsHovered(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("mouseleave", handlePointerLeave);
    window.addEventListener("blur", handlePointerLeave);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("mouseleave", handlePointerLeave);
      window.removeEventListener("blur", handlePointerLeave);
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [item.kind, widgetKey]);

  if (item.kind === "icon") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2">
        <div className="flex size-10 items-center justify-center rounded-2xl text-foreground">
          {item.icon}
        </div>
        <DesktopIconLabel>{item.title}</DesktopIconLabel>
      </div>
    );
  }

  if (widgetKey === "flip-clock") {
    return (
      <div className="flex h-full w-full items-center justify-center p-2">
        <FlipClockWidget showSeconds={item.flipClock?.showSeconds ?? true} />
      </div>
    );
  }

  if (widgetKey === "3d-folder") {
    return (
      <div
        ref={hoverBoundaryRef}
        className="flex h-full w-full items-center justify-center p-2"
      >
        <ThreeDFolderWidget
          title={item.title}
          folderUri={item.folderUri}
          hovered={isHovered}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm font-medium">{item.title}</div>
      </div>
      <div className="mt-3 min-h-0 flex-1">
        {widgetKey === "clock" ? <ClockWidget /> : <QuickActionsWidget />}
      </div>
    </div>
  );
}
