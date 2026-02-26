/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import {
  Fragment,
  memo,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@openloaf/ui/breadcrumb";
import { Button } from "@openloaf/ui/button";
import { Input } from "@openloaf/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { Toolbar, ToolbarToggleGroup, ToolbarToggleItem } from "@openloaf/ui/toolbar";
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  ArrowUpWideNarrow,
  Columns2,
  FilePlus,
  FolderPlus,
  FolderTree,
  LayoutGrid,
  LayoutList,
  Redo2,
  Search,
  Undo2,
  Upload,
} from "lucide-react";
import {
  buildFileUriFromRoot,
  getRelativePathFromUri,
} from "../utils/file-system-utils";

type FileSystemViewMode = "grid" | "list" | "columns" | "tree";

export type ProjectBreadcrumbInfo = {
  title: string;
  icon?: string;
};

type ProjectBreadcrumbItem = {
  label: string;
  uri: string;
};

type ProjectFileSystemToolbarProps = {
  /** Whether undo is available. */
  canUndo: boolean;
  /** Whether redo is available. */
  canRedo: boolean;
  /** Trigger undo action. */
  onUndo: () => void;
  /** Trigger redo action. */
  onRedo: () => void;
  /** Current view mode. */
  viewMode: FileSystemViewMode;
  /** Whether tree view is enabled. */
  isTreeViewEnabled: boolean;
  /** Handle view mode changes. */
  onViewModeChange: (mode: FileSystemViewMode) => void;
  /** Current sort field. */
  sortField: "name" | "mtime" | null;
  /** Current sort order. */
  sortOrder: "asc" | "desc" | null;
  /** Sort by name. */
  onSortByName: () => void;
  /** Sort by time. */
  onSortByTime: () => void;
  /** Create folder action. */
  onCreateFolder: () => void;
  /** Create document action. */
  onCreateDocument: () => void;
  /** Upload files action. */
  onUploadFiles: (files: File[]) => Promise<void>;
  /** Upload input ref. */
  uploadInputRef: RefObject<HTMLInputElement | null>;
  /** Search container ref. */
  searchContainerRef: RefObject<HTMLDivElement | null>;
  /** Search input ref. */
  searchInputRef: RefObject<HTMLInputElement | null>;
  /** Current search value. */
  searchValue: string;
  /** Whether search input is visible. */
  isSearchVisible: boolean;
  /** Update search value. */
  onSearchValueChange: (value: string) => void;
  /** Toggle search open state. */
  onSearchOpenChange: (open: boolean) => void;
  /** Shortcut label for search. */
  searchShortcutLabel: string;
};

type ProjectFileSystemHeaderProps = ProjectFileSystemToolbarProps & {
  /** Whether the file system data is loading. */
  isLoading: boolean;
  /** Root uri for the current project. */
  rootUri?: string;
  /** Current folder uri. */
  currentUri?: string | null;
  /** Lookup map for project breadcrumb titles. */
  projectLookup?: Map<string, ProjectBreadcrumbInfo>;
  /** Navigate to target uri. */
  onNavigate?: (nextUri: string) => void;
};

/** Build breadcrumb items for the project file system. */
function buildFileBreadcrumbs(
  rootUri?: string,
  currentUri?: string | null,
  projectLookup?: Map<string, ProjectBreadcrumbInfo>
): ProjectBreadcrumbItem[] {
  if (!rootUri || !currentUri) return [];
  const rootRelative = getRelativePathFromUri(rootUri, rootUri);
  const currentRelative = getRelativePathFromUri(rootUri, currentUri);
  const rootParts = rootRelative ? rootRelative.split("/").filter(Boolean) : [];
  const currentParts = currentRelative ? currentRelative.split("/").filter(Boolean) : [];
  const relativeParts = currentParts.slice(rootParts.length);
  const items: ProjectBreadcrumbItem[] = [];
  let accumParts = [...rootParts];
  // 从 root 向下拼接，构建可点击的面包屑路径。
  for (const part of relativeParts) {
    accumParts = [...accumParts, part];
    const nextRelative = accumParts.join("/");
    const lookupUri = rootUri.startsWith("file://")
      ? buildFileUriFromRoot(rootUri, nextRelative)
      : "";
    const info = lookupUri ? projectLookup?.get(lookupUri) : undefined;
    items.push({
      label: info?.title ?? decodePathSegment(part),
      uri: nextRelative,
    });
  }
  return items;
}

/** Decode a breadcrumb segment for display. */
function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Project file system header with breadcrumbs and toolbar. */
const ProjectFileSystemHeader = memo(function ProjectFileSystemHeader({
  isLoading,
  rootUri,
  currentUri,
  projectLookup,
  onNavigate,
  ...toolbarProps
}: ProjectFileSystemHeaderProps) {
  const breadcrumbItems = buildFileBreadcrumbs(rootUri, currentUri, projectLookup);

  if (isLoading) {
    return null;
  }

  return (
    <div className="project-files-header flex min-w-0 w-full pl-2">
      <div className="project-files-header-panel flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 px-2">
        <div className="project-files-header-title flex items-center gap-2 min-w-0">
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
        <div className="project-files-header-controls flex min-w-0 items-center justify-end">
          <ProjectFileSystemToolbar {...toolbarProps} />
        </div>
      </div>
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
}: {
  isLoading: boolean;
  rootUri?: string;
  currentUri?: string | null;
  projectLookup?: Map<string, ProjectBreadcrumbInfo>;
  onNavigate?: (nextUri: string) => void;
  items?: ProjectBreadcrumbItem[];
}) {
  const baseItems = items ?? buildFileBreadcrumbs(rootUri, currentUri, projectLookup);
  const rootRelative = rootUri ? getRelativePathFromUri(rootUri, rootUri) : "";
  const breadcrumbItems = rootUri
    ? [{ label: "/", uri: rootRelative }, ...baseItems]
    : baseItems;
  const isVisible = !isLoading && breadcrumbItems.length > 0;
  const breadcrumbKey = useMemo(
    () => breadcrumbItems.map((item) => item.uri).join("|"),
    [breadcrumbItems]
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVisible) return;
    const container = scrollRef.current;
    if (!container) return;
    // 默认滚动到最右侧，确保当前目录可见。
    requestAnimationFrame(() => {
      container.scrollLeft = container.scrollWidth;
    });
  }, [breadcrumbKey, isVisible]);

  return (
    <div className="relative flex min-w-0 items-center">
      <div
        ref={scrollRef}
        className={`flex items-center justify-end gap-1 min-w-0 max-w-full overflow-x-auto overflow-y-hidden ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <Breadcrumb className="min-w-max ml-auto">
          <BreadcrumbList className="flex-nowrap whitespace-nowrap break-normal text-xs">
            {breadcrumbItems.map((item, index) => {
              const isLast = index === breadcrumbItems.length - 1;
              const isRootItem = Boolean(rootUri) && index === 0 && item.uri === rootUri;
              const shouldUseLink = !isLast || isRootItem;
              return (
                <Fragment key={`${item.uri}-${index}`}>
                  <BreadcrumbItem>
                    {shouldUseLink ? (
                      <BreadcrumbLink asChild className="cursor-pointer">
                        <button type="button" onClick={() => onNavigate?.(item.uri)}>
                          <span>{item.label}</span>
                        </button>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>
                        <span>{item.label}</span>
                      </BreadcrumbPage>
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
        className={`absolute inset-y-0 left-0 flex items-center ${
          isVisible ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <span className="h-4 w-32" />
      </div>
    </div>
  );
});

/** Render toolbar controls for the project file system. */
const ProjectFileSystemToolbar = memo(function ProjectFileSystemToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  viewMode,
  isTreeViewEnabled,
  onViewModeChange,
  sortField,
  sortOrder,
  onSortByName,
  onSortByTime,
  onCreateFolder,
  onCreateDocument,
  onUploadFiles,
  uploadInputRef,
  searchContainerRef,
  searchInputRef,
  searchValue,
  isSearchVisible,
  onSearchValueChange,
  onSearchOpenChange,
  searchShortcutLabel,
}: ProjectFileSystemToolbarProps) {
  const isGridView = viewMode === "grid";
  const isListView = viewMode === "list";
  const isColumnsView = viewMode === "columns";
  const isTreeView = viewMode === "tree";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 px-1 py-0.5">
      {canUndo || canRedo ? (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground"
                aria-label="撤回"
                disabled={!canUndo}
                onClick={onUndo}
              >
                <Undo2 className="size-3" />
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
                className="h-5 w-5 text-muted-foreground"
                aria-label="前进"
                disabled={!canRedo}
                onClick={onRedo}
              >
                <Redo2 className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              前进
            </TooltipContent>
          </Tooltip>
        </>
      ) : null}
      <div className="flex items-center rounded-lg border border-border/60 bg-background/70 p-0.5">
        <Toolbar className="rounded-md">
          <ToolbarToggleGroup
            type="single"
            value={viewMode}
            className="gap-1"
            onValueChange={(value) => {
              if (!value) return;
              onViewModeChange(value as FileSystemViewMode);
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <ToolbarToggleItem
                  value="grid"
                  size="sm"
                  className="h-5 w-5 min-w-5 px-0 text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground"
                  aria-label="网格视图"
                >
                  <LayoutGrid className="size-3" />
                </ToolbarToggleItem>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                网格视图
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <ToolbarToggleItem
                  value="list"
                  size="sm"
                  className="h-5 w-5 min-w-5 px-0 text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground"
                  aria-label="列表视图"
                >
                  <LayoutList className="size-3" />
                </ToolbarToggleItem>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                列表视图
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <ToolbarToggleItem
                  value="columns"
                  size="sm"
                  className="h-5 w-5 min-w-5 px-0 text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground"
                  aria-label="列视图"
                >
                  <Columns2 className="size-3" />
                </ToolbarToggleItem>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                列视图
              </TooltipContent>
            </Tooltip>
            {isTreeViewEnabled ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToolbarToggleItem
                    value="tree"
                    size="sm"
                    className="h-5 w-5 min-w-5 px-0 text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground"
                    aria-label="文件树视图"
                  >
                    <FolderTree className="size-3" />
                  </ToolbarToggleItem>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  文件树视图
                </TooltipContent>
              </Tooltip>
            ) : null}
          </ToolbarToggleGroup>
        </Toolbar>
      </div>
      <div className="mx-1 h-4 w-px bg-border/70" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`h-5 w-5 text-muted-foreground ${
                sortField === "name" ? "bg-foreground/10 text-foreground" : ""
              }`}
              aria-label="按字母排序"
              onClick={onSortByName}
            >
            {sortField === "name" && sortOrder === "asc" ? (
              <ArrowUpAZ className="size-3" />
            ) : (
              <ArrowDownAZ className="size-3" />
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
              className={`h-5 w-5 text-muted-foreground ${
                sortField === "mtime" ? "bg-foreground/10 text-foreground" : ""
              }`}
              aria-label="按时间排序"
              onClick={onSortByTime}
            >
            {sortField === "mtime" && sortOrder === "asc" ? (
              <ArrowUpWideNarrow className="size-3" />
            ) : (
              <ArrowDownWideNarrow className="size-3" />
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
              className="h-5 w-5 text-muted-foreground"
              aria-label="新建文件夹"
              onClick={onCreateFolder}
            >
              <FolderPlus className="size-3" />
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
              className="h-5 w-5 text-muted-foreground"
              aria-label="新建文稿"
              onClick={onCreateDocument}
            >
              <FilePlus className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          新建文稿
        </TooltipContent>
      </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground"
              aria-label="添加文件"
              onClick={() => {
                uploadInputRef.current?.click();
              }}
          >
            <Upload className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          添加文件
        </TooltipContent>
      </Tooltip>
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={async (event) => {
          const input = event.currentTarget;
          const files = Array.from(input.files ?? []);
          if (files.length === 0) return;
          await onUploadFiles(files);
          if (uploadInputRef.current) {
            uploadInputRef.current.value = "";
          } else {
            input.value = "";
          }
        }}
      />
      <div ref={searchContainerRef} className="flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`h-5 w-5 text-muted-foreground duration-150 ease-linear ${
                isSearchVisible ? "w-0 opacity-0 pointer-events-none" : "opacity-100"
              }`}
              aria-label="搜索"
              onClick={() => onSearchOpenChange(true)}
            >
              <Search className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {`搜索 (${searchShortcutLabel})`}
          </TooltipContent>
        </Tooltip>
        <div
          className={`relative overflow-hidden rounded-md ring-1 ring-border/60 bg-background/80 transition-[width,opacity] duration-150 ease-linear ${
            isSearchVisible ? "w-52 opacity-100" : "w-0 opacity-0"
          }`}
        >
          <Input
            ref={searchInputRef}
            className="h-5 w-52 border-0 bg-transparent px-2.5 text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="搜索文件或文件夹"
            type="search"
            value={searchValue}
            onChange={(event) => onSearchValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (searchValue.trim()) {
                  onSearchValueChange("");
                  return;
                }
                onSearchOpenChange(false);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
});

ProjectFileSystemHeader.displayName = "ProjectFileSystemHeader";
ProjectFileSystemBreadcrumbs.displayName = "ProjectFileSystemBreadcrumbs";
ProjectFileSystemToolbar.displayName = "ProjectFileSystemToolbar";

export { ProjectFileSystemHeader };
