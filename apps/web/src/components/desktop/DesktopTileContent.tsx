"use client";

import * as React from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { openSettingsTab, useGlobalOverlay } from "@/lib/globalShortcuts";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import type { DesktopItem, DesktopScope } from "./types";
import DesktopIconLabel from "./DesktopIconLabel";
import ClockWidget from "./widgets/ClockWidget";
import ChatHistoryWidget from "./widgets/ChatHistoryWidget";
import EmailInboxWidget from "./widgets/EmailInboxWidget";
import FlipClockWidget from "./widgets/FlipClockWidget";
import QuickActionsWidget from "./widgets/QuickActionsWidget";
import ThreeDFolderWidget from "./widgets/ThreeDFolderWidget";
import VideoWidget from "./widgets/VideoWidget";
import WebStackWidget from "./widgets/WebStackWidget";
import type { DesktopIconKey } from "./types";

interface DesktopTileContentProps {
  item: DesktopItem;
  scope: DesktopScope;
  webContext?: { projectId?: string; workspaceId?: string };
  onWebOpen?: () => void;
}

/** Render tile content (icon or widget) with shared layout styles. */
export default function DesktopTileContent({
  item,
  scope,
  webContext,
  onWebOpen,
}: DesktopTileContentProps) {
  const { workspace } = useWorkspace();
  const tabs = useTabs((state) => state.tabs);
  const activeTabId = useTabs((state) => state.activeTabId);
  const setTabBaseParams = useTabRuntime((state) => state.setTabBaseParams);
  const setSearchOpen = useGlobalOverlay((state) => state.setSearchOpen);
  const hoverBoundaryRef = React.useRef<HTMLDivElement | null>(null);
  const rafIdRef = React.useRef<number | null>(null);
  const pointerRef = React.useRef<{ x: number; y: number } | null>(null);
  const hoverStateRef = React.useRef(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const widgetKey = item.kind === "widget" ? item.widgetKey : null;

  /** Handle desktop icon activation. */
  const handleIconClick = React.useCallback(
    (iconKey: DesktopIconKey) => {
      if (iconKey === "search") {
        setSearchOpen(true);
        return;
      }
      if (!workspace?.id) {
        toast.error("未找到工作区");
        return;
      }
      if (iconKey === "settings" && scope === "workspace") {
        openSettingsTab(workspace.id);
        return;
      }
      const activeTab = tabs.find(
        (tab) => tab.id === activeTabId && tab.workspaceId === workspace.id
      );
      if (!activeTab) {
        toast.error("未找到标签页");
        return;
      }
      const runtime = activeTab ? useTabRuntime.getState().runtimeByTabId[activeTab.id] : undefined;
      if (!runtime?.base?.id?.startsWith("project:")) {
        toast.error("请先打开一个项目标签页");
        return;
      }
      const nextTab =
        iconKey === "tasks" ? "tasks" : iconKey === "settings" ? "settings" : "files";
      // 中文注释：仅更新当前激活的项目 tab 子页签。
      setTabBaseParams(activeTab.id, { projectTab: nextTab });
    },
    [activeTabId, scope, setSearchOpen, setTabBaseParams, tabs, workspace?.id]
  );

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
      <button
        type="button"
        className="group flex h-full w-full flex-col items-center justify-center gap-1 p-2"
        onClick={() => handleIconClick(item.iconKey)}
        aria-label={item.title}
      >
        <div className="flex size-10 items-center justify-center rounded-2xl text-foreground transition-transform duration-200 ease-out group-hover:-translate-y-1 group-hover:rotate-3 group-hover:scale-110">
          {item.icon}
        </div>
        <DesktopIconLabel className="-mt-0.5 transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:scale-[1.03]">
          {item.title}
        </DesktopIconLabel>
      </button>
    );
  }

  if (widgetKey === "flip-clock") {
    return (
      <div className="flex h-full w-full items-center justify-center p-2">
        <FlipClockWidget showSeconds={item.flipClock?.showSeconds ?? true} />
      </div>
    );
  }

  if (widgetKey === "chat-history") {
    return (
      <div className="h-full w-full p-2">
        <ChatHistoryWidget />
      </div>
    );
  }

  if (widgetKey === "email-inbox") {
    return (
      <div className="h-full w-full p-2">
        <EmailInboxWidget />
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

  if (widgetKey === "video") {
    return (
      <div className="flex h-full w-full flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-medium">{item.title}</div>
        </div>
        <div className="mt-3 min-h-0 flex-1">
          <VideoWidget fileRef={item.videoFileRef} title={item.title} />
        </div>
      </div>
    );
  }

  if (widgetKey === "web-stack" && item.kind === "widget") {
    return (
      <WebStackWidget
        item={item}
        projectId={webContext?.projectId}
        workspaceId={webContext?.workspaceId}
        onOpen={onWebOpen}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm font-medium">{item.title}</div>
      </div>
      <div className="mt-3 min-h-0 flex-1">
        {widgetKey === "clock" ? <ClockWidget /> : <QuickActionsWidget scope={scope} />}
      </div>
    </div>
  );
}
