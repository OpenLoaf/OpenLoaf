"use client";

import {
  Fragment,
  createContext,
  memo,
  useContext,
  useState,
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
import { FileSystemGrid } from "./FileSystemGrid";
import ProjectFileSystemCopyDialog from "./ProjectFileSystemCopyDialog";
import { DragDropOverlay } from "@/components/ui/teatime/drag-drop-overlay";
import { useProjectFileSystemModel } from "./file-system-model";

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
  const model = useProjectFileSystemModel({
    projectId,
    rootUri,
    currentUri,
    onNavigate,
  });
  const headerSlot = useProjectFileSystemHeaderSlot();

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
              onClick={model.handleCreateFolder}
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
        <ContextMenu>
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
                  selectedUris={model.selectedUris}
                  onEntryClick={(entry, event) => {
                    // 中文注释：支持多选，按住 Command/Ctrl 可切换选择。
                    if (event.metaKey || event.ctrlKey) {
                      model.setSelectedUris((prev) => {
                        const next = new Set(prev);
                        if (next.has(entry.uri)) {
                          next.delete(entry.uri);
                        } else {
                          next.add(entry.uri);
                        }
                        model.setSelectedUri(next.size === 1 ? entry.uri : null);
                        return next;
                      });
                      return;
                    }
                    model.setSingleSelection(entry.uri);
                  }}
                  onEntryContextMenu={(entry, event) => {
                    event.stopPropagation();
                    // 中文注释：右键项未被选中时，先单选该项。
                    if (!model.selectedUris.has(entry.uri)) {
                      model.setSingleSelection(entry.uri);
                    }
                  }}
                  onSelectionChange={(uris, mode) => {
                    model.setSelectedUris((prev) => {
                      const next = mode === "toggle" ? new Set(prev) : new Set<string>();
                      for (const uri of uris) {
                        if (mode === "toggle") {
                          if (next.has(uri)) {
                            next.delete(uri);
                          } else {
                            next.add(uri);
                          }
                        } else {
                          next.add(uri);
                        }
                      }
                      model.setSelectedUri(next.size === 1 ? Array.from(next)[0] : null);
                      return next;
                    });
                  }}
                  renamingUri={model.renamingUri}
                  renamingValue={model.renamingValue}
                  onRenamingChange={model.setRenamingValue}
                  onRenamingSubmit={model.handleRenameSubmit}
                  onRenamingCancel={model.handleRenameCancel}
                  onEntryDragStart={model.handleEntryDragStart}
                  onEntryDrop={model.handleEntryDrop}
                  renderEntry={(entry, card) => {
                    const isMultiSelect = model.selectedUris.size > 1;
                    return (
                      <ContextMenu key={entry.uri}>
                        <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
                        <ContextMenuContent className="w-52">
                          {isMultiSelect ? (
                            <ContextMenuItem disabled>
                              已选择 {model.selectedUris.size} 项
                            </ContextMenuItem>
                          ) : (
                            <>
                              <ContextMenuItem onSelect={() => model.handleOpen(entry)}>
                                打开
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => model.handleOpenInFileManager(entry)}
                              >
                                在文件管理器中打开
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onSelect={() => model.handleOpenCopyDialog(entry)}
                              >
                                复制到
                              </ContextMenuItem>
                              <ContextMenuItem onSelect={() => model.handleCopyPath(entry)}>
                                复制路径
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem onSelect={() => model.handleRename(entry)}>
                                重命名
                              </ContextMenuItem>
                              <ContextMenuItem onSelect={() => model.handleDelete(entry)}>
                                删除
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => model.handleDeletePermanent(entry)}
                              >
                                彻底删除
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem onSelect={() => model.handleShowInfo(entry)}>
                                基本信息
                              </ContextMenuItem>
                            </>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                }}
                />
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-44">
            <ContextMenuItem onSelect={model.refreshList}>刷新</ContextMenuItem>
            <ContextMenuItem onSelect={() => model.setShowHidden((prev) => !prev)}>
              {model.showHidden ? "✓ 显示隐藏" : "显示隐藏"}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={model.handleCreateFolder}>新建文件夹</ContextMenuItem>
            <ContextMenuItem disabled>新建文稿</ContextMenuItem>
            <ContextMenuItem onSelect={model.handleCreateBoard}>新建画布</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => {
                model.handlePaste();
              }}
              disabled={model.clipboardSize === 0}
            >
              粘贴
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <DragDropOverlay
          open={model.isDragActive}
          title="松开鼠标即可添加文件"
          radiusClassName="rounded-2xl"
        />
      </section>
      <ProjectFileSystemCopyDialog
        open={model.copyDialogOpen}
        onOpenChange={model.handleCopyDialogOpenChange}
        entry={model.copyEntry}
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
