"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@tenas-ai/ui/breadcrumb";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tenas-ai/ui/dialog";
import { Button } from "@tenas-ai/ui/button";
import { PageTreePicker } from "@/components/layout/sidebar/ProjectTree";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useProjects } from "@/hooks/use-projects";
import { useFileSelection } from "@/hooks/use-file-selection";
import { trpc } from "@/utils/trpc";
import type { ProjectNode } from "@tenas-ai/api/services/projectTreeService";
import {
  IGNORE_NAMES,
  formatScopedProjectPath,
  getDisplayPathFromUri,
  getParentRelativePath,
  getRelativePathFromUri,
  getEntryExt,
  type FileSystemEntry,
} from "../utils/file-system-utils";
import { sortEntriesByType } from "../utils/entry-sort";
import { useFolderThumbnails } from "../hooks/use-folder-thumbnails";
import { FileSystemGrid } from "./FileSystemGrid";

export type ProjectFilePickerSelection = {
  /** Project-scoped file ref. */
  fileRef: string;
  /** Selected file entry. */
  entry: FileSystemEntry;
  /** Optional cached thumbnail for the selected file. */
  thumbnailSrc?: string;
  /** Project id for the selected file. */
  projectId?: string;
  /** Root uri for the selected project. */
  rootUri?: string;
};

type ProjectFilePickerDialogProps = {
  /** Whether the dialog is open. */
  open: boolean;
  /** Notify open state changes. */
  onOpenChange: (open: boolean) => void;
  /** Optional dialog title. */
  title?: string;
  /** Hint text shown near the breadcrumb. */
  filterHint?: string;
  /** Default root uri for the project tree. */
  defaultRootUri?: string;
  /** Default active folder uri for browsing. */
  defaultActiveUri?: string;
  /** Optional set of allowed extensions. */
  allowedExtensions?: Set<string>;
  /** Callback when a file is selected. */
  onSelectFile?: (selection: ProjectFilePickerSelection) => void;
  /** Callback when multiple files are selected. */
  onSelectFiles?: (selection: ProjectFilePickerSelection[]) => void;
};

type ProjectTreeNode = ProjectNode;

/** Flatten project tree to a list. */
function flattenProjects(nodes?: ProjectTreeNode[]) {
  const results: Array<{ rootUri: string; title: string; projectId?: string }> = [];
  const walk = (items?: ProjectTreeNode[]) => {
    items?.forEach((item) => {
      results.push({
        rootUri: item.rootUri,
        title: item.title,
        projectId: item.projectId,
      });
      if (item.children?.length) walk(item.children);
    });
  };
  walk(nodes);
  return results;
}

/** Normalize project tree for PageTreePicker. */
function normalizePageTreeProjects(nodes?: ProjectTreeNode[]): ProjectTreeNode[] {
  const walk = (items?: ProjectTreeNode[]): ProjectTreeNode[] =>
    (items ?? [])
      // 过滤掉缺失 projectId 的节点，避免 UI 产生不完整的项目入口。
      .filter((item) => Boolean(item.projectId))
      .map((item) => ({
        ...item,
        children: item.children?.length ? walk(item.children) : [],
      }));
  return walk(nodes);
}

/** Project file picker dialog for selecting a single file. */
export function ProjectFilePickerDialog({
  open,
  onOpenChange,
  title = "选择文件",
  filterHint,
  defaultRootUri,
  defaultActiveUri,
  allowedExtensions,
  onSelectFile,
  onSelectFiles,
}: ProjectFilePickerDialogProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const projectListQuery = useProjects();
  const projectOptions = useMemo(
    () => flattenProjects(projectListQuery.data as ProjectTreeNode[] | undefined),
    [projectListQuery.data]
  );
  const projectTree = useMemo(
    () => normalizePageTreeProjects(projectListQuery.data as ProjectTreeNode[] | undefined),
    [projectListQuery.data]
  );
  const projectIdByRootUri = useMemo(() => {
    const map = new Map<string, string>();
    projectOptions.forEach((item) => {
      if (item.rootUri && item.projectId) {
        map.set(item.rootUri, item.projectId);
      }
    });
    return map;
  }, [projectOptions]);

  const [activeRootUri, setActiveRootUri] = useState<string | null>(null);
  const [activeUri, setActiveUri] = useState<string | null>(null);

  const resolveInitialActiveUri = useCallback(
    (rootUri?: string | null, activeUri?: string | null) => {
      if (!rootUri) return null;
      if (!activeUri) return "";
      // 中文注释：确保默认目录在项目根目录下。
      return getRelativePathFromUri(rootUri, activeUri);
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    const nextRoot = defaultRootUri ?? projectOptions[0]?.rootUri ?? null;
    setActiveRootUri(nextRoot);
    setActiveUri(resolveInitialActiveUri(nextRoot, defaultActiveUri ?? null));
  }, [defaultActiveUri, defaultRootUri, open, projectOptions, resolveInitialActiveUri]);

  const activeProjectId = useMemo(
    () => (activeRootUri ? projectIdByRootUri.get(activeRootUri) : undefined),
    [activeRootUri, projectIdByRootUri]
  );
  const { thumbnailByUri } = useFolderThumbnails({
    currentUri: activeUri,
    projectId: activeProjectId,
  });

  const listQuery = useQuery(
    trpc.fs.list.queryOptions(
      activeUri !== null && workspaceId
        ? { workspaceId, projectId: activeProjectId, uri: activeUri }
        : skipToken
    )
  );

  const gridEntries = useMemo(() => {
    const entries = ((listQuery.data?.entries ?? []) as FileSystemEntry[]).filter(
      (entry) => !IGNORE_NAMES.has(entry.name)
    );
    const filtered = allowedExtensions
      ? entries.filter((entry) => {
          if (entry.kind === "folder") return true;
          const ext = getEntryExt(entry);
          return allowedExtensions.has(ext);
        })
      : entries;
    return sortEntriesByType(filtered);
  }, [allowedExtensions, listQuery.data?.entries]);

  const parentUri = useMemo(() => {
    if (activeUri === null) return null;
    return getParentRelativePath(activeUri);
  }, [activeUri]);

  const {
    selectedUris,
    replaceSelection,
    toggleSelection,
    applySelectionChange,
  } = useFileSelection();

  const selectedEntries = useMemo(
    () => gridEntries.filter((entry) => selectedUris.has(entry.uri)),
    [gridEntries, selectedUris]
  );
  const selectedFileEntries = useMemo(
    () => selectedEntries.filter((entry) => entry.kind === "file"),
    [selectedEntries]
  );

  const handleSelectProject = (uri: string) => {
    setActiveRootUri(uri);
    setActiveUri("");
  };

  const handleNavigate = (uri: string) => {
    setActiveUri(uri);
  };

  const resolveSelectionMode = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const toggle = event.metaKey || event.ctrlKey;
      // 中文注释：支持 Ctrl/Command 框选切换。
      return toggle ? "toggle" : "replace";
    },
    []
  );

  const handleEntryClick = useCallback(
    (entry: FileSystemEntry, event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      if (event.nativeEvent?.which && event.nativeEvent.which !== 1) return;
      if (event.metaKey || event.ctrlKey) {
        toggleSelection(entry.uri);
        return;
      }
      replaceSelection([entry.uri]);
    },
    [replaceSelection, toggleSelection]
  );

  const handleSelectionChange = useCallback(
    (uris: string[], mode: "replace" | "toggle") => {
      applySelectionChange(uris, mode);
    },
    [applySelectionChange]
  );

  const resolveFileRefFromEntry = useCallback(
    (entry: FileSystemEntry) => {
      if (!activeRootUri) return "";
      const projectId = projectIdByRootUri.get(activeRootUri);
      if (!projectId) return "";
      const relativePath = getRelativePathFromUri(activeRootUri, entry.uri);
      if (!relativePath) return "";
      return formatScopedProjectPath({ projectId, relativePath, includeAt: true });
    },
    [activeRootUri, projectIdByRootUri]
  );

  const handleConfirm = useCallback(
    (entry?: FileSystemEntry | null) => {
      const targetEntries = entry ? [entry] : selectedFileEntries;
      if (targetEntries.length === 0) return;
      const selections = targetEntries
        .filter((target) => target.kind === "file")
        .map((target) => {
          const fileRef = resolveFileRefFromEntry(target);
          if (!fileRef) return null;
          return {
            fileRef,
            entry: target,
            thumbnailSrc: thumbnailByUri.get(target.uri),
            projectId: activeProjectId,
            rootUri: activeRootUri ?? undefined,
          } satisfies ProjectFilePickerSelection;
        })
        .filter((selection): selection is ProjectFilePickerSelection => Boolean(selection));
      if (selections.length === 0) return;
      if (selections.length !== targetEntries.length) {
        toast.error("无法解析文件路径");
        return;
      }
      if (selections.length === 1) {
        onSelectFile?.(selections[0]);
      } else {
        onSelectFiles?.(selections);
        if (!onSelectFiles) {
          onSelectFile?.(selections[0]);
        }
      }
      onOpenChange(false);
    },
    [
      activeProjectId,
      activeRootUri,
      onOpenChange,
      onSelectFile,
      onSelectFiles,
      resolveFileRefFromEntry,
      selectedFileEntries,
      thumbnailByUri,
    ]
  );

  const breadcrumbItems = useMemo(() => {
    if (!activeRootUri || activeUri === null) return [];
    const rootRelative = getRelativePathFromUri(activeRootUri, activeRootUri);
    const currentRelative = getRelativePathFromUri(activeRootUri, activeUri);
    const rootParts = rootRelative ? rootRelative.split("/").filter(Boolean) : [];
    const currentParts = currentRelative ? currentRelative.split("/").filter(Boolean) : [];
    const relativeParts = currentParts.slice(rootParts.length);
    const decodeLabel = (value: string) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };
    const rootTitle =
      projectOptions.find((item) => item.rootUri === activeRootUri)?.title ??
      decodeLabel(getDisplayPathFromUri(activeRootUri));
    const items: Array<{ label: string; uri: string }> = [
      { label: rootTitle, uri: rootRelative },
    ];
    relativeParts.forEach((part, index) => {
      const nextUri = [...rootParts, ...relativeParts.slice(0, index + 1)].join("/");
      items.push({ label: decodeLabel(part), uri: nextUri });
    });
    return items;
  }, [activeRootUri, activeUri, projectOptions]);

  const confirmDisabled = selectedFileEntries.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onOpenChange(false);
          return;
        }
        onOpenChange(true);
      }}
    >
      <DialogContent className="w-[70vw] h-[80vh] max-w-none sm:max-w-none flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 md:grid-cols-[280px_minmax(0,1fr)] flex-1 min-h-0 overflow-hidden">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-3 min-h-0 overflow-y-auto">
            <div className="mb-2 flex h-6 items-center text-xs text-muted-foreground">项目</div>
            {projectOptions.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无可用项目</div>
            ) : (
              <PageTreePicker
                projects={projectTree}
                activeUri={activeRootUri}
                onSelect={handleSelectProject}
              />
            )}
          </div>
          <div className="min-h-[360px] rounded-2xl border border-border/60 bg-card/60 p-3 min-h-0 flex flex-col">
            <div className="mb-2 flex h-6 items-center justify-between gap-2 text-xs text-muted-foreground">
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbItems.length === 0 ? (
                    <BreadcrumbItem>
                      <BreadcrumbPage>请选择项目</BreadcrumbPage>
                    </BreadcrumbItem>
                  ) : (
                    breadcrumbItems.map((item, index) => {
                      const isLast = index === breadcrumbItems.length - 1;
                      return (
                        <Fragment key={item.uri}>
                          <BreadcrumbItem>
                            {isLast ? (
                              <BreadcrumbPage>{item.label}</BreadcrumbPage>
                            ) : (
                              <BreadcrumbLink asChild className="cursor-pointer">
                                <button type="button" onClick={() => handleNavigate(item.uri)}>
                                  {item.label}
                                </button>
                              </BreadcrumbLink>
                            )}
                          </BreadcrumbItem>
                          {!isLast ? <BreadcrumbSeparator /> : null}
                        </Fragment>
                      );
                    })
                  )}
                </BreadcrumbList>
              </Breadcrumb>
              <div className="text-[11px] text-muted-foreground">
                {filterHint ?? "仅显示可用文件"}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <FileSystemGrid
                entries={gridEntries}
                isLoading={listQuery.isLoading}
                parentUri={parentUri}
                rootUri={activeRootUri ?? undefined}
                currentUri={activeUri}
                projectId={activeProjectId ?? undefined}
                onNavigate={handleNavigate}
                selectedUris={selectedUris}
                onEntryClick={handleEntryClick}
                onSelectionChange={handleSelectionChange}
                resolveSelectionMode={resolveSelectionMode}
                onOpenVideo={(entry) => handleConfirm(entry)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">取消</Button>
          </DialogClose>
          <Button type="button" disabled={confirmDisabled} onClick={() => handleConfirm()}>
            确认选择
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
