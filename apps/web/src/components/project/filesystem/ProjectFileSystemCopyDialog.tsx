"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { PageTreePicker } from "@/components/layout/sidebar/PageTree";
import { FileSystemGrid } from "./FileSystemGrid";
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
      // 中文注释：过滤掉缺失 projectId 的节点，避免 UI 产生不完整的项目入口。
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

  const copyMutation = useMutation(trpc.fs.copy.mutationOptions());
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

  const targetLabel = activeUri ? getDisplayPathFromUri(activeUri) : "";

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
      <DialogContent className="sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>复制到</DialogTitle>
          <DialogDescription>选择目标项目与文件夹。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-3">
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
          <div className="min-h-[360px] rounded-2xl border border-border/60 bg-card/60 p-4">
            <div className="mb-3 text-xs text-muted-foreground truncate">
              目标位置：{targetLabel || "请选择项目"}
            </div>
            <FileSystemGrid
              entries={entries}
              isLoading={listQuery.isLoading}
              parentUri={parentUri}
              onNavigate={handleNavigate}
              showEmptyActions={false}
            />
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
