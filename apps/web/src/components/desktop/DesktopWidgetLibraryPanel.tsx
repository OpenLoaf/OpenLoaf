"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useProjects } from "@/hooks/use-projects";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { normalizeUrl } from "@/components/browser/browser-utils";
import { Input } from "@tenas-ai/ui/input";
import { Button } from "@tenas-ai/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tenas-ai/ui/dialog";
import ProjectFileSystemTransferDialog from "@/components/project/filesystem/components/ProjectFileSystemTransferDialog";
import type { DesktopScope, DesktopWidgetItem } from "./types";
import { desktopWidgetCatalog } from "./widget-catalog";
import ClockWidget from "./widgets/ClockWidget";
import ChatHistoryWidget from "./widgets/ChatHistoryWidget";
import FlipClockWidget from "./widgets/FlipClockWidget";
import QuickActionsWidget from "./widgets/QuickActionsWidget";
import ThreeDFolderWidget from "./widgets/ThreeDFolderWidget";
import VideoWidget from "./widgets/VideoWidget";
import type { ProjectNode } from "@tenas-ai/api/services/projectTreeService";
import { trpc, trpcClient } from "@/utils/trpc";
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
  const projectRootUri =
    typeof tabBaseParams?.rootUri === "string" ? String(tabBaseParams.rootUri) : undefined;
  // 中文注释：根据 tab base 是否包含 projectId 判断作用域。
  const scope: DesktopScope =
    typeof tabBaseParams?.projectId === "string" ? "project" : "workspace";
  const defaultRootUri = projectRootUri || workspace?.rootUri;
  // 3D 文件夹选择对话框状态。
  const [isFolderDialogOpen, setIsFolderDialogOpen] = React.useState(false);
  const [pendingFolderWidget, setPendingFolderWidget] =
    React.useState<DesktopWidgetItem["widgetKey"] | null>(null);
  // 网页组件创建对话框状态。
  const [isWebDialogOpen, setIsWebDialogOpen] = React.useState(false);
  const [webUrlInput, setWebUrlInput] = React.useState("");
  const [webTitleInput, setWebTitleInput] = React.useState("");
  const [webError, setWebError] = React.useState<string | null>(null);

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

  /** Sync web dialog open state and reset inputs. */
  const handleWebDialogOpenChange = React.useCallback((open: boolean) => {
    setIsWebDialogOpen(open);
    if (!open) {
      setWebUrlInput("");
      setWebTitleInput("");
      setWebError(null);
    }
  }, []);

  /** Create a web-stack widget after user input. */
  const handleCreateWebWidget = React.useCallback(async () => {
    setWebError(null);
    const normalized = normalizeUrl(webUrlInput);
    if (!normalized) {
      setWebError("请输入有效网址");
      return;
    }
    if (!defaultRootUri) {
      setWebError("未找到工作区目录");
      return;
    }
    let hostname = "";
    try {
      hostname = new URL(normalized).hostname;
    } catch {
      hostname = normalized;
    }
    const title = webTitleInput.trim() || hostname || "网页";
    emitDesktopWidgetSelected({
      tabId,
      widgetKey: "web-stack",
      title,
      webUrl: normalized,
      webMetaStatus: "loading",
    });
    removeStackItem(tabId, panelKey);
    handleWebDialogOpenChange(false);
  }, [
    defaultRootUri,
    handleWebDialogOpenChange,
    panelKey,
    removeStackItem,
    tabId,
    webTitleInput,
    webUrlInput,
  ]);

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
    const scopedCatalog = desktopWidgetCatalog.filter((item) => item.support[scope]);
    if (!q) return scopedCatalog;
    return scopedCatalog.filter((item) => item.title.toLowerCase().includes(q));
  }, [query, scope]);
  const canSubmitWeb = Boolean(normalizeUrl(webUrlInput));

  // Query dynamic widgets from the server.
  const dynamicWidgetsQuery = useQuery(trpc.dynamicWidget.list.queryOptions({}))
  const dynamicWidgets = dynamicWidgetsQuery.data ?? []
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
                if (item.widgetKey === "3d-folder") {
                  // 中文注释：3D 文件夹需要先选择目录。
                  setPendingFolderWidget(item.widgetKey);
                  setIsFolderDialogOpen(true);
                  return;
                }
                if (item.widgetKey === "web-stack") {
                  // 中文注释：网页组件需要先填写 URL 与名称。
                  setIsWebDialogOpen(true);
                  return;
                }
                emitDesktopWidgetSelected({
                  tabId,
                  widgetKey: item.widgetKey,
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
                if (item.widgetKey === "web-stack") {
                  // 中文注释：键盘操作需要弹出网页信息输入框。
                  setIsWebDialogOpen(true);
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
                  <WidgetEntityPreview widgetKey={item.widgetKey} scope={scope} />
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

        {filteredDynamic.length > 0 ? (
          <>
            <div className="mt-4 mb-2 text-xs font-medium text-muted-foreground">AI 生成</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDynamic.map((dw) => (
                <div
                  key={dw.id}
                  role="button"
                  tabIndex={0}
                  className="group flex min-w-0 flex-col gap-2 rounded-xl border border-border/60 bg-background p-2 text-left hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => {
                    emitDesktopWidgetSelected({
                      tabId,
                      widgetKey: "dynamic",
                      title: dw.name,
                      dynamicWidgetId: dw.id,
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
                    });
                    removeStackItem(tabId, panelKey);
                  }}
                >
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
        ) : null}
      </div>
      <ProjectFileSystemTransferDialog
        open={isFolderDialogOpen}
        onOpenChange={handleFolderDialogOpenChange}
        mode="select"
        selectTarget="folder"
        onSelectTarget={handleSelectFolder}
      />
      <Dialog open={isWebDialogOpen} onOpenChange={handleWebDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加网页组件</DialogTitle>
            <DialogDescription>输入网页地址与名称，自动抓取 logo 与预览图。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">网页地址</div>
              <Input
                value={webUrlInput}
                onChange={(e) => setWebUrlInput(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">名称（可选）</div>
              <Input
                value={webTitleInput}
                onChange={(e) => setWebTitleInput(e.target.value)}
                placeholder="自定义名称"
              />
            </div>
            {webError ? (
              <div className="text-xs text-destructive">{webError}</div>
            ) : null}
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => handleWebDialogOpenChange(false)}>
              取消
            </Button>
            <Button type="button" onClick={handleCreateWebWidget} disabled={!canSubmitWeb}>
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
