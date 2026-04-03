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

import * as React from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { openSettingsTab, useGlobalOverlay } from "@/lib/globalShortcuts";
import { useLayoutState } from "@/hooks/use-layout-state";
import { openCurrentProjectShellTab } from "@/lib/project-shell";
import type { DesktopItem, DesktopScope } from "./types";
import DesktopIconLabel from "./DesktopIconLabel";
import ClockWidget from "./widgets/ClockWidget";
import ChatHistoryWidget from "./widgets/ChatHistoryWidget";
import CalendarWidget from "./widgets/CalendarWidget";
import EmailInboxWidget from "./widgets/EmailInboxWidget";
import FlipClockWidget from "./widgets/FlipClockWidget";
import QuickActionsWidget from "./widgets/QuickActionsWidget";
import ThreeDFolderWidget from "./widgets/ThreeDFolderWidget";
import VideoWidget from "./widgets/VideoWidget";
import TaskBoardWidget from "./widgets/TaskBoardWidget";
import HelpWidget from "./widgets/HelpWidget";
import WebStackWidget from "./widgets/WebStackWidget";
import WidgetConfigOverlay from "./widgets/WidgetConfigOverlay";
import DynamicWidgetRenderer from "./dynamic-widgets/DynamicWidgetRenderer";
import type { DesktopIconKey } from "./types";

interface DesktopTileContentProps {
  item: DesktopItem;
  scope: DesktopScope;
  webContext?: { projectId?: string };
  onWebOpen?: () => void;
  /** Callback to trigger widget configuration (folder/url/file selection). */
  onConfigure?: () => void;
}

/** Render tile content (icon or widget) with shared layout styles. */
export default function DesktopTileContent({
  item,
  scope,
  webContext,
  onWebOpen,
  onConfigure,
}: DesktopTileContentProps) {
  const { t } = useTranslation('desktop');
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
      if (iconKey === "settings" && scope === "global") {
        openSettingsTab();
        return;
      }
      if (iconKey === "agent-settings") {
        useLayoutState.getState().pushStackItem({
          id: "agent-management",
          sourceKey: "agent-management",
          component: "agent-management",
          title: t('iconCatalog.agent-settings'),
        });
        return;
      }
      if (iconKey === "skill-settings") {
        const projectId = scope === "project" ? webContext?.projectId : undefined;
        useLayoutState.getState().pushStackItem({
          id: "skill-settings",
          sourceKey: "skill-settings",
          component: "skill-settings",
          title: t('iconCatalog.skill-settings'),
          ...(projectId ? { params: { projectId } } : {}),
        });
        return;
      }
      const nextTab =
        iconKey === "tasks" ? "tasks" : iconKey === "settings" ? "settings" : "files";
      if (!openCurrentProjectShellTab({ tab: nextTab })) {
        toast.error(t('content.openProjectTab'));
        return;
      }
    },
    [scope, setSearchOpen, t]
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
    const isWide = item.layout.w >= 2;
    return (
      <button
        type="button"
        className="group flex h-full w-full items-center justify-center p-2"
        onClick={() => handleIconClick(item.iconKey)}
        aria-label={t('iconCatalog.' + item.iconKey, { defaultValue: item.title })}
      >
        <div className={
          isWide
            ? "inline-flex flex-row items-center gap-2.5"
            : "flex flex-col items-center gap-1"
        }>
          <div className={
            isWide
              ? "flex size-8 shrink-0 items-center justify-center rounded-3xl text-foreground transition-transform duration-200 ease-out group-hover:scale-110"
              : "flex size-10 items-center justify-center rounded-3xl text-foreground transition-transform duration-200 ease-out group-hover:-translate-y-1 group-hover:rotate-3 group-hover:scale-110"
          }>
            {item.icon}
          </div>
          {isWide ? (
            <span className="whitespace-nowrap text-xs font-medium text-foreground transition-transform duration-200 ease-out group-hover:scale-[1.03]">
              {t('iconCatalog.' + item.iconKey, { defaultValue: item.title })}
            </span>
          ) : (
            <DesktopIconLabel className="-mt-0.5 transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:scale-[1.03]">
              {t('iconCatalog.' + item.iconKey, { defaultValue: item.title })}
            </DesktopIconLabel>
          )}
        </div>
      </button>
    );
  }

  if (widgetKey === "flip-clock") {
    return (
      <div className="flex h-full w-full items-center justify-center p-2">
        <FlipClockWidget
          variant={item.variant as 'hm' | 'hms' | undefined}
          showSeconds={item.flipClock?.showSeconds ?? true}
        />
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

  if (widgetKey === "calendar") {
    return (
      <div className="h-full w-full p-2">
        <CalendarWidget
          tabId={undefined}
          variant={item.variant as 'month' | 'week' | 'day' | 'full' | undefined}
        />
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
        className="relative flex h-full w-full items-center justify-center p-2"
      >
        <ThreeDFolderWidget
          title={item.title}
          folderUri={item.folderUri}
          hovered={isHovered}
        />
        {!item.folderUri && onConfigure ? (
          <WidgetConfigOverlay onConfigure={onConfigure} label={t('content.selectFolder')} />
        ) : null}
      </div>
    );
  }

  if (widgetKey === "video") {
    return (
      <div className="relative flex h-full w-full flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-medium">{item.title}</div>
        </div>
        <div className="mt-3 min-h-0 flex-1">
          <VideoWidget fileRef={item.videoFileRef} title={item.title} />
        </div>
        {!item.videoFileRef && onConfigure ? (
          <WidgetConfigOverlay onConfigure={onConfigure} label={t('content.selectVideo')} />
        ) : null}
      </div>
    );
  }

  if (widgetKey === "web-stack" && item.kind === "widget") {
    return (
      <div className="relative h-full w-full">
        <WebStackWidget
          item={item}
          projectId={webContext?.projectId}
          onOpen={onWebOpen}
        />
        {!item.webUrl && onConfigure ? (
          <WidgetConfigOverlay onConfigure={onConfigure} label={t('content.setUrl')} />
        ) : null}
      </div>
    );
  }

  if (widgetKey === "task-board") {
    return (
      <div className="h-full w-full p-2">
        <TaskBoardWidget />
      </div>
    );
  }

  if (widgetKey === "help") {
    return (
      <div className="h-full w-full">
        <HelpWidget />
      </div>
    );
  }

  if (widgetKey === "dynamic" && item.kind === "widget" && item.dynamicWidgetId) {
    return (
      <div className="h-full w-full">
        <DynamicWidgetRenderer
          widgetId={item.dynamicWidgetId}
          projectId={item.dynamicProjectId}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm font-medium">{widgetKey ? t('catalog.' + widgetKey, { defaultValue: item.title }) : item.title}</div>
      </div>
      <div className="mt-3 min-h-0 flex-1">
        {widgetKey === "clock" ? <ClockWidget variant={item.variant as 'hm' | 'hms' | undefined} /> : <QuickActionsWidget scope={scope} />}
      </div>
    </div>
  );
}
