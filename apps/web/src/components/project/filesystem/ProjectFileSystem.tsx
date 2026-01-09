"use client";

import {
  Fragment,
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FolderPlus,
  LayoutGrid,
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  ArrowUpWideNarrow,
  Redo2,
  Search,
  Undo2,
  Upload,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { FileSystemEntry } from "./file-system-utils";
import { FileSystemGrid } from "./FileSystemGrid";
import ProjectFileSystemTransferDialog from "./ProjectFileSystemTransferDialog";
import { DragDropOverlay } from "@/components/ui/teatime/drag-drop-overlay";
import { useProjectFileSystemModel } from "./file-system-model";
import { useFileSelection } from "@/hooks/use-file-selection";
import { useFileRename } from "@/hooks/use-file-rename";

type ProjectFileSystemProps = {
  projectId?: string;
  rootUri?: string;
  currentUri?: string | null;
  projectLookup?: Map<string, ProjectBreadcrumbInfo>;
  onNavigate?: (nextUri: string) => void;
};

type ProjectBreadcrumbInfo = {
  title: string;
  icon?: string;
};

type ProjectBreadcrumbItem = {
  label: string;
  uri: string;
};

type ProjectFileSystemBreadcrumbsProps = {
  isLoading: boolean;
  rootUri?: string;
  currentUri?: string | null;
  projectLookup?: Map<string, ProjectBreadcrumbInfo>;
  onNavigate?: (nextUri: string) => void;
  items?: ProjectBreadcrumbItem[];
};

type ProjectFileSystemHeaderProps = {
  isLoading: boolean;
  rootUri?: string;
  currentUri?: string | null;
  projectLookup?: Map<string, ProjectBreadcrumbInfo>;
  onNavigate?: (nextUri: string) => void;
};

type ProjectFileSystemHeaderSlotState = {
  toolbarMount: HTMLDivElement | null;
  setToolbarMount: (node: HTMLDivElement | null) => void;
};

const ProjectFileSystemHeaderSlotContext =
  createContext<ProjectFileSystemHeaderSlotState | null>(null);

/** Access the file system header slot mount. */
function useProjectFileSystemHeaderSlot() {
  return useContext(ProjectFileSystemHeaderSlotContext);
}

/** Provide a DOM slot for mounting the file system toolbar in the header. */
function ProjectFileSystemHeaderSlotProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [toolbarMount, setToolbarMount] = useState<HTMLDivElement | null>(null);

  return (
    <ProjectFileSystemHeaderSlotContext.Provider
      value={{ toolbarMount, setToolbarMount }}
    >
      {children}
    </ProjectFileSystemHeaderSlotContext.Provider>
  );
}

/** Build breadcrumb items for the project file system. */
function buildFileBreadcrumbs(
  rootUri?: string,
  currentUri?: string | null,
  projectLookup?: Map<string, ProjectBreadcrumbInfo>
): ProjectBreadcrumbItem[] {
  if (!rootUri || !currentUri) return [];
  const rootUrl = new URL(rootUri);
  const currentUrl = new URL(currentUri);
  const rootParts = rootUrl.pathname.split("/").filter(Boolean);
  const currentParts = currentUrl.pathname.split("/").filter(Boolean);
  const relativeParts = currentParts.slice(rootParts.length);
  const items: ProjectBreadcrumbItem[] = [];
  let accumParts = [...rootParts];
  // 从 root 向下拼接，构建可点击的面包屑路径。
  for (const part of relativeParts) {
    accumParts = [...accumParts, part];
    const nextUrl = new URL(rootUri);
    nextUrl.pathname = `/${accumParts.join("/")}`;
    const nextUri = nextUrl.toString();
    const info = projectLookup?.get(nextUri);
    items.push({
      label: info?.title ?? decodePathSegment(part),
      uri: nextUri,
    });
  }
  return items;
}

/** Check if the current uri equals the root uri. */
function isAtRootUri(rootUri?: string, currentUri?: string | null) {
  if (!rootUri || !currentUri) return true;
  try {
    const rootUrl = new URL(rootUri);
    const currentUrl = new URL(currentUri);
    const rootParts = rootUrl.pathname.split("/").filter(Boolean);
    const currentParts = currentUrl.pathname.split("/").filter(Boolean);
    // 中文注释：当前路径不超过 root 层级时视为根目录。
    return currentParts.length <= rootParts.length;
  } catch {
    return true;
  }
}

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Project file system header. */
const ProjectFileSystemHeader = memo(function ProjectFileSystemHeader({
  isLoading,
  rootUri,
  currentUri,
  projectLookup,
  onNavigate,
}: ProjectFileSystemHeaderProps) {
  const headerSlot = useProjectFileSystemHeaderSlot();
  const isAtRoot = isAtRootUri(rootUri, currentUri);
  const breadcrumbItems = buildFileBreadcrumbs(rootUri, currentUri, projectLookup);

  if (isLoading) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 min-w-0 animate-in fade-in duration-200 w-full">
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          className={`text-base font-semibold ${isAtRoot ? "" : "hover:opacity-80"}`}
          disabled={isAtRoot}
          onClick={() => {
            if (!rootUri || isAtRoot) return;
            onNavigate?.(rootUri);
          }}
        >
          文件
        </button>
        {breadcrumbItems.length > 0 ? (
          <span className="text-xs text-muted-foreground"> &gt; </span>
        ) : null}
        <div className="min-w-0">
          <ProjectFileSystemBreadcrumbs
            isLoading={isLoading}
            rootUri={rootUri}
            currentUri={currentUri}
            projectLookup={projectLookup}
            onNavigate={onNavigate}
            items={breadcrumbItems}
          />
        </div>
      </div>
      <div
        ref={(node) => {
          headerSlot?.setToolbarMount(node);
        }}
        className="flex min-w-0 items-center justify-end"
      />
    </div>
  );
});

/** Project file system breadcrumbs. */
const ProjectFileSystemBreadcrumbs = memo(function ProjectFileSystemBreadcrumbs({
  isLoading,
  rootUri,
  currentUri,
  projectLookup,
  onNavigate,
  items,
}: ProjectFileSystemBreadcrumbsProps) {
  const breadcrumbItems = items ?? buildFileBreadcrumbs(rootUri, currentUri, projectLookup);
  const isVisible = !isLoading && breadcrumbItems.length > 0;

  return (
    <div className="relative flex min-w-0 items-center">
      <div
        className={`flex items-center gap-2 min-w-0 transition-opacity duration-300 ease-out ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <Breadcrumb>
          <BreadcrumbList>
          {breadcrumbItems.map((item, index) => {
            const isLast = index === breadcrumbItems.length - 1;
            return (
              <Fragment key={item.uri}>
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>
                      <span>{item.label}</span>
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild className="cursor-pointer">
                      <button type="button" onClick={() => onNavigate?.(item.uri)}>
                        <span>{item.label}</span>
                      </button>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast ? <BreadcrumbSeparator /> : null}
              </Fragment>
            );
          })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div
        className={`absolute inset-y-0 left-0 flex items-center transition-opacity duration-300 ease-out ${
          isVisible ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <span className="h-5 w-36 " />
      </div>
    </div>
  );
});

const ProjectFileSystem = memo(function ProjectFileSystem({
  projectId,
  rootUri,
  currentUri,
  projectLookup,
  onNavigate,
}: ProjectFileSystemProps) {
  /** Delay clearing the menu target until the close animation finishes. */
  const MENU_CLOSE_DELAY_MS = 200;
  const model = useProjectFileSystemModel({
    projectId,
    rootUri,
    currentUri,
    onNavigate,
  });
  const headerSlot = useProjectFileSystemHeaderSlot();
  /** Track current grid selection. */
  const {
    selectedUris,
    replaceSelection,
    toggleSelection,
    ensureSelected,
    clearSelection,
    applySelectionChange,
  } = useFileSelection();
  /** Track the entry that opened the context menu. */
  const [contextTargetUri, setContextTargetUri] = useState<string | null>(null);
  /** Freeze the menu target during open/close to avoid flicker. */
  const [menuTarget, setMenuTarget] = useState<
    | {
        type: "entry";
        uri: string;
      }
    | {
        type: "empty";
      }
    | null
  >(null);
  /** Track context menu open state to prevent content flicker. */
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  /** Store the last time the context menu opened to guard accidental selects. */
  const lastContextMenuOpenAtRef = useRef(0);
  /** Store the pending menu target clear timeout. */
  const menuTargetClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  /** Resolve macOS-specific modifier behavior. */
  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac")),
    []
  );
  /** Manage rename state for file entries. */
  const {
    renamingUri,
    renamingValue,
    setRenamingValue,
    requestRename,
    requestRenameByInfo,
    handleRenamingSubmit,
    handleRenamingCancel,
  } = useFileRename({
    entries: model.fileEntries,
    onRename: model.renameEntry,
    onSelectionReplace: replaceSelection,
  });

  /** Resolve whether a click should toggle selection. */
  const shouldToggleSelection = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      // 中文注释：macOS 只使用 Command 键，避免 Ctrl 右键误触切换。
      return isMac ? event.metaKey : event.metaKey || event.ctrlKey;
    },
    [isMac]
  );

  /** Resolve selection mode for drag selection. */
  const resolveSelectionMode = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const toggle = isMac ? event.metaKey : event.metaKey || event.ctrlKey;
      // 中文注释：macOS 下忽略 Ctrl，避免右键菜单触发框选切换。
      return toggle ? "toggle" : "replace";
    },
    [isMac]
  );

  /** Resolve selected entries from the current file list. */
  const resolveSelectedEntries = useCallback(
    (uris: Set<string>) => {
      if (uris.size === 0) return [];
      const index = new Map(model.fileEntries.map((entry) => [entry.uri, entry]));
      const results: typeof model.fileEntries = [];
      uris.forEach((uri) => {
        const entry = index.get(uri);
        if (entry) results.push(entry);
      });
      return results;
    },
    [model.fileEntries]
  );

  /** Resolve the menu entry snapshot used for rendering. */
  const menuContextEntry = useMemo(() => {
    if (!menuTarget || menuTarget.type !== "entry") return null;
    return model.fileEntries.find((entry) => entry.uri === menuTarget.uri) ?? null;
  }, [menuTarget, model.fileEntries]);

  /** Cache selected entries for context menu actions. */
  const selectedEntries = useMemo(
    () => resolveSelectedEntries(selectedUris),
    [resolveSelectedEntries, selectedUris]
  );

  /** Handle left-click selection updates. */
  const handleEntryClick = useCallback(
    (entry: FileSystemEntry, event: ReactMouseEvent<HTMLButtonElement>) => {
      console.debug("[ProjectFileSystem] entry click", {
        at: new Date().toISOString(),
        uri: entry.uri,
        button: event.button,
        which: event.nativeEvent?.which,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        isContextMenuOpen,
        selectedSize: selectedUris.size,
      });
      if (event.button !== 0) return;
      if (event.nativeEvent?.which && event.nativeEvent.which !== 1) return;
      if (isMac && event.ctrlKey) return;
      if (shouldToggleSelection(event)) {
        toggleSelection(entry.uri);
        // 中文注释：菜单打开时不重置目标，避免菜单内容闪变。
        if (!isContextMenuOpen) {
          setContextTargetUri(null);
        }
        return;
      }
      replaceSelection([entry.uri]);
      // 中文注释：菜单打开时不重置目标，避免菜单内容闪变。
      if (!isContextMenuOpen) {
        setContextTargetUri(null);
      }
    },
    [
      isContextMenuOpen,
      isMac,
      replaceSelection,
      selectedUris,
      shouldToggleSelection,
      toggleSelection,
    ]
  );

  /** Handle selection updates from drag selection. */
  const handleSelectionChange = useCallback(
    (uris: string[], mode: "replace" | "toggle") => {
      console.debug("[ProjectFileSystem] selection change", {
        at: new Date().toISOString(),
        mode,
        uris,
        isContextMenuOpen,
      });
      applySelectionChange(uris, mode);
      // 中文注释：菜单打开时不重置目标，避免菜单内容闪变。
      if (!isContextMenuOpen) {
        setContextTargetUri(null);
      }
    },
    [applySelectionChange, isContextMenuOpen]
  );

  /** Preserve selection when starting a drag action. */
  const handleEntryDragStart = useCallback(
    (entry: FileSystemEntry, event: ReactDragEvent<HTMLButtonElement>) => {
      ensureSelected(entry.uri);
      model.handleEntryDragStart(entry, event);
    },
    [ensureSelected, model]
  );

  /** Capture context menu target before menu opens. */
  const handleGridContextMenuCapture = useCallback(
    (_event: ReactMouseEvent<HTMLDivElement>, payload: { uri: string | null }) => {
      console.debug("[ProjectFileSystem] grid context capture", {
        at: new Date().toISOString(),
        uri: payload.uri,
        isContextMenuOpen,
        selectedSize: selectedUris.size,
      });
      lastContextMenuOpenAtRef.current = Date.now();
      if (menuTargetClearTimeoutRef.current) {
        clearTimeout(menuTargetClearTimeoutRef.current);
        menuTargetClearTimeoutRef.current = null;
      }
      setMenuTarget(
        payload.uri
          ? {
              type: "entry",
              uri: payload.uri,
            }
          : {
              type: "empty",
            }
      );
      setContextTargetUri(payload.uri);
      if (!payload.uri) return;
      if (!selectedUris.has(payload.uri)) {
        replaceSelection([payload.uri]);
      }
    },
    [isContextMenuOpen, replaceSelection, selectedUris]
  );

  /** Ignore menu selection triggered by the opening right-click release. */
  const shouldIgnoreMenuSelect = useCallback((event: Event) => {
    const elapsed = Date.now() - lastContextMenuOpenAtRef.current;
    if (elapsed > 200) return false;
    console.debug("[ProjectFileSystem] ignore menu select", {
      at: new Date().toISOString(),
      elapsed,
    });
    event.preventDefault();
    return true;
  }, []);

  /** Wrap menu item actions with the open-click guard. */
  const withMenuSelectGuard = useCallback(
    (handler: () => void) => {
      return (event: Event) => {
        if (shouldIgnoreMenuSelect(event)) return;
        handler();
      };
    },
    [shouldIgnoreMenuSelect]
  );

  /** Reset context target when menu closes. */
  const handleContextMenuOpenChange = useCallback((open: boolean) => {
    console.debug("[ProjectFileSystem] context menu open change", {
      at: new Date().toISOString(),
      open,
      contextTargetUri,
      selectedSize: selectedUris.size,
    });
    if (open) {
      lastContextMenuOpenAtRef.current = Date.now();
      if (menuTargetClearTimeoutRef.current) {
        clearTimeout(menuTargetClearTimeoutRef.current);
        menuTargetClearTimeoutRef.current = null;
      }
      if (!menuTarget) {
        setMenuTarget(
          contextTargetUri
            ? {
                type: "entry",
                uri: contextTargetUri,
              }
            : {
                type: "empty",
              }
        );
      }
    }
    setIsContextMenuOpen(open);
    if (open) return;
    if (menuTargetClearTimeoutRef.current) {
      clearTimeout(menuTargetClearTimeoutRef.current);
    }
    menuTargetClearTimeoutRef.current = setTimeout(() => {
      setMenuTarget(null);
      menuTargetClearTimeoutRef.current = null;
    }, MENU_CLOSE_DELAY_MS);
    setContextTargetUri(null);
  }, [MENU_CLOSE_DELAY_MS, contextTargetUri, menuTarget, selectedUris.size]);

  const handleCreateFolder = async () => {
    const created = await model.handleCreateFolder();
    if (created) {
      requestRenameByInfo(created);
    }
  };

  useEffect(() => {
    // 中文注释：目录切换时重置选择与重命名状态，避免沿用旧目录的引用。
    clearSelection();
    handleRenamingCancel();
    setContextTargetUri(null);
    if (menuTargetClearTimeoutRef.current) {
      clearTimeout(menuTargetClearTimeoutRef.current);
      menuTargetClearTimeoutRef.current = null;
    }
    setMenuTarget(null);
  }, [clearSelection, handleRenamingCancel, model.activeUri]);

  useEffect(() => {
    return () => {
      if (menuTargetClearTimeoutRef.current) {
        clearTimeout(menuTargetClearTimeoutRef.current);
      }
    };
  }, []);

  if (!rootUri) {
    return <div className="p-4 text-sm text-muted-foreground">未绑定项目目录</div>;
  }

  // 中文注释：通过 portal 把功能栏渲染到 header 右侧槽位，避免状态外提。
  const toolbarPortal = headerSlot?.toolbarMount
    ? createPortal(
        <div className="flex flex-wrap items-center justify-end gap-1 rounded-b-2xl px-4 py-2.5">
          {model.canUndo || model.canRedo ? (
            <>
              <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="撤回"
                  title="撤回"
                  disabled={!model.canUndo}
                  onClick={() => {
                    model.undo();
                  }}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="前进"
                  title="前进"
                  disabled={!model.canRedo}
                  onClick={() => {
                    model.redo();
                  }}
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="切换排列方式"
              title="切换排列方式"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${
                model.sortField === "name" ? "bg-foreground/10 text-foreground" : ""
              }`}
              aria-label="按字母排序"
              title="按字母排序"
              onClick={model.handleSortByName}
            >
              {model.sortField === "name" && model.sortOrder === "desc" ? (
                <ArrowUpAZ className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownAZ className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${
                model.sortField === "mtime" ? "bg-foreground/10 text-foreground" : ""
              }`}
              aria-label="按时间排序"
              title="按时间排序"
              onClick={model.handleSortByTime}
            >
              {model.sortField === "mtime" && model.sortOrder === "asc" ? (
                <ArrowUpWideNarrow className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownWideNarrow className="h-3.5 w-3.5" />
              )}
            </Button>
            <div className="mx-1 h-4 w-px bg-border/70" />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="新建文件夹"
              title="新建文件夹"
              onClick={handleCreateFolder}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="添加文件"
              title="添加文件"
              onClick={() => {
                model.uploadInputRef.current?.click();
              }}
            >
              <Upload className="h-3.5 w-3.5" />
            </Button>
            <input
              ref={model.uploadInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={async (event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length === 0) return;
                await model.handleUploadFiles(files);
                event.currentTarget.value = "";
              }}
            />
            <div ref={model.searchContainerRef} className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 transition-[width,opacity] duration-150 ${
                  model.isSearchOpen
                    ? "w-0 opacity-0 pointer-events-none"
                    : "opacity-100"
                }`}
                aria-label="搜索"
                title="搜索"
                onClick={() => model.setIsSearchOpen(true)}
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
              <div
                className={`relative overflow-hidden rounded-md ring-1 ring-border/60 bg-background/80 transition-[width,opacity,transform] duration-200 origin-right ${
                  model.isSearchOpen
                    ? "w-56 opacity-100 translate-x-0"
                    : "w-0 opacity-0 translate-x-2"
                }`}
              >
                <Input
                  ref={model.searchInputRef}
                  className="h-7 w-56 border-0 bg-transparent px-3 text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
                  placeholder="搜索文件或文件夹"
                  type="search"
                  value={model.searchValue}
                  onChange={(event) => model.setSearchValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      model.setIsSearchOpen(false);
                    }
                  }}
                />
              </div>
            </div>
        </div>,
        headerSlot.toolbarMount
      )
    : null;

  return (
    <div className="h-full flex flex-col gap-4">
      {toolbarPortal}
      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <ContextMenu onOpenChange={handleContextMenuOpenChange}>
          <ContextMenuTrigger asChild>
            <div
              className="flex-1 min-h-0 h-full overflow-auto bg-background p-4"
              onDragEnter={model.handleDragEnter}
              onDragOver={model.handleDragOver}
              onDragLeave={model.handleDragLeave}
              onDrop={model.handleDrop}
            >
              <div
                key={model.activeUri ?? "root"}
                className="min-h-full h-full animate-in fade-in slide-in-from-bottom-2 duration-200"
              >
                <FileSystemGrid
                  entries={model.displayEntries}
                  isLoading={model.listQuery.isLoading}
                  parentUri={model.parentUri}
                  dragProjectId={model.projectId}
                  dragRootUri={model.rootUri}
                  onNavigate={model.handleNavigate}
                  onOpenImage={model.handleOpenImage}
                  onOpenCode={model.handleOpenCode}
                  onOpenPdf={model.handleOpenPdf}
                  onOpenDoc={model.handleOpenDoc}
                  onOpenSpreadsheet={model.handleOpenSpreadsheet}
                  onOpenBoard={model.handleOpenBoard}
                  onCreateBoard={model.handleCreateBoard}
                  selectedUris={selectedUris}
                  onEntryClick={handleEntryClick}
                  onSelectionChange={handleSelectionChange}
                  resolveSelectionMode={resolveSelectionMode}
                  onGridContextMenuCapture={handleGridContextMenuCapture}
                  renamingUri={renamingUri}
                  renamingValue={renamingValue}
                  onRenamingChange={setRenamingValue}
                  onRenamingSubmit={handleRenamingSubmit}
                  onRenamingCancel={handleRenamingCancel}
                  onEntryDragStart={handleEntryDragStart}
                  onEntryDrop={model.handleEntryDrop}
                />
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className={menuContextEntry ? "w-52" : "w-44"}>
            {menuContextEntry ? (
              selectedEntries.length > 1 ? (
                <>
                  <ContextMenuItem disabled>
                    已选择 {selectedEntries.length} 项
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={withMenuSelectGuard(() =>
                      model.handleOpenTransferDialog(selectedEntries, "copy")
                    )}
                  >
                    复制到
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={withMenuSelectGuard(() =>
                      model.handleOpenTransferDialog(selectedEntries, "move")
                    )}
                  >
                    移动到
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={withMenuSelectGuard(() =>
                      model.handleDeleteBatch(selectedEntries)
                    )}
                  >
                    删除
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={withMenuSelectGuard(() =>
                      model.handleDeletePermanentBatch(selectedEntries)
                    )}
                  >
                    彻底删除
                  </ContextMenuItem>
                </>
              ) : (
                <>
                  <ContextMenuItem
                    onSelect={withMenuSelectGuard(() => model.handleOpen(menuContextEntry))}
                  >
                    打开
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={withMenuSelectGuard(() =>
                      model.handleOpenInFileManager(menuContextEntry)
                    )}
                  >
                    在文件管理器中打开
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={withMenuSelectGuard(() =>
                      model.handleOpenTransferDialog(menuContextEntry, "copy")
                    )}
                  >
                    复制到
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={withMenuSelectGuard(() =>
                      model.handleOpenTransferDialog(menuContextEntry, "move")
                    )}
                  >
                    移动到
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={withMenuSelectGuard(() =>
                      model.handleCopyPath(menuContextEntry)
                    )}
                  >
                    复制路径
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={withMenuSelectGuard(() => requestRename(menuContextEntry))}
                  >
                    重命名
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={withMenuSelectGuard(() => model.handleDelete(menuContextEntry))}
                  >
                    删除
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={withMenuSelectGuard(() =>
                      model.handleDeletePermanent(menuContextEntry)
                    )}
                  >
                    彻底删除
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={withMenuSelectGuard(() =>
                      model.handleShowInfo(menuContextEntry)
                    )}
                  >
                    基本信息
                  </ContextMenuItem>
                </>
              )
            ) : (
              <>
                <ContextMenuItem onSelect={withMenuSelectGuard(model.refreshList)}>
                  刷新
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={withMenuSelectGuard(() =>
                    model.setShowHidden((prev) => !prev)
                  )}
                >
                  {model.showHidden ? "✓ 显示隐藏" : "显示隐藏"}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={withMenuSelectGuard(handleCreateFolder)}>
                  新建文件夹
                </ContextMenuItem>
                <ContextMenuItem disabled>新建文稿</ContextMenuItem>
                <ContextMenuItem onSelect={withMenuSelectGuard(model.handleCreateBoard)}>
                  新建画布
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onSelect={withMenuSelectGuard(() => {
                    model.handlePaste();
                  })}
                  disabled={model.clipboardSize === 0}
                >
                  粘贴
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
        <DragDropOverlay
          open={model.isDragActive}
          title="松开鼠标即可添加文件"
          radiusClassName="rounded-2xl"
        />
      </section>
      <ProjectFileSystemTransferDialog
        open={model.transferDialogOpen}
        onOpenChange={model.handleTransferDialogOpenChange}
        entries={model.transferEntries}
        mode={model.transferMode}
        defaultRootUri={rootUri}
      />
    </div>
  );
});

export type { ProjectBreadcrumbInfo };
export {
  ProjectFileSystemBreadcrumbs,
  ProjectFileSystemHeader,
  ProjectFileSystemHeaderSlotProvider,
};
export default ProjectFileSystem;
