"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useTabs } from "@/hooks/use-tabs";
import { useProjects } from "@/hooks/use-projects";
import ProjectFileSystemTransferDialog from "@/components/project/filesystem/components/ProjectFileSystemTransferDialog";
import { desktopWidgetCatalog } from "./widget-catalog";
import type { DesktopItem } from "./types";
import {
  createLayoutByBreakpoint,
  getItemLayoutForBreakpoint,
  type DesktopBreakpoint,
} from "./desktop-breakpoints";
import {
  DESKTOP_WIDGET_SELECTED_EVENT,
  type DesktopWidgetSelectedDetail,
} from "./DesktopWidgetLibraryPanel";
import type { ProjectNode } from "@tenas-ai/api/services/projectTreeService";
import {
  buildTenasFileUrl,
  getRelativePathFromUri,
} from "@/components/project/filesystem/utils/file-system-utils";

// 组件库面板标识。
const DESKTOP_WIDGET_LIBRARY_COMPONENT = "desktop-widget-library";
// 组件库面板 ID。
const DESKTOP_WIDGET_LIBRARY_PANEL_ID = "desktop-widget-library";

type WidgetCreateOptions = {
  /** Optional widget title override. */
  title?: string;
  /** Optional folder uri for 3d-folder widget. */
  folderUri?: string;
};

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

/** Build a new widget item based on catalog metadata. */
function createWidgetItem(
  widgetKey: DesktopWidgetSelectedDetail["widgetKey"],
  items: DesktopItem[],
  breakpoint: DesktopBreakpoint,
  options?: WidgetCreateOptions
) {
  const catalogItem = desktopWidgetCatalog.find((item) => item.widgetKey === widgetKey);
  if (!catalogItem) return null;

  const { constraints } = catalogItem;
  // 逻辑：追加到当前内容底部，避免覆盖已存在的组件。
  const maxY = items.reduce((acc, item) => {
    const layout = getItemLayoutForBreakpoint(item, breakpoint);
    return Math.max(acc, layout.y + layout.h);
  }, 0);
  // 逻辑：Flip Clock 默认展示秒数。
  const flipClock = widgetKey === "flip-clock" ? { showSeconds: true } : undefined;
  const layout = { x: 0, y: maxY, w: constraints.defaultW, h: constraints.defaultH };

  const title = options?.title ?? catalogItem.title;

  return {
    id: `w-${widgetKey}-${Date.now()}`,
    kind: "widget" as const,
    title,
    widgetKey: catalogItem.widgetKey,
    size: catalogItem.size,
    constraints,
    flipClock,
    folderUri: widgetKey === "3d-folder" ? options?.folderUri : undefined,
    layout,
    layoutByBreakpoint: createLayoutByBreakpoint(layout),
  };
}

export interface DesktopEditToolbarProps {
  /** Mount point for header controls. */
  controlsTarget: HTMLDivElement | null;
  /** Whether desktop is in edit mode. */
  editMode: boolean;
  /** Current edit breakpoint. */
  activeBreakpoint: DesktopBreakpoint;
  /** Current desktop items. */
  items: DesktopItem[];
  /** Update breakpoint selection. */
  onChangeBreakpoint: (breakpoint: DesktopBreakpoint) => void;
  /** Append a new desktop item. */
  onAddItem: (item: DesktopItem) => void;
  /** Compact current layout. */
  onCompact: () => void;
  /** Cancel edits and exit edit mode. */
  onCancel: () => void;
  /** Finish edits and exit edit mode. */
  onDone: () => void;
}

/** Render desktop edit toolbar actions in the header slot. */
export default function DesktopEditToolbar({
  controlsTarget,
  editMode,
  activeBreakpoint,
  items,
  onChangeBreakpoint,
  onAddItem,
  onCompact,
  onCancel,
  onDone,
}: DesktopEditToolbarProps) {
  // 当前激活的 tab。
  const activeTabId = useTabs((s) => s.activeTabId);
  // 打开 stack 面板的方法。
  const pushStackItem = useTabs((s) => s.pushStackItem);
  // 项目列表（用于解析 tenas-file 目录引用）。
  const projectListQuery = useProjects();
  const projectRoots = React.useMemo(
    () => flattenProjectTree(projectListQuery.data),
    [projectListQuery.data]
  );
  // 3D 文件夹选择对话框状态。
  const [isFolderDialogOpen, setIsFolderDialogOpen] = React.useState(false);
  const [pendingFolderWidget, setPendingFolderWidget] =
    React.useState<DesktopWidgetSelectedDetail["widgetKey"] | null>(null);

  /** Resolve the selected folder into tenas-file metadata. */
  const resolveFolderSelection = React.useCallback(
    (targetUri: string) => {
      // 中文注释：使用项目根目录匹配目标路径，生成 tenas-file 协议引用。
      for (const project of projectRoots) {
        if (!isUriUnderRoot(project.rootUri, targetUri)) continue;
        const relativePath = getRelativePathFromUri(project.rootUri, targetUri);
        const folderUri = buildTenasFileUrl(project.projectId, relativePath);
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
      const nextItem = createWidgetItem(
        pendingFolderWidget,
        items,
        activeBreakpoint,
        {
          title: resolved.title,
          folderUri: resolved.folderUri,
        }
      );
      if (!nextItem) return;
      onAddItem(nextItem);
    },
    [activeBreakpoint, items, onAddItem, pendingFolderWidget, resolveFolderSelection]
  );

  /** Open the desktop widget library stack panel. */
  const handleOpenWidgetLibrary = React.useCallback(() => {
    if (!activeTabId) return;
    pushStackItem(activeTabId, {
      id: DESKTOP_WIDGET_LIBRARY_PANEL_ID,
      sourceKey: DESKTOP_WIDGET_LIBRARY_PANEL_ID,
      component: DESKTOP_WIDGET_LIBRARY_COMPONENT,
      title: "组件库",
    });
  }, [activeTabId, pushStackItem]);

  React.useEffect(() => {
    /** Handle widget selection event from the stack panel. */
    const handleWidgetSelected = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as DesktopWidgetSelectedDetail | undefined;
      if (!detail) return;
      if (activeTabId && detail.tabId !== activeTabId) return;

      if (detail.widgetKey === "3d-folder") {
        // 中文注释：3D 文件夹需要用户选择目录后再创建组件。
        setPendingFolderWidget(detail.widgetKey);
        setIsFolderDialogOpen(true);
        return;
      }

      const nextItem = createWidgetItem(detail.widgetKey, items, activeBreakpoint);
      if (!nextItem) return;
      onAddItem(nextItem);
    };

    window.addEventListener(DESKTOP_WIDGET_SELECTED_EVENT, handleWidgetSelected as EventListener);
    return () => {
      window.removeEventListener(DESKTOP_WIDGET_SELECTED_EVENT, handleWidgetSelected as EventListener);
    };
  }, [activeBreakpoint, activeTabId, items, onAddItem]);

  if (!controlsTarget || !editMode) return null;

  return (
    <>
      {createPortal(
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
            <Button
              type="button"
              variant={activeBreakpoint === "sm" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onChangeBreakpoint("sm")}
            >
              小屏
            </Button>
            <Button
              type="button"
              variant={activeBreakpoint === "md" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onChangeBreakpoint("md")}
            >
              中屏
            </Button>
            <Button
              type="button"
              variant={activeBreakpoint === "lg" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onChangeBreakpoint("lg")}
            >
              大屏
            </Button>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleOpenWidgetLibrary}
          >
            添加组件
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onCompact}
          >
            整理
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onCancel}
          >
            取消
          </Button>
          <Button type="button" variant="default" size="sm" className="h-7 px-2 text-xs" onClick={onDone}>
            完成
          </Button>
        </div>,
        controlsTarget
      )}
      <ProjectFileSystemTransferDialog
        open={isFolderDialogOpen}
        onOpenChange={handleFolderDialogOpenChange}
        mode="select"
        selectTarget="folder"
        onSelectTarget={handleSelectFolder}
      />
    </>
  );
}
