"use client";

import {
  Fragment,
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import type { FileSystemEntry } from "./file-system-utils";
import FileSystemContextMenu from "./FileSystemContextMenu";
import { FileSystemGrid } from "./FileSystemGrid";
import ProjectFileSystemTransferDialog from "./ProjectFileSystemTransferDialog";
import { DragDropOverlay } from "@/components/ui/teatime/drag-drop-overlay";
import { useProjectFileSystemModel } from "./file-system-model";
import { useFileSystemContextMenu } from "@/hooks/use-file-system-context-menu";
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
    // 当前路径不超过 root 层级时视为根目录。
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
  /** Manage context menu state for the grid. */
  const {
    menuContextEntry,
    handleGridContextMenuCapture,
    handleContextMenuOpenChange,
    withMenuSelectGuard,
    clearContextTargetIfClosed,
    resetContextMenu,
  } = useFileSystemContextMenu({
    entries: model.fileEntries,
    selectedUris,
    onReplaceSelection: replaceSelection,
  });
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
      // macOS 只使用 Command 键，避免 Ctrl 右键误触切换。
      return isMac ? event.metaKey : event.metaKey || event.ctrlKey;
    },
    [isMac]
  );

  /** Resolve selection mode for drag selection. */
  const resolveSelectionMode = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const toggle = isMac ? event.metaKey : event.metaKey || event.ctrlKey;
      // macOS 下忽略 Ctrl，避免右键菜单触发框选切换。
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

  /** Cache selected entries for context menu actions. */
  const selectedEntries = useMemo(
    () => resolveSelectedEntries(selectedUris),
    [resolveSelectedEntries, selectedUris]
  );

  /** Handle left-click selection updates. */
  const handleEntryClick = useCallback(
    (entry: FileSystemEntry, event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      if (event.nativeEvent?.which && event.nativeEvent.which !== 1) return;
      if (isMac && event.ctrlKey) return;
      if (shouldToggleSelection(event)) {
        toggleSelection(entry.uri);
        clearContextTargetIfClosed();
        return;
      }
      replaceSelection([entry.uri]);
      clearContextTargetIfClosed();
    },
    [
      clearContextTargetIfClosed,
      isMac,
      replaceSelection,
      shouldToggleSelection,
      toggleSelection,
    ]
  );

  /** Handle selection updates from drag selection. */
  const handleSelectionChange = useCallback(
    (uris: string[], mode: "replace" | "toggle") => {
      applySelectionChange(uris, mode);
      clearContextTargetIfClosed();
    },
    [applySelectionChange, clearContextTargetIfClosed]
  );

  /** Preserve selection when starting a drag action. */
  const handleEntryDragStart = useCallback(
    (entry: FileSystemEntry, event: ReactDragEvent<HTMLButtonElement>) => {
      ensureSelected(entry.uri);
      model.handleEntryDragStart(entry, event);
    },
    [ensureSelected, model]
  );

  /** Sync selection to the drop target after a successful move. */
  const handleEntryDrop = useCallback(
    async (entry: FileSystemEntry, event: ReactDragEvent<HTMLButtonElement>) => {
      const movedCount = await model.handleEntryDrop(entry, event);
      if (movedCount > 0) {
        replaceSelection([entry.uri]);
      }
    },
    [model, replaceSelection]
  );

  /** Create a folder and enter rename mode. */
  const handleCreateFolder = async () => {
    const created = await model.handleCreateFolder();
    if (created) {
      requestRenameByInfo(created);
    }
  };

  useEffect(() => {
    // 目录切换时重置选择与重命名状态，避免沿用旧目录的引用。
    clearSelection();
    handleRenamingCancel();
    resetContextMenu();
  }, [clearSelection, handleRenamingCancel, model.activeUri, resetContextMenu]);

  if (!rootUri) {
    return <div className="p-4 text-sm text-muted-foreground">未绑定项目目录</div>;
  }

  // 通过 portal 把功能栏渲染到 header 右侧槽位，避免状态外提。
  const toolbarPortal = headerSlot?.toolbarMount
    ? createPortal(
        <div className="flex flex-wrap items-center justify-end gap-1 rounded-b-2xl px-4 py-2.5">
          {model.canUndo || model.canRedo ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="撤回"
                    disabled={!model.canUndo}
                    onClick={() => {
                      model.undo();
                    }}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  撤回
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="前进"
                    disabled={!model.canRedo}
                    onClick={() => {
                      model.redo();
                    }}
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  前进
                </TooltipContent>
              </Tooltip>
            </>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="切换排列方式"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              切换排列方式
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${
                  model.sortField === "name" ? "bg-foreground/10 text-foreground" : ""
                }`}
                aria-label="按字母排序"
                onClick={model.handleSortByName}
              >
                {model.sortField === "name" && model.sortOrder === "desc" ? (
                  <ArrowUpAZ className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownAZ className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              按字母排序
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${
                  model.sortField === "mtime" ? "bg-foreground/10 text-foreground" : ""
                }`}
                aria-label="按时间排序"
                onClick={model.handleSortByTime}
              >
                {model.sortField === "mtime" && model.sortOrder === "asc" ? (
                  <ArrowUpWideNarrow className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              按时间排序
            </TooltipContent>
          </Tooltip>
          <div className="mx-1 h-4 w-px bg-border/70" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="新建文件夹"
                onClick={handleCreateFolder}
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              新建文件夹
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="添加文件"
                onClick={() => {
                  model.uploadInputRef.current?.click();
                }}
              >
                <Upload className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              添加文件
            </TooltipContent>
          </Tooltip>
          <input
            ref={model.uploadInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={async (event) => {
              const input = event.currentTarget;
              const files = Array.from(input.files ?? []);
              if (files.length === 0) return;
              await model.handleUploadFiles(files);
              if (model.uploadInputRef.current) {
                model.uploadInputRef.current.value = "";
              } else {
                input.value = "";
              }
            }}
          />
          <div ref={model.searchContainerRef} className="flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 transition-[width,opacity] duration-150 ${
                    model.isSearchOpen
                      ? "w-0 opacity-0 pointer-events-none"
                      : "opacity-100"
                  }`}
                  aria-label="搜索"
                  onClick={() => model.setIsSearchOpen(true)}
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                搜索
              </TooltipContent>
            </Tooltip>
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
        <FileSystemContextMenu
          menuContextEntry={menuContextEntry}
          selectedEntries={selectedEntries}
          showHidden={model.showHidden}
          clipboardSize={model.clipboardSize}
          onOpenChange={handleContextMenuOpenChange}
          withMenuSelectGuard={withMenuSelectGuard}
          actions={{
            openEntry: model.handleOpen,
            openInFileManager: model.handleOpenInFileManager,
            openTransferDialog: model.handleOpenTransferDialog,
            copyPath: model.handleCopyPath,
            requestRename,
            deleteEntry: model.handleDelete,
            deleteEntries: model.handleDeleteBatch,
            deleteEntryPermanent: model.handleDeletePermanent,
            deleteEntriesPermanent: model.handleDeletePermanentBatch,
            showInfo: model.handleShowInfo,
            refreshList: model.refreshList,
            toggleHidden: () => model.setShowHidden((prev) => !prev),
            createFolder: handleCreateFolder,
            createBoard: model.handleCreateBoard,
            paste: model.handlePaste,
          }}
        >
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
                onEntryDrop={handleEntryDrop}
              />
            </div>
          </div>
        </FileSystemContextMenu>
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
