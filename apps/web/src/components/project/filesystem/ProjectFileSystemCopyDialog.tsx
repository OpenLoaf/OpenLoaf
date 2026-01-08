"use client";

import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { toast } from "sonner";
import { PageTreePicker } from "@/components/layout/sidebar/PageTree";
import FileSystemGridController, {
  type FileSystemGridControllerHandle,
} from "./FileSystemGridController";
import { FolderPlus } from "lucide-react";
import {
  IGNORE_NAMES,
  buildChildUri,
  getDisplayPathFromUri,
  getUniqueName,
  type FileSystemEntry,
} from "./file-system-utils";

type ProjectTreeNode = {
  projectId?: string;
  rootUri: string;
  title: string;
  icon?: string;
  children?: ProjectTreeNode[];
};

type PageTreeProject = {
  projectId: string;
  rootUri: string;
  title: string;
  icon?: string;
  children?: PageTreeProject[];
};

type ProjectFileSystemCopyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: FileSystemEntry | null;
  defaultRootUri?: string;
};

/** Flatten project tree to a list. */
function flattenProjects(nodes?: ProjectTreeNode[]) {
  const results: Array<{ rootUri: string; title: string }> = [];
  const walk = (items?: ProjectTreeNode[]) => {
    items?.forEach((item) => {
      results.push({ rootUri: item.rootUri, title: item.title });
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };
  walk(nodes);
  return results;
}

/** Normalize project tree for PageTreePicker. */
function normalizePageTreeProjects(nodes?: ProjectTreeNode[]): PageTreeProject[] {
  const walk = (items?: ProjectTreeNode[]): PageTreeProject[] =>
    (items ?? [])
      // 过滤掉缺失 projectId 的节点，避免 UI 产生不完整的项目入口。
      .filter((item) => Boolean(item.projectId))
      .map((item) => ({
        projectId: item.projectId ?? item.rootUri,
        rootUri: item.rootUri,
        title: item.title,
        icon: item.icon,
        children: item.children?.length ? walk(item.children) : undefined,
      }));
  return walk(nodes);
}

/** Copy-to dialog with project tree and file grid. */
const ProjectFileSystemCopyDialog = memo(function ProjectFileSystemCopyDialog({
  open,
  onOpenChange,
  entry,
  defaultRootUri,
}: ProjectFileSystemCopyDialogProps) {
  const queryClient = useQueryClient();
  const projectListQuery = useQuery(trpc.project.list.queryOptions());
  const [activeRootUri, setActiveRootUri] = useState<string | null>(
    defaultRootUri ?? null
  );
  const [activeUri, setActiveUri] = useState<string | null>(
    defaultRootUri ?? null
  );
  const gridControllerRef = useRef<FileSystemGridControllerHandle>(null);

  const copyMutation = useMutation(trpc.fs.copy.mutationOptions());
  const mkdirMutation = useMutation(trpc.fs.mkdir.mutationOptions());
  const renameMutation = useMutation(trpc.fs.rename.mutationOptions());
  const listQuery = useQuery(
    trpc.fs.list.queryOptions(activeUri ? { uri: activeUri } : skipToken)
  );

  const projectOptions = useMemo(
    () => flattenProjects(projectListQuery.data as ProjectTreeNode[] | undefined),
    [projectListQuery.data]
  );
  const projectTree = useMemo(
    () => normalizePageTreeProjects(projectListQuery.data as ProjectTreeNode[] | undefined),
    [projectListQuery.data]
  );
  const entries = ((listQuery.data?.entries ?? []) as FileSystemEntry[]).filter(
    (entry) => !IGNORE_NAMES.has(entry.name)
  );
  const parentUri = useMemo(() => {
    if (!activeUri || !activeRootUri) return null;
    const rootUrl = new URL(activeRootUri);
    const currentUrl = new URL(activeUri);
    const rootParts = rootUrl.pathname.split("/").filter(Boolean);
    const currentParts = currentUrl.pathname.split("/").filter(Boolean);
    // 已到根目录时不再返回上级。
    if (currentParts.length <= rootParts.length) return null;
    const parentParts = currentParts.slice(0, -1);
    const parentUrl = new URL(activeRootUri);
    parentUrl.pathname = `/${parentParts.join("/")}`;
    return parentUrl.toString();
  }, [activeUri, activeRootUri]);

  useEffect(() => {
    if (!open) return;
    const nextRoot = defaultRootUri ?? null;
    setActiveRootUri(nextRoot);
    setActiveUri(nextRoot);
  }, [open, defaultRootUri]);

  const handleSelectProject = (uri: string) => {
    setActiveRootUri(uri);
    setActiveUri(uri);
  };

  const handleNavigate = (uri: string) => {
    setActiveUri(uri);
  };

  const handleCopy = async () => {
    if (!entry || !activeUri) return;
    try {
      const targetList = await queryClient.fetchQuery(
        trpc.fs.list.queryOptions({ uri: activeUri })
      );
      const targetNames = new Set(
        (targetList.entries ?? []).map((item) => item.name)
      );
      const targetName = getUniqueName(entry.name, targetNames);
      const targetUri = buildChildUri(activeUri, targetName);
      await copyMutation.mutateAsync({ from: entry.uri, to: targetUri });
      toast.success("已复制");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message ?? "复制失败");
    }
  };

  /** Build breadcrumb items for the selected directory. */
  const breadcrumbItems = useMemo(() => {
    if (!activeRootUri || !activeUri) return [];
    const rootUrl = new URL(activeRootUri);
    const currentUrl = new URL(activeUri);
    const rootParts = rootUrl.pathname.split("/").filter(Boolean);
    const currentParts = currentUrl.pathname.split("/").filter(Boolean);
    // 中文注释：仅展示根目录之后的路径片段，避免重复显示整条绝对路径。
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
      { label: rootTitle, uri: activeRootUri },
    ];
    relativeParts.forEach((part, index) => {
      const nextUrl = new URL(activeRootUri);
      nextUrl.pathname = `/${[...rootParts, ...relativeParts.slice(0, index + 1)].join("/")}`;
      items.push({ label: decodeLabel(part), uri: nextUrl.toString() });
    });
    return items;
  }, [activeRootUri, activeUri, projectOptions]);

  /** Create a new folder in the target directory. */
  const handleCreateFolder = async () => {
    if (!activeUri) return;
    try {
      // 以默认名称创建并做唯一性处理，避免覆盖已有目录。
      const existingNames = new Set(entries.map((item) => item.name));
      const targetName = getUniqueName("新建文件夹", existingNames);
      const targetUri = buildChildUri(activeUri, targetName);
      await mkdirMutation.mutateAsync({ uri: targetUri, recursive: true });
      gridControllerRef.current?.requestRename({ uri: targetUri, name: targetName });
      await listQuery.refetch();
      toast.success("已新建文件夹");
    } catch (error: any) {
      toast.error(error?.message ?? "新建失败");
    }
  };

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
          <DialogTitle>复制到</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 md:grid-cols-[280px_minmax(0,1fr)] flex-1 min-h-0 overflow-hidden">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-3 min-h-0 overflow-y-auto">
            <div className="mb-2 flex h-6 items-center text-xs text-muted-foreground">
              项目
            </div>
            {projectOptions.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无可用项目</div>
            ) : (
              <PageTreePicker
                projects={projectTree}
                activeUri={activeUri}
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
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                type="button"
                aria-label="新建文件夹"
                title="新建文件夹"
                onClick={handleCreateFolder}
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <FileSystemGridController
                ref={gridControllerRef}
                entries={entries}
                isLoading={listQuery.isLoading}
                parentUri={parentUri}
                onNavigate={handleNavigate}
                showEmptyActions={false}
                canRenameEntry={(item) => item.kind === "folder"}
                contextMenuClassName="w-40"
                onRename={async (target, nextName) => {
                  if (!activeUri) return null;
                  try {
                    const targetUri = buildChildUri(activeUri, nextName);
                    await renameMutation.mutateAsync({
                      from: target.uri,
                      to: targetUri,
                    });
                    await listQuery.refetch();
                    toast.success("已重命名");
                    return targetUri;
                  } catch (error: any) {
                    toast.error(error?.message ?? "重命名失败");
                    return null;
                  }
                }}
                renderContextMenu={(item, ctx) => {
                  if (item.kind !== "folder") return null;
                  return (
                    <ContextMenuItem onSelect={ctx.startRename}>
                      重命名
                    </ContextMenuItem>
                  );
                }}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">取消</Button>
          </DialogClose>
          <Button
            type="button"
            onClick={handleCopy}
            disabled={!entry || !activeUri}
          >
            确认复制
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export default ProjectFileSystemCopyDialog;
