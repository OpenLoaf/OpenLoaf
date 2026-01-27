"use client";

import * as React from "react";
import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from "@tenas-ai/api/common";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { createBrowserTabId } from "@/hooks/tab-id";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { normalizeUrl } from "@/components/browser/browser-utils";
import { getPreviewEndpoint } from "@/lib/image/uri";
import { cn } from "@/lib/utils";
import type { DesktopWidgetItem } from "../types";

type WebStackWidgetProps = {
  item: DesktopWidgetItem;
};

/** Render a web stack widget with size-based variants. */
export default function WebStackWidget({ item }: WebStackWidgetProps) {
  const { workspace } = useWorkspace();
  const activeTabId = useTabs((s) => s.activeTabId);
  const tabs = useTabs((s) => s.tabs);
  const tabRuntime = useTabRuntime((s) =>
    activeTabId ? s.runtimeByTabId[activeTabId] : undefined
  );
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const tabParams = tabRuntime?.base?.params as Record<string, unknown> | undefined;
  const projectId =
    typeof tabParams?.projectId === "string"
      ? String(tabParams.projectId)
      : typeof activeTab?.chatParams?.projectId === "string"
        ? String(activeTab.chatParams.projectId)
        : undefined;
  const workspaceId = workspace?.id ?? activeTab?.workspaceId;
  const normalizedUrl = normalizeUrl(item.webUrl ?? "");
  const displayTitle = item.title || item.webTitle || "";
  const description = item.webDescription || "";
  const logoSrc = item.webLogo
    ? getPreviewEndpoint(item.webLogo, { projectId, workspaceId })
    : "";
  const previewSrc = item.webPreview
    ? getPreviewEndpoint(item.webPreview, { projectId, workspaceId })
    : "";
  const isLoading = item.webMetaStatus === "loading";

  const layout = item.layout;
  const isMini = layout.w === 1 && layout.h === 1;
  const isTitleMode = layout.h === 1 && layout.w <= 4;
  const isPreviewMode = layout.h > 1;

  const hostname = React.useMemo(() => {
    if (!normalizedUrl) return "";
    try {
      return new URL(normalizedUrl).hostname;
    } catch {
      return normalizedUrl;
    }
  }, [normalizedUrl]);

  const handleOpen = React.useCallback(() => {
    if (!activeTabId || !normalizedUrl) return;
    const tab = useTabs.getState().getTabById(activeTabId);
    if (!tab) return;
    const viewKey = createBrowserTabId();
    useTabRuntime.getState().pushStackItem(
      activeTabId,
      {
        id: BROWSER_WINDOW_PANEL_ID,
        sourceKey: BROWSER_WINDOW_PANEL_ID,
        component: BROWSER_WINDOW_COMPONENT,
        params: { __customHeader: true, __open: { url: normalizedUrl, title: displayTitle, viewKey } },
      } as any,
      100
    );
  }, [activeTabId, displayTitle, normalizedUrl]);

  if (isMini) {
    return (
      <button
        type="button"
        className="relative flex h-full w-full flex-col items-center justify-center gap-1 p-2"
        onClick={handleOpen}
        disabled={!normalizedUrl}
      >
        {logoSrc ? (
          <img src={logoSrc} alt={displayTitle} className="h-10 w-10 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-xs font-medium text-muted-foreground">
            {displayTitle.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="line-clamp-1 text-xs font-medium text-foreground">{displayTitle}</div>
        {isLoading ? (
          <div className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
            更新中
          </div>
        ) : null}
      </button>
    );
  }

  if (isTitleMode) {
    return (
      <button
        type="button"
        className="relative flex h-full w-full items-center gap-3 px-3 py-2 text-left"
        onClick={handleOpen}
        disabled={!normalizedUrl}
      >
        {logoSrc ? (
          <img src={logoSrc} alt={displayTitle} className="h-9 w-9 rounded-xl object-cover" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-xs font-medium text-muted-foreground">
            {displayTitle.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{displayTitle}</div>
          <div className="truncate text-xs text-muted-foreground">
            {description || hostname}
          </div>
        </div>
        {isLoading ? (
          <div className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
            更新中
          </div>
        ) : null}
      </button>
    );
  }

  if (isPreviewMode) {
    return (
      <button
        type="button"
        className="relative flex h-full w-full items-end overflow-hidden"
        onClick={handleOpen}
        disabled={!normalizedUrl}
      >
        {previewSrc ? (
          <img src={previewSrc} alt={displayTitle} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted/50 to-muted" />
        )}
        {isLoading ? (
          <div className="absolute right-3 top-3 z-10 rounded-full bg-background/90 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
            更新中
          </div>
        ) : null}
        <div className="relative z-10 flex w-full items-center gap-3 bg-background/80 p-3 backdrop-blur">
          {logoSrc ? (
            <img src={logoSrc} alt={displayTitle} className="h-9 w-9 rounded-xl object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-xs font-medium text-muted-foreground">
              {displayTitle.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-medium text-foreground">{displayTitle}</div>
            <div className="truncate text-xs text-muted-foreground">
              {description || hostname}
            </div>
          </div>
          <div
            className={cn(
              "rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-medium text-foreground",
              "shadow-sm"
            )}
          >
            打开网页
          </div>
        </div>
      </button>
    );
  }

  return null;
}
