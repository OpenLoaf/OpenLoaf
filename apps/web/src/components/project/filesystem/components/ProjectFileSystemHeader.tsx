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

import {
  Fragment,
  memo,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
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

type ProjectFileSystemBreadcrumbHeaderProps = {
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

/** Project file system header with breadcrumbs only. */
const ProjectFileSystemHeader = memo(function ProjectFileSystemHeader({
  isLoading,
  rootUri,
  currentUri,
  projectLookup,
  onNavigate,
}: ProjectFileSystemBreadcrumbHeaderProps) {
  const breadcrumbItems = buildFileBreadcrumbs(rootUri, currentUri, projectLookup);

  if (isLoading) {
    return null;
  }

  return (
    <div className="project-files-header flex min-w-0 w-full px-4 pt-1 pb-0">
      <div className="project-files-header-panel flex min-w-0 flex-1 items-center gap-2 rounded-3xl border border-border/60 bg-muted/40 px-2 py-1.5">
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
  const { t } = useTranslation(['project']);
  const isGridView = viewMode === "grid";
  const isListView = viewMode === "list";
  const isColumnsView = viewMode === "columns";
  const isTreeView = viewMode === "tree";

  const btnBase = "h-7 w-7 shrink-0 transition-colors duration-150";
  const iconSize = "size-3.5";
  const toggleItemBase = `h-7 w-7 min-w-7 px-0 rounded-3xl text-foreground/50 transition-colors duration-150 data-[state=on]:bg-accent data-[state=on]:text-foreground`;

  return (
    <div className="flex items-center gap-1" data-no-drag="true">
      {/* View mode toggles */}
      <Toolbar>
        <ToolbarToggleGroup
          type="single"
          value={viewMode}
          className="gap-0.5"
          onValueChange={(value) => {
            if (!value) return;
            onViewModeChange(value as FileSystemViewMode);
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <ToolbarToggleItem value="grid" size="sm" className={toggleItemBase} aria-label={t('project:filesystem.gridView')}>
                <LayoutGrid className={iconSize} />
              </ToolbarToggleItem>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>{t('project:filesystem.gridView')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <ToolbarToggleItem value="list" size="sm" className={toggleItemBase} aria-label={t('project:filesystem.listView')}>
                <LayoutList className={iconSize} />
              </ToolbarToggleItem>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>{t('project:filesystem.listView')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <ToolbarToggleItem value="columns" size="sm" className={toggleItemBase} aria-label={t('project:filesystem.columnsView')}>
                <Columns2 className={iconSize} />
              </ToolbarToggleItem>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>{t('project:filesystem.columnsView')}</TooltipContent>
          </Tooltip>
          {isTreeViewEnabled ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <ToolbarToggleItem value="tree" size="sm" className={toggleItemBase} aria-label={t('project:filesystem.treeView')}>
                  <FolderTree className={iconSize} />
                </ToolbarToggleItem>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>{t('project:filesystem.treeView')}</TooltipContent>
            </Tooltip>
          ) : null}
        </ToolbarToggleGroup>
      </Toolbar>

      <div className="mx-1 h-5 w-px bg-foreground/20" />

      {/* Sort */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`${btnBase} ${sortField === "name" ? "text-foreground" : "text-foreground/50 hover:text-foreground"}`}
            aria-label={t('project:filesystem.sortByName')}
            onClick={onSortByName}
          >
            {sortField === "name" && sortOrder === "asc" ? <ArrowUpAZ className={iconSize} /> : <ArrowDownAZ className={iconSize} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>{t('project:filesystem.sortByName')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`${btnBase} ${sortField === "mtime" ? "text-foreground" : "text-foreground/50 hover:text-foreground"}`}
            aria-label={t('project:filesystem.sortByTime')}
            onClick={onSortByTime}
          >
            {sortField === "mtime" && sortOrder === "asc" ? <ArrowUpWideNarrow className={iconSize} /> : <ArrowDownWideNarrow className={iconSize} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>{t('project:filesystem.sortByTime')}</TooltipContent>
      </Tooltip>

      <div className="mx-1 h-5 w-px bg-foreground/20" />

      {/* Actions */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={`${btnBase} text-foreground/80 hover:text-foreground`} aria-label={t('project:filesystem.newFolder')} onClick={onCreateFolder}>
            <FolderPlus className={iconSize} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>{t('project:filesystem.newFolder')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={`${btnBase} text-foreground/80 hover:text-foreground`} aria-label={t('project:filesystem.newDocument')} onClick={onCreateDocument}>
            <FilePlus className={iconSize} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>{t('project:filesystem.newDocument')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={`${btnBase} text-foreground/80 hover:text-foreground`} aria-label={t('project:filesystem.addFile')} onClick={() => uploadInputRef.current?.click()}>
            <Upload className={iconSize} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>{t('project:filesystem.addFile')}</TooltipContent>
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

      {/* Search */}
      <div ref={searchContainerRef} className="flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`${btnBase} text-foreground/50 hover:text-foreground ${isSearchVisible ? "w-0 overflow-hidden opacity-0 pointer-events-none" : "opacity-100"}`}
              aria-label={t('project:filesystem.searchLabel')}
              onClick={() => onSearchOpenChange(true)}
            >
              <Search className={iconSize} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {t('project:filesystem.searchWithShortcut', { shortcut: searchShortcutLabel })}
          </TooltipContent>
        </Tooltip>
        <div
          className={`relative overflow-hidden rounded-3xl bg-foreground/5 transition-[width,opacity] duration-150 ease-linear ${
            isSearchVisible ? "w-44 opacity-100" : "w-0 opacity-0"
          }`}
        >
          <Input
            ref={searchInputRef}
            className="h-7 w-44 border-0 bg-transparent px-2 text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder={t('project:filesystem.searchFiles')}
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

      {/* Undo / Redo */}
      {canUndo || canRedo ? (
        <>
          <div className="mx-1 h-5 w-px bg-foreground/20" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={`${btnBase} text-foreground/50 hover:text-foreground disabled:opacity-30`} aria-label={t('project:filesystem.undo')} disabled={!canUndo} onClick={onUndo}>
                <Undo2 className={iconSize} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>{t('project:filesystem.undo')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={`${btnBase} text-foreground/50 hover:text-foreground disabled:opacity-30`} aria-label={t('project:filesystem.redo')} disabled={!canRedo} onClick={onRedo}>
                <Redo2 className={iconSize} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>{t('project:filesystem.redo')}</TooltipContent>
          </Tooltip>
        </>
      ) : null}
    </div>
  );
});

ProjectFileSystemHeader.displayName = "ProjectFileSystemHeader";
ProjectFileSystemBreadcrumbs.displayName = "ProjectFileSystemBreadcrumbs";
ProjectFileSystemToolbar.displayName = "ProjectFileSystemToolbar";

export { ProjectFileSystemHeader, ProjectFileSystemToolbar };
export type { ProjectFileSystemToolbarProps };
