"use client";

import * as React from "react";
import { useTabs } from "@/hooks/use-tabs";
import { useProjects } from "@/hooks/use-projects";
import { Input } from "@tenas-ai/ui/input";
import ProjectFileSystemTransferDialog from "@/components/project/filesystem/components/ProjectFileSystemTransferDialog";
import type { DesktopWidgetItem } from "./types";
import { desktopWidgetCatalog } from "./widget-catalog";
import ClockWidget from "./widgets/ClockWidget";
import FlipClockWidget from "./widgets/FlipClockWidget";
import QuickActionsWidget from "./widgets/QuickActionsWidget";
import ThreeDFolderWidget from "./widgets/ThreeDFolderWidget";
import VideoWidget from "./widgets/VideoWidget";
import type { ProjectNode } from "@tenas-ai/api/services/projectTreeService";
import {
  formatScopedProjectPath,
  getRelativePathFromUri,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";

// 组件选择事件名称。
export const DESKTOP_WIDGET_SELECTED_EVENT = "tenas:desktop-widget-selected";

/** Payload for a desktop widget selection event. */
export type DesktopWidgetSelectedDetail = {
  /** Target tab id to receive the selection. */
  tabId: string;
  /** Widget key to insert. */
  widgetKey: DesktopWidgetItem["widgetKey"];
  /** Optional widget title override. */
  title?: string;
  /** Optional folder uri for 3d-folder widget. */
  folderUri?: string;
  /** Optional pointer X for placement start. */
  clientX?: number;
  /** Optional pointer Y for placement start. */
  clientY?: number;
};

/** Emit a desktop widget selection event (stack -> desktop page bridge). */
function emitDesktopWidgetSelected(detail: DesktopWidgetSelectedDetail) {
  // 逻辑：stack 面板与桌面渲染处于不同的 React 树，使用 CustomEvent 做一次轻量桥接。
  window.dispatchEvent(new CustomEvent<DesktopWidgetSelectedDetail>(DESKTOP_WIDGET_SELECTED_EVENT, { detail }));
}

/** Render a widget entity preview for the catalog grid. */
function WidgetEntityPreview({ widgetKey }: { widgetKey: DesktopWidgetItem["widgetKey"] }) {
  if (widgetKey === "clock") return <ClockWidget />;
  if (widgetKey === "flip-clock") return <FlipClockWidget />;
  if (widgetKey === "quick-actions") return <QuickActionsWidget />;
  if (widgetKey === "3d-folder") return <ThreeDFolderWidget />;
  if (widgetKey === "video") return <VideoWidget />;
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

/** Check whether a target uri is under a project root uri. */
function isUriUnderRoot(rootUri: string, targetUri: string) {
  try {
    const rootUrl = new URL(rootUri);
    const targetUrl = new URL(targetUri);
    if (rootUrl.protocol !== targetUrl.protocol || rootUrl.hostname !== targetUrl.hostname) {
      return false;
    }
    const rootParts = rootUrl.pathname.split("/").filter(Boolean);
    const targetParts = targetUrl.pathname.split("/").filter(Boolean);
    return rootParts.every((part, index) => part === targetParts[index]);
  } catch {
    return false;
  }
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
  const removeStackItem = useTabs((s) => s.removeStackItem);
  // 过滤关键字。
  const [query, setQuery] = React.useState("");
  // 项目列表（用于解析项目目录引用）。
  const projectListQuery = useProjects();
  const projectRoots = React.useMemo(
    () => flattenProjectTree(projectListQuery.data),
    [projectListQuery.data]
  );
  // 3D 文件夹选择对话框状态。
  const [isFolderDialogOpen, setIsFolderDialogOpen] = React.useState(false);
  const [pendingFolderWidget, setPendingFolderWidget] =
    React.useState<DesktopWidgetItem["widgetKey"] | null>(null);

  /** Resolve the selected folder into a scoped relative path. */
  const resolveFolderSelection = React.useCallback(
    (targetUri: string) => {
      const parsed = parseScopedProjectPath(targetUri);
      if (parsed) {
        const project = projectRoots.find((item) => item.projectId === parsed.projectId);
        const relativeParts = parsed.relativePath.split("/").filter(Boolean);
        const title =
          relativeParts[relativeParts.length - 1] || project?.title || "Folder";
        const folderUri = formatScopedProjectPath({
          projectId: parsed.projectId,
          relativePath: parsed.relativePath,
          includeAt: true,
        });
        return { folderUri, title };
      }
      // 使用项目根目录匹配目标路径，生成带 projectId 的相对路径引用。
      for (const project of projectRoots) {
        if (!isUriUnderRoot(project.rootUri, targetUri)) continue;
        const relativePath = getRelativePathFromUri(project.rootUri, targetUri);
        const folderUri = formatScopedProjectPath({
          projectId: project.projectId,
          relativePath,
          includeAt: true,
        });
        const relativeParts = relativePath.split("/").filter(Boolean);
        const title =
          relativeParts[relativeParts.length - 1] || project.title || "Folder";
        return { folderUri, title };
      }
      return null;
    },
    [projectRoots]
  );

  /** Sync dialog open state and reset pending selection. */
  const handleFolderDialogOpenChange = React.useCallback((open: boolean) => {
    setIsFolderDialogOpen(open);
    if (!open) {
      setPendingFolderWidget(null);
    }
  }, []);

  /** Create a 3D folder widget after user selection. */
  const handleSelectFolder = React.useCallback(
    (targetUri: string) => {
      if (!pendingFolderWidget) return;
      const resolved = resolveFolderSelection(targetUri);
      if (!resolved) return;
      emitDesktopWidgetSelected({
        tabId,
        widgetKey: pendingFolderWidget,
        title: resolved.title,
        folderUri: resolved.folderUri,
      });
      removeStackItem(tabId, panelKey);
    },
    [panelKey, pendingFolderWidget, removeStackItem, resolveFolderSelection, tabId]
  );

  // 过滤后的组件列表。
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return desktopWidgetCatalog;
    return desktopWidgetCatalog.filter((item) => item.title.toLowerCase().includes(q));
  }, [query]);

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
                if (item.widgetKey === "3d-folder") {
                  // 中文注释：3D 文件夹需要先选择目录。
                  setPendingFolderWidget(item.widgetKey);
                  setIsFolderDialogOpen(true);
                  return;
                }
                emitDesktopWidgetSelected({
                  tabId,
                  widgetKey: item.widgetKey,
                  clientX: event.clientX,
                  clientY: event.clientY,
                });
                removeStackItem(tabId, panelKey);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                if (item.widgetKey === "3d-folder") {
                  // 中文注释：键盘操作需要弹出目录选择框。
                  setPendingFolderWidget(item.widgetKey);
                  setIsFolderDialogOpen(true);
                  return;
                }
                emitDesktopWidgetSelected({
                  tabId,
                  widgetKey: item.widgetKey,
                });
                removeStackItem(tabId, panelKey);
              }}
            >
              <div className="pointer-events-none flex h-28 items-center justify-center overflow-hidden rounded-lg border border-border bg-card p-2">
                <div className="h-full w-full origin-center scale-[0.8]">
                  <WidgetEntityPreview widgetKey={item.widgetKey} />
                </div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{item.title}</div>
              </div>
            </div>
          ))}

          {filtered.length === 0 ? (
            <div className="col-span-full rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              没有匹配的组件
            </div>
          ) : null}
        </div>
      </div>
      <ProjectFileSystemTransferDialog
        open={isFolderDialogOpen}
        onOpenChange={handleFolderDialogOpenChange}
        mode="select"
        selectTarget="folder"
        onSelectTarget={handleSelectFolder}
      />
    </div>
  );
}
