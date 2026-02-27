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
import { useQueries, useQuery } from "@tanstack/react-query";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useTabs } from "@/hooks/use-tabs";
import { useProjects } from "@/hooks/use-projects";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { Input } from "@openloaf/ui/input";
import { Button } from "@openloaf/ui/button";
import type { DesktopIconKey, DesktopScope, DesktopWidgetItem } from "./types";
import { desktopWidgetCatalog } from "./widget-catalog";
import { desktopIconCatalog } from "./desktop-icon-catalog";
import DesktopIconWidget from "./widgets/DesktopIconWidget";
import ClockWidget from "./widgets/ClockWidget";
import ChatHistoryWidget from "./widgets/ChatHistoryWidget";
import FlipClockWidget from "./widgets/FlipClockWidget";
import QuickActionsWidget from "./widgets/QuickActionsWidget";
import ThreeDFolderWidget from "./widgets/ThreeDFolderWidget";
import VideoWidget from "./widgets/VideoWidget";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";
import { trpc, trpcClient } from "@/utils/trpc";

// 组件选择事件名称。
export const DESKTOP_WIDGET_SELECTED_EVENT = "openloaf:desktop-widget-selected";

/** Payload for a desktop widget selection event. */
export type DesktopWidgetSelectedDetail = {
  /** Target tab id to receive the selection. */
  tabId: string;
  /** Widget key to insert (when adding a widget). */
  widgetKey: DesktopWidgetItem["widgetKey"] | "__icon__";
  /** Icon key to insert (when adding an icon). */
  iconKey?: DesktopIconKey;
  /** Optional widget title override. */
  title?: string;
  /** Optional folder uri for 3d-folder widget. */
  folderUri?: string;
  /** Optional web url for web-stack widget. */
  webUrl?: string;
  /** Optional web title for web-stack widget. */
  webTitle?: string;
  /** Optional web description for web-stack widget. */
  webDescription?: string;
  /** Optional web logo path for web-stack widget. */
  webLogo?: string;
  /** Optional web preview path for web-stack widget. */
  webPreview?: string;
  /** Optional web meta status for web-stack widget. */
  webMetaStatus?: DesktopWidgetItem["webMetaStatus"];
  /** Optional dynamic widget id for dynamic widgets. */
  dynamicWidgetId?: string;
  /** Optional project id that owns the dynamic widget. */
  dynamicProjectId?: string;
};

/** Emit a desktop widget selection event (stack -> desktop page bridge). */
function emitDesktopWidgetSelected(detail: DesktopWidgetSelectedDetail) {
  // 逻辑：stack 面板与桌面渲染处于不同的 React 树，使用 CustomEvent 做一次轻量桥接。
  window.dispatchEvent(new CustomEvent<DesktopWidgetSelectedDetail>(DESKTOP_WIDGET_SELECTED_EVENT, { detail }));
}

/** Render a widget entity preview for the catalog grid. */
function WidgetEntityPreview({
  widgetKey,
  scope,
}: {
  widgetKey: DesktopWidgetItem["widgetKey"];
  scope: DesktopScope;
}) {
  if (widgetKey === "clock") return <ClockWidget />;
  if (widgetKey === "chat-history") return <ChatHistoryWidget />;
  if (widgetKey === "calendar") {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/30 text-xs text-muted-foreground">
        日历
      </div>
    );
  }
  if (widgetKey === "email-inbox") {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/30 text-xs text-muted-foreground">
        邮箱
      </div>
    );
  }
  if (widgetKey === "flip-clock") return <FlipClockWidget />;
  if (widgetKey === "quick-actions") return <QuickActionsWidget scope={scope} />;
  if (widgetKey === "3d-folder") return <ThreeDFolderWidget />;
  if (widgetKey === "video") return <VideoWidget />;
  if (widgetKey === "web-stack") {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/30 text-xs text-muted-foreground">
        网页
      </div>
    );
  }
  return <div className="text-sm text-muted-foreground">Widget</div>;
}

type ProjectRootInfo = {
  /** Project id. */
  projectId: string;
  /** Project root uri. */
  rootUri: string;
  /** Project display title. */
  title: string;
};

/** Flatten the project tree into root info entries. */
function flattenProjectTree(nodes?: ProjectNode[]): ProjectRootInfo[] {
  const results: ProjectRootInfo[] = [];
  const walk = (items?: ProjectNode[]) => {
    items?.forEach((item) => {
      results.push({ projectId: item.projectId, rootUri: item.rootUri, title: item.title });
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };
  walk(nodes);
  return results;
}

export interface DesktopWidgetLibraryPanelProps {
  /** Panel identity from DockItem.id. */
  panelKey: string;
  /** Current tab id (used for event targeting and closing the stack item). */
  tabId: string;
}

/**
 * Render a desktop widget library for insertion (stack panel).
 */
export default function DesktopWidgetLibraryPanel({
  panelKey,
  tabId,
}: DesktopWidgetLibraryPanelProps) {
  // 当前 tab 的 stack 删除方法。
  const removeStackItem = useTabRuntime((s) => s.removeStackItem);
  // 过滤关键字。
  const [query, setQuery] = React.useState("");
  // 项目列表（用于解析项目目录引用）。
  const projectListQuery = useProjects();
  const { workspace } = useWorkspace();
  const projectRoots = React.useMemo(
    () => flattenProjectTree(projectListQuery.data),
    [projectListQuery.data]
  );
  const tabRuntime = useTabRuntime((s) => s.runtimeByTabId[tabId]);
  const tabBaseParams = tabRuntime?.base?.params as Record<string, unknown> | undefined;
  // 中文注释：根据 tab base 是否包含 projectId 判断作用域。
  const scope: DesktopScope =
    typeof tabBaseParams?.projectId === "string" ? "project" : "workspace";

  // 过滤后的组件列表。
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const scopedCatalog = desktopWidgetCatalog.filter((item) => item.support[scope]);
    if (!q) return scopedCatalog;
    return scopedCatalog.filter((item) => item.title.toLowerCase().includes(q));
  }, [query, scope]);

  // 过滤后的图标列表。
  const filteredIcons = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const scopedIcons = desktopIconCatalog.filter((item) => item.support[scope]);
    if (!q) return scopedIcons;
    return scopedIcons.filter((item) => item.title.toLowerCase().includes(q));
  }, [query, scope]);

  // Query workspace-level dynamic widgets (no projectId).
  const workspaceId = workspace?.id
  const workspaceWidgetQuery = useQuery({
    ...trpc.dynamicWidget.list.queryOptions({ workspaceId: workspaceId ?? '' }),
    enabled: Boolean(workspaceId),
    select: (data: { id: string; name: string; description?: string }[]) =>
      data.map((w) => ({ ...w, projectId: undefined as string | undefined })),
  })

  // Query dynamic widgets from all projects.
  const dynamicWidgetQueries = useQueries({
    queries: projectRoots.map((p) => ({
      ...trpc.dynamicWidget.list.queryOptions({ workspaceId: workspaceId ?? '', projectId: p.projectId }),
      select: (data: { id: string; name: string; description?: string }[]) =>
        data.map((w) => ({ ...w, projectId: p.projectId as string | undefined })),
    })),
  })
  const dynamicWidgets = React.useMemo(
    () => [
      ...(workspaceWidgetQuery.data ?? []),
      ...dynamicWidgetQueries.flatMap((q) => q.data ?? []),
    ],
    [workspaceWidgetQuery.data, dynamicWidgetQueries],
  )
  const refetchDynamicWidgets = React.useCallback(() => {
    workspaceWidgetQuery.refetch()
    dynamicWidgetQueries.forEach((q) => q.refetch())
  }, [workspaceWidgetQuery, dynamicWidgetQueries])
  const filteredDynamic = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return dynamicWidgets
    return dynamicWidgets.filter(
      (w) => w.name.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q),
    )
  }, [query, dynamicWidgets])

  return (
    <div className="flex h-full w-full min-h-0 flex-col gap-3 p-3">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索组件…" />

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div
              key={item.widgetKey}
              role="button"
              tabIndex={0}
              className="group flex min-w-0 flex-col gap-2 rounded-xl border border-border/60 bg-background p-2 text-left hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={(event) => {
                emitDesktopWidgetSelected({
                  tabId,
                  widgetKey: item.widgetKey,
                });
                removeStackItem(tabId, panelKey);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                emitDesktopWidgetSelected({
                  tabId,
                  widgetKey: item.widgetKey,
                });
                removeStackItem(tabId, panelKey);
              }}
            >
              <div className="pointer-events-none flex h-28 items-center justify-center overflow-hidden rounded-lg border border-border bg-card p-2">
                <div className="h-full w-full origin-center scale-[0.8]">
                  <WidgetEntityPreview widgetKey={item.widgetKey} scope={scope} />
                </div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{item.title}</div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && filteredIcons.length === 0 ? (
            <div className="col-span-full rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              没有匹配的组件
            </div>
          ) : null}
        </div>

        {filteredIcons.length > 0 ? (
          <>
            <div className="mt-4 mb-2">
              <div className="text-xs font-medium text-muted-foreground">快捷方式</div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {filteredIcons.map((item) => (
                <div
                  key={item.iconKey}
                  role="button"
                  tabIndex={0}
                  className="group flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-background p-3 text-center hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => {
                    emitDesktopWidgetSelected({
                      tabId,
                      widgetKey: "__icon__",
                      iconKey: item.iconKey,
                      title: item.title,
                    });
                    removeStackItem(tabId, panelKey);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    emitDesktopWidgetSelected({
                      tabId,
                      widgetKey: "__icon__",
                      iconKey: item.iconKey,
                      title: item.title,
                    });
                    removeStackItem(tabId, panelKey);
                  }}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
                    <DesktopIconWidget iconKey={item.iconKey} />
                  </div>
                  <div className="truncate text-xs font-medium">{item.title}</div>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {filteredDynamic.length > 0 ? (
          <>
            <div className="mt-4 mb-2 flex items-center justify-between">
              <div className="text-xs font-medium text-muted-foreground">AI 生成</div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  if (!workspace?.id) return;
                  const addTab = useTabs.getState().addTab;
                  addTab({
                    workspaceId: workspace.id,
                    createNew: true,
                    title: "AI 助手",
                    icon: "sparkles",
                    leftWidthPercent: 100,
                    base: undefined,
                  });
                  removeStackItem(tabId, panelKey);
                }}
              >
                + 新建
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDynamic.map((dw) => (
                <div
                  key={dw.id}
                  role="button"
                  tabIndex={0}
                  className="group relative flex min-w-0 flex-col gap-2 rounded-xl border border-border/60 bg-background p-2 text-left hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => {
                    emitDesktopWidgetSelected({
                      tabId,
                      widgetKey: "dynamic",
                      title: dw.name,
                      dynamicWidgetId: dw.id,
                      dynamicProjectId: dw.projectId,
                    });
                    removeStackItem(tabId, panelKey);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    emitDesktopWidgetSelected({
                      tabId,
                      widgetKey: "dynamic",
                      title: dw.name,
                      dynamicWidgetId: dw.id,
                      dynamicProjectId: dw.projectId,
                    });
                    removeStackItem(tabId, panelKey);
                  }}
                >
                  <button
                    type="button"
                    className="absolute top-1.5 right-1.5 z-10 hidden rounded-md p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!confirm(`确定删除 Widget "${dw.name}"？`)) return;
                      trpcClient.dynamicWidget.delete.mutate({ workspaceId: workspaceId ?? '', projectId: dw.projectId, widgetId: dw.id }).then(() => {
                        refetchDynamicWidgets();
                      });
                    }}
                    aria-label={`删除 ${dw.name}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                  <div className="pointer-events-none flex h-28 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border/60 bg-muted/30 text-xs text-muted-foreground">
                    {dw.description || dw.name}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{dw.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-4">
            <div className="mb-2 text-xs font-medium text-muted-foreground">AI 生成</div>
            <button
              type="button"
              className="w-full rounded-xl border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground hover:bg-accent"
              onClick={() => {
                if (!workspace?.id) return;
                const addTab = useTabs.getState().addTab;
                addTab({
                  workspaceId: workspace.id,
                  createNew: true,
                  title: "AI 助手",
                  icon: "sparkles",
                  leftWidthPercent: 100,
                  base: undefined,
                });
                removeStackItem(tabId, panelKey);
              }}
            >
              通过 AI 对话生成自定义 Widget
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
