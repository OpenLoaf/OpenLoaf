"use client";

import * as React from "react";
import { useProjects } from "@/hooks/use-projects";
import ProjectFileSystemTransferDialog from "@/components/project/filesystem/components/ProjectFileSystemTransferDialog";
import type { ProjectNode } from "@tenas-ai/api/services/projectTreeService";
import {
  buildUriFromRoot,
  formatScopedProjectPath,
  getRelativePathFromUri,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import type { DesktopIconKey, DesktopItem, DesktopScope } from "./types";
import type { DesktopBreakpoint } from "./desktop-breakpoints";
import { getBreakpointConfig } from "./desktop-breakpoints";
import DesktopGrid from "./DesktopGrid";
import { desktopIconCatalog, getDesktopIconNode } from "./desktop-icon-catalog";
import { filterDesktopItemsByScope } from "./desktop-support";
import { PencilLine } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@tenas-ai/ui/context-menu";

/** Resolve edit-mode max width by breakpoint (lg is unconstrained). */
function getEditMaxWidth(breakpoint: DesktopBreakpoint) {
  if (breakpoint === "lg") return undefined;
  const config = getBreakpointConfig(breakpoint);
  // 中文注释：使用行高作为列宽的近似值，按列数推导当前断点的可视宽度。
  return config.columns * config.rowHeight + (config.columns - 1) * config.gap + config.padding * 2;
}

const resolveIconTitle = (iconKey: DesktopIconKey) =>
  desktopIconCatalog.find((item) => item.iconKey === iconKey)?.title ?? "Icon";

const BASE_DESKTOP_ITEMS: DesktopItem[] = [
  {
    id: "w-flip-clock",
    kind: "widget",
    title: "Flip Clock",
    widgetKey: "flip-clock",
    size: "4x2",
    constraints: { defaultW: 4, defaultH: 2, minW: 2, minH: 2, maxW: 6, maxH: 3 },
    flipClock: { showSeconds: true },
    layout: { x: 0, y: 0, w: 4, h: 2 },
  },
  {
    id: "w-clock",
    kind: "widget",
    title: "Clock",
    widgetKey: "clock",
    size: "2x2",
    constraints: { defaultW: 2, defaultH: 2, minW: 2, minH: 2, maxW: 3, maxH: 3 },
    layout: { x: 0, y: 2, w: 2, h: 2 },
  },
  {
    id: "w-actions",
    kind: "widget",
    title: "Actions",
    widgetKey: "quick-actions",
    size: "4x2",
    constraints: { defaultW: 4, defaultH: 2, minW: 2, minH: 2, maxW: 6, maxH: 3 },
    layout: { x: 0, y: 4, w: 4, h: 2 },
  },
  {
    id: "w-calendar",
    kind: "widget",
    title: "日历",
    widgetKey: "calendar",
    size: "5x6",
    constraints: { defaultW: 5, defaultH: 6, minW: 4, minH: 3, maxW: 8, maxH: 6 },
    layout: { x: 0, y: 6, w: 5, h: 6 },
  },
  {
    id: "i-files",
    kind: "icon",
    title: resolveIconTitle("files"),
    iconKey: "files",
    icon: getDesktopIconNode("files"),
    layout: { x: 2, y: 2, w: 1, h: 1 },
  },
  {
    id: "i-tasks",
    kind: "icon",
    title: resolveIconTitle("tasks"),
    iconKey: "tasks",
    icon: getDesktopIconNode("tasks"),
    layout: { x: 3, y: 2, w: 1, h: 1 },
  },
  {
    id: "i-search",
    kind: "icon",
    title: resolveIconTitle("search"),
    iconKey: "search",
    icon: getDesktopIconNode("search"),
    layout: { x: 2, y: 3, w: 1, h: 1 },
  },
  {
    id: "i-settings",
    kind: "icon",
    title: resolveIconTitle("settings"),
    iconKey: "settings",
    icon: getDesktopIconNode("settings"),
    layout: { x: 3, y: 3, w: 1, h: 1 },
  },
];

/** Build default desktop items for the given scope. */
function getInitialDesktopItems(scope: DesktopScope) {
  return filterDesktopItemsByScope(scope, BASE_DESKTOP_ITEMS);
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

interface DesktopPageProps {
  /** Items in rendering order. */
  items: DesktopItem[];
  /** Desktop scope (workspace or project). */
  scope: DesktopScope;
  /** Whether desktop is in edit mode. */
  editMode: boolean;
  /** Active breakpoint when editing. */
  activeBreakpoint: DesktopBreakpoint;
  /** Notify view-mode breakpoint changes. */
  onViewBreakpointChange?: (breakpoint: DesktopBreakpoint) => void;
  /** Update edit mode. */
  onSetEditMode: (nextEditMode: boolean) => void;
  /** Update a single desktop item. */
  onUpdateItem: (itemId: string, updater: (item: DesktopItem) => DesktopItem) => void;
  /** Update a desktop item and persist changes when needed. */
  onPersistItemUpdate?: (itemId: string, updater: (item: DesktopItem) => DesktopItem) => void;
  /** Update items order after a drag ends. */
  onChangeItems: (nextItems: DesktopItem[]) => void;
  /** Signal value for triggering compact. */
  compactSignal: number;
  /** Extra bottom padding for scroll container (px). */
  bottomPadding?: number;
}

/** Render a single-page desktop (MVP). */
export default function DesktopPage({
  items,
  scope,
  editMode,
  activeBreakpoint,
  onViewBreakpointChange,
  onSetEditMode,
  onUpdateItem,
  onPersistItemUpdate,
  onChangeItems,
  compactSignal,
  bottomPadding,
}: DesktopPageProps) {
  const editMaxWidth = editMode ? getEditMaxWidth(activeBreakpoint) : undefined;
  const projectListQuery = useProjects();
  const projectRoots = React.useMemo(
    () => flattenProjectTree(projectListQuery.data),
    [projectListQuery.data]
  );
  const [isFolderDialogOpen, setIsFolderDialogOpen] = React.useState(false);
  const [activeFolderItemId, setActiveFolderItemId] = React.useState<string | null>(null);

  /** Resolve the selected folder into scoped metadata. */
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
        return { folderUri, title, defaultRootUri: project?.rootUri };
      }
      // 中文注释：使用项目根目录匹配目标路径，生成可持久化的相对路径引用。
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
        return { folderUri, title, defaultRootUri: project.rootUri };
      }
      return null;
    },
    [projectRoots]
  );

  /** Resolve default dialog uris from the current folder reference. */
  const resolveDefaultFolderUris = React.useCallback(
    (folderUri?: string) => {
      if (!folderUri) return { defaultRootUri: undefined, defaultActiveUri: undefined };
      const parsed = parseScopedProjectPath(folderUri);
      if (!parsed) return { defaultRootUri: undefined, defaultActiveUri: undefined };
      const root = projectRoots.find((item) => item.projectId === parsed.projectId);
      if (!root) return { defaultRootUri: undefined, defaultActiveUri: undefined };
      if (!parsed.relativePath) {
        return { defaultRootUri: root.rootUri, defaultActiveUri: root.rootUri };
      }
      const activeUri = buildUriFromRoot(root.rootUri, parsed.relativePath);
      return { defaultRootUri: root.rootUri, defaultActiveUri: activeUri || root.rootUri };
    },
    [projectRoots]
  );

  const scopedItems = React.useMemo(
    () => filterDesktopItemsByScope(scope, items),
    [items, scope]
  );

  const desktopBody = (
    <div className="min-h-full w-full bg-gradient-to-b from-background">
      <div
        className="min-h-full w-full"
        style={editMaxWidth ? { maxWidth: editMaxWidth, margin: "0 auto" } : undefined}
      >
        <DesktopGrid
          items={scopedItems}
          scope={scope}
          editMode={editMode}
          activeBreakpoint={activeBreakpoint}
          onViewBreakpointChange={onViewBreakpointChange}
          onSetEditMode={onSetEditMode}
          onUpdateItem={onUpdateItem}
          onPersistItemUpdate={onPersistItemUpdate}
          onChangeItems={onChangeItems}
          onDeleteItem={(itemId) =>
            onChangeItems(scopedItems.filter((item) => item.id !== itemId))
          }
          onSelectFolder={(itemId) => {
            setActiveFolderItemId(itemId);
            setIsFolderDialogOpen(true);
          }}
          compactSignal={compactSignal}
        />
      </div>
    </div>
  );

  return (
    <div
      className="h-full w-full overflow-auto"
      aria-label="Desktop"
      style={bottomPadding ? { paddingBottom: bottomPadding } : undefined}
    >
      {editMode ? (
        desktopBody
      ) : (
        <ContextMenu>
          {/* 中文注释：非编辑态在空白区域右键显示编辑入口。 */}
          <ContextMenuTrigger asChild>{desktopBody}</ContextMenuTrigger>
          <ContextMenuContent className="w-40">
            <ContextMenuItem icon={PencilLine} onClick={() => onSetEditMode(true)}>
              编辑
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
      <ProjectFileSystemTransferDialog
        open={isFolderDialogOpen}
        onOpenChange={(open) => {
          setIsFolderDialogOpen(open);
          if (!open) setActiveFolderItemId(null);
        }}
        mode="select"
        selectTarget="folder"
        {...(() => {
          const targetItem = scopedItems.find((item) => item.id === activeFolderItemId);
          const defaultUris = resolveDefaultFolderUris(
            targetItem && targetItem.kind === "widget" && targetItem.widgetKey === "3d-folder"
              ? targetItem.folderUri
              : undefined
          );
          return defaultUris;
        })()}
        onSelectTarget={(targetUri) => {
          if (!activeFolderItemId) return;
          const resolved = resolveFolderSelection(targetUri);
          if (!resolved) return;
          onUpdateItem(activeFolderItemId, (current) => {
            if (current.kind !== "widget" || current.widgetKey !== "3d-folder") return current;
            return {
              ...current,
              title: resolved.title,
              folderUri: resolved.folderUri,
            };
          });
          setIsFolderDialogOpen(false);
          setActiveFolderItemId(null);
        }}
      />
    </div>
  );
}

export { getInitialDesktopItems };
