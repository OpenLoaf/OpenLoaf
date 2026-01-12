"use client";

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

  if (item.widgetKey === "flip-clock") {
    return (
      <div className="flex h-full w-full items-center justify-center p-2">
        <FlipClockWidget showSeconds={item.flipClock?.showSeconds ?? true} />
      </div>
    );
  }

  if (item.widgetKey === "3d-folder") {
    return (
      <div className="flex h-full w-full items-center justify-center p-2">
        <ThreeDFolderWidget title={item.title} folderUri={item.folderUri} />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm font-medium">{item.title}</div>
      </div>
      <div className="mt-3 min-h-0 flex-1">
        {item.widgetKey === "clock" ? <ClockWidget /> : <QuickActionsWidget />}
      </div>
    </div>
  );
}
