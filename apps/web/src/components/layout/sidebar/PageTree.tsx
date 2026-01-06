"use client";

import { startTransition, useMemo, useState } from "react";
import { useTabs } from "@/hooks/use-tabs";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { ChevronRight, FileText, Folder } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { toast } from "sonner";
import {
  BOARD_FILE_EXT,
  ensureBoardFileName,
  getDisplayFileName,
  isBoardFileExt,
} from "@/lib/file-name";
import { Switch } from "@/components/ui/switch";
import {
  buildTeatimeFileUrl,
  getRelativePathFromUri,
} from "@/components/project/filesystem/file-system-utils";

type ProjectInfo = {
  projectId: string;
  title: string;
  icon?: string;
  rootUri: string;
  children?: ProjectInfo[];
};

type FileNode = {
  uri: string;
  name: string;
  kind: "project" | "folder" | "file";
  ext?: string;
  children?: FileNode[];
  projectId?: string;
  projectIcon?: string;
};

type RenameTarget = {
  node: FileNode;
  nextName: string;
};

type ChildProjectTarget = {
  node: FileNode;
  title: string;
  useCustomPath: boolean;
  customPath: string;
};

type ImportChildTarget = {
  node: FileNode;
  path: string;
};


interface PageTreeMenuProps {
  projects: ProjectInfo[];
  expandedNodes: Record<string, boolean>;
  setExpandedNodes: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  activeUri: string | null;
  expandedNodes: Record<string, boolean>;
  setExpanded: (uri: string, isExpanded: boolean) => void;
  onPrimaryClick: (node: FileNode) => void;
  renderContextMenuContent: (node: FileNode) => React.ReactNode;
  contextSelectedUri: string | null;
  onContextMenuOpenChange: (node: FileNode, open: boolean) => void;
}

function resolveFileComponent(ext?: string) {
  if (!ext) return "file-viewer";
  if (ext === "ttdoc") return "file-viewer";
  if (ext === "ttcanvas") return "file-viewer";
  if (ext === BOARD_FILE_EXT) return "board-viewer";
  if (ext === "ttskill") return "file-viewer";
  if (ext === "pdf") return "pdf-viewer";
  if (ext === "doc" || ext === "docx") return "doc-viewer";
  if (ext === "xls" || ext === "xlsx" || ext === "csv" || ext === "tsv") return "sheet-viewer";
  return "file-viewer";
}

function buildNextUri(uri: string, nextName: string) {
  const url = new URL(uri);
  const segments = url.pathname.split("/");
  segments[segments.length - 1] = nextName;
  url.pathname = segments.join("/");
  return url.toString();
}

function getParentUri(uri: string) {
  const url = new URL(uri);
  const segments = url.pathname.split("/");
  segments.pop();
  const nextPath = segments.join("/") || "/";
  url.pathname = nextPath;
  return url.toString();
}

/** Build project nodes recursively from API payload. */
function buildProjectNode(project: ProjectInfo): FileNode {
  const children = Array.isArray(project.children)
    ? project.children.map(buildProjectNode)
    : [];
  return {
    uri: project.rootUri,
    name: project.title || "Untitled Project",
    kind: "project",
    children,
    projectId: project.projectId,
    projectIcon: project.icon,
  };
}

/** Render a file tree node recursively. */
function FileTreeNode({
  node,
  depth,
  activeUri,
  expandedNodes,
  setExpanded,
  onPrimaryClick,
  renderContextMenuContent,
  contextSelectedUri,
  onContextMenuOpenChange,
}: FileTreeNodeProps) {
  const isExpanded = expandedNodes[node.uri] ?? false;
  const isActive = activeUri === node.uri || contextSelectedUri === node.uri;
  const listQuery = useQuery(
    trpc.fs.list.queryOptions(
      node.kind === "folder" && isExpanded ? { uri: node.uri } : skipToken
    )
  );
  const fileChildren = listQuery.data?.entries ?? [];
  const projectChildren = node.kind === "project" ? node.children ?? [] : [];
  const children = node.kind === "project" ? projectChildren : fileChildren;
  const hasChildren = node.kind === "project" ? children.length > 0 : true;

  const Item = depth === 0 ? SidebarMenuItem : SidebarMenuSubItem;
  const Button = depth === 0 ? SidebarMenuButton : SidebarMenuSubButton;

  if (node.kind === "file") {
    const displayName = getDisplayFileName(node.name, node.ext);
    return (
      <Item key={node.uri}>
        <ContextMenu onOpenChange={(open) => onContextMenuOpenChange(node, open)}>
          <ContextMenuTrigger asChild>
            <Button
              tooltip={displayName}
              isActive={isActive}
              className="text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
              onClick={() => onPrimaryClick(node)}
            >
              <FileText className="h-4 w-4" />
              <span>{displayName}</span>
            </Button>
          </ContextMenuTrigger>
          {renderContextMenuContent(node)}
        </ContextMenu>
      </Item>
    );
  }

  return (
    <CollapsiblePrimitive.Root
      key={node.uri}
      asChild
      open={isExpanded}
      onOpenChange={(open) => setExpanded(node.uri, open)}
      className="group/collapsible"
    >
      <Item>
        <ContextMenu onOpenChange={(open) => onContextMenuOpenChange(node, open)}>
          <ContextMenuTrigger asChild>
            <Button
              tooltip={node.name}
              isActive={isActive}
              className="text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
              onClick={() => onPrimaryClick(node)}
            >
              {node.projectIcon ? (
                <span className="text-sm leading-none">{node.projectIcon}</span>
              ) : (
                <Folder className="h-4 w-4" />
              )}
              <span>{node.name}</span>
            </Button>
          </ContextMenuTrigger>
          {renderContextMenuContent(node)}
        </ContextMenu>
        {hasChildren ? (
          <CollapsiblePrimitive.Trigger asChild>
            <SidebarMenuAction
              aria-label="Toggle"
              className="text-muted-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <ChevronRight className="transition-transform duration-300 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuAction>
          </CollapsiblePrimitive.Trigger>
        ) : null}
        <CollapsiblePrimitive.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <SidebarMenuSub className="mx-1 px-1">
            {children.map((child: any) => (
              <FileTreeNode
                key={child.uri}
                node={{
                  uri: child.uri,
                  name: child.name,
                  kind: child.kind,
                  ext: child.ext,
                  children: child.children,
                  projectId: child.projectId,
                  projectIcon: child.projectIcon,
                }}
                depth={depth + 1}
                activeUri={activeUri}
                expandedNodes={expandedNodes}
                setExpanded={setExpanded}
                onPrimaryClick={onPrimaryClick}
                renderContextMenuContent={renderContextMenuContent}
                contextSelectedUri={contextSelectedUri}
                onContextMenuOpenChange={onContextMenuOpenChange}
              />
            ))}
          </SidebarMenuSub>
        </CollapsiblePrimitive.Content>
      </Item>
    </CollapsiblePrimitive.Root>
  );
}

export const PageTreeMenu = ({
  projects,
  expandedNodes,
  setExpandedNodes,
}: PageTreeMenuProps) => {
  const addTab = useTabs((s) => s.addTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const activeTabId = useTabs((s) => s.activeTabId);
  const tabs = useTabs((s) => s.tabs);
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const renameProject = useMutation(trpc.project.update.mutationOptions());
  const createProject = useMutation(trpc.project.create.mutationOptions());
  const removeProject = useMutation(trpc.project.remove.mutationOptions());
  const renameFile = useMutation(trpc.fs.rename.mutationOptions());
  const deleteFile = useMutation(trpc.fs.delete.mutationOptions());
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null);
  const [contextSelectedUri, setContextSelectedUri] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [createChildTarget, setCreateChildTarget] = useState<ChildProjectTarget | null>(null);
  const [importChildTarget, setImportChildTarget] = useState<ImportChildTarget | null>(null);
  const [isChildBusy, setIsChildBusy] = useState(false);
  const [isImportChildBusy, setIsImportChildBusy] = useState(false);
  /** Remove target for project detach. */
  const [removeTarget, setRemoveTarget] = useState<FileNode | null>(null);
  /** Busy state for removing project. */
  const [isRemoveBusy, setIsRemoveBusy] = useState(false);

  const activeUri = useMemo(() => {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    const params = activeTab?.base?.params as any;
    if (params?.rootUri && typeof params.rootUri === "string") return params.rootUri;
    if (params?.uri && typeof params.uri === "string") return params.uri;
    return null;
  }, [activeTabId, tabs]);

  const setExpanded = (uri: string, isExpanded: boolean) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [uri]: isExpanded,
    }));
  };

  const projectRootById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) {
      if (project.projectId && project.rootUri) {
        map.set(project.projectId, project.rootUri);
      }
    }
    return map;
  }, [projects]);

  const openProjectTab = (project: ProjectInfo) => {
    if (!workspace?.id) return;
    const baseId = `project:${project.projectId}`;
    const existing = tabs.find(
      (tab) => tab.workspaceId === workspace.id && tab.base?.id === baseId,
    );
    if (existing) {
      startTransition(() => {
        setActiveTab(existing.id);
      });
      return;
    }

    addTab({
      workspaceId: workspace.id,
      createNew: true,
      title: project.title || "Untitled Project",
      icon: project.icon ?? undefined,
      leftWidthPercent: 90,
      base: {
        id: baseId,
        component: "plant-page",
        params: { projectId: project.projectId, rootUri: project.rootUri },
      },
      chatParams: { projectId: project.projectId },
    });
  };

  const openFileTab = (node: FileNode) => {
    if (!workspace?.id) return;
    const component = resolveFileComponent(node.ext);
    const baseId = `file:${node.uri}`;
    const displayName = getDisplayFileName(node.name, node.ext);
    const existing = tabs.find(
      (tab) => tab.workspaceId === workspace.id && tab.base?.id === baseId,
    );
    if (existing) {
      startTransition(() => {
        setActiveTab(existing.id);
      });
      return;
    }

    const resolvedUri =
      component === "pdf-viewer" && node.projectId
        ? (() => {
            const rootUri = projectRootById.get(node.projectId);
            if (!rootUri) return node.uri;
            const relativePath = getRelativePathFromUri(rootUri, node.uri);
            if (!relativePath) return node.uri;
            return buildTeatimeFileUrl(node.projectId, relativePath);
          })()
        : node.uri;

    const needsCustomHeader =
      component === "pdf-viewer" || component === "doc-viewer" || component === "sheet-viewer";
    addTab({
      workspaceId: workspace.id,
      createNew: true,
      title: displayName,
      icon: "📄",
      leftWidthPercent: 70,
      base: {
        id: baseId,
        component,
        params: {
          uri: resolvedUri,
          name: node.name,
          ext: node.ext,
          ...(needsCustomHeader ? { __customHeader: true } : {}),
        },
      },
      chatParams: { projectId: node.projectId },
    });
  };

  const handlePrimaryClick = (node: FileNode) => {
    if (node.kind === "project") {
      openProjectTab({
        projectId: node.projectId ?? node.uri,
        title: node.name,
        icon: node.projectIcon,
        rootUri: node.uri,
      });
      return;
    }
    if (node.kind === "file") {
      openFileTab(node);
      return;
    }
    setExpanded(node.uri, !(expandedNodes[node.uri] ?? false));
  };

  const openRenameDialog = (node: FileNode) => {
    const displayName = getDisplayFileName(node.name, node.ext);
    setRenameTarget({ node, nextName: displayName });
  };

  const openDeleteDialog = (node: FileNode) => {
    if (node.kind === "project") return;
    setDeleteTarget(node);
  };

  /** Open the remove confirmation dialog for project node. */
  const openRemoveDialog = (node: FileNode) => {
    if (node.kind !== "project") return;
    setRemoveTarget(node);
  };

  /** Pick a directory from system dialog (Electron only). */
  const pickDirectory = async (initialValue?: string) => {
    const api = window.teatimeElectron;
    if (api?.pickDirectory) {
      const result = await api.pickDirectory();
      if (result?.ok && result.path) return result.path;
    }
    if (initialValue) return initialValue;
    return null;
  };

  const openCreateChildDialog = (node: FileNode) => {
    if (node.kind !== "project") return;
    setCreateChildTarget({
      node,
      title: "",
      useCustomPath: false,
      customPath: "",
    });
  };

  const openImportChildDialog = async (node: FileNode) => {
    if (node.kind !== "project") return;
    const picked = await pickDirectory();
    if (!picked) return;
    setImportChildTarget({
      node,
      path: picked,
    });
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const rawName = renameTarget.nextName.trim();
    if (!rawName) return;
    const nextName = isBoardFileExt(renameTarget.node.ext)
      ? ensureBoardFileName(rawName)
      : rawName;
    try {
      setIsBusy(true);
      if (renameTarget.node.kind === "project") {
        if (!renameTarget.node.projectId) {
          throw new Error("缺少项目 ID");
        }
        await renameProject.mutateAsync({
          projectId: renameTarget.node.projectId,
          title: nextName,
        });
      } else {
        const nextUri = buildNextUri(renameTarget.node.uri, nextName);
        await renameFile.mutateAsync({
          from: renameTarget.node.uri,
          to: nextUri,
        });
      }
      toast.success("重命名成功");
      setRenameTarget(null);
      await queryClient.invalidateQueries({
        queryKey: trpc.project.list.queryOptions().queryKey,
      });
      if (renameTarget.node.kind !== "project") {
        const parentUri = getParentUri(renameTarget.node.uri);
        await queryClient.invalidateQueries({
          queryKey: trpc.fs.list.queryOptions({ uri: parentUri }).queryKey,
        });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "重命名失败");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsBusy(true);
      await deleteFile.mutateAsync({ uri: deleteTarget.uri, recursive: true });
      toast.success("已删除");
      const parentUri = getParentUri(deleteTarget.uri);
      await queryClient.invalidateQueries({
        queryKey: trpc.fs.list.queryOptions({ uri: parentUri }).queryKey,
      });
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.message ?? "删除失败");
    } finally {
      setIsBusy(false);
    }
  };

  /** Remove project from list without deleting files. */
  const handleRemoveProject = async () => {
    if (!removeTarget?.projectId) {
      toast.error("缺少项目 ID");
      return;
    }
    try {
      setIsRemoveBusy(true);
      await removeProject.mutateAsync({ projectId: removeTarget.projectId });
      toast.success("项目已移除");
      setRemoveTarget(null);
      await queryClient.invalidateQueries({
        queryKey: trpc.project.list.queryOptions().queryKey,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "移除失败");
    } finally {
      setIsRemoveBusy(false);
    }
  };

  const handleCreateChildProject = async () => {
    if (!createChildTarget?.node?.projectId) {
      toast.error("缺少项目 ID");
      return;
    }
    const title = createChildTarget.title.trim();
    try {
      setIsChildBusy(true);
      await createProject.mutateAsync({
        title: title || undefined,
        rootUri: createChildTarget.useCustomPath
          ? createChildTarget.customPath.trim() || undefined
          : undefined,
        parentProjectId: createChildTarget.node.projectId,
      });
      toast.success("子项目已创建");
      setCreateChildTarget(null);
      await queryClient.invalidateQueries({
        queryKey: trpc.project.list.queryOptions().queryKey,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "创建失败");
    } finally {
      setIsChildBusy(false);
    }
  };

  const handleImportChildProject = async () => {
    if (!importChildTarget?.node?.projectId) {
      toast.error("缺少项目 ID");
      return;
    }
    const path = importChildTarget.path.trim();
    if (!path) {
      toast.error("请输入路径");
      return;
    }
    try {
      setIsImportChildBusy(true);
      await createProject.mutateAsync({
        rootUri: path,
        parentProjectId: importChildTarget.node.projectId,
      });
      toast.success("子项目已导入");
      setImportChildTarget(null);
      await queryClient.invalidateQueries({
        queryKey: trpc.project.list.queryOptions().queryKey,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "导入失败");
    } finally {
      setIsImportChildBusy(false);
    }
  };

  const renderContextMenuContent = (node: FileNode) => (
    <ContextMenuContent className="w-52">
      {node.kind === "file" || node.kind === "project" ? (
        <ContextMenuItem onClick={() => handlePrimaryClick(node)}>
          打开
        </ContextMenuItem>
      ) : null}
      {node.kind === "project" ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => openCreateChildDialog(node)}>
            新建子项目
          </ContextMenuItem>
          <ContextMenuItem onClick={() => void openImportChildDialog(node)}>
            导入子项目
          </ContextMenuItem>
        </>
      ) : null}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => openRenameDialog(node)}>重命名</ContextMenuItem>
      {node.kind === "project" ? (
        <ContextMenuItem onClick={() => openRemoveDialog(node)}>移除</ContextMenuItem>
      ) : (
        <ContextMenuItem onClick={() => openDeleteDialog(node)}>删除</ContextMenuItem>
      )}
    </ContextMenuContent>
  );

  const handleContextMenuOpenChange = (node: FileNode, open: boolean) => {
    setContextSelectedUri(open ? node.uri : null);
  };

  return (
    <>
      {projects.map((project) => (
        <FileTreeNode
          key={project.rootUri}
          node={buildProjectNode(project)}
          depth={0}
          activeUri={activeUri}
          expandedNodes={expandedNodes}
          setExpanded={setExpanded}
          onPrimaryClick={handlePrimaryClick}
          renderContextMenuContent={renderContextMenuContent}
          contextSelectedUri={contextSelectedUri}
          onContextMenuOpenChange={handleContextMenuOpenChange}
        />
      ))}

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (open) return;
          setRenameTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名</DialogTitle>
            <DialogDescription>请输入新的名称。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="node-title" className="text-right">
                名称
              </Label>
              <Input
                id="node-title"
                value={renameTarget?.nextName ?? ""}
                onChange={(event) =>
                  setRenameTarget((prev) =>
                    prev ? { ...prev, nextName: event.target.value } : prev
                  )
                }
                className="col-span-3"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleRename();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                取消
              </Button>
            </DialogClose>
            <Button onClick={handleRename} disabled={isBusy}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(createChildTarget)}
        onOpenChange={(open) => {
          if (open) return;
          setCreateChildTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建子项目</DialogTitle>
            <DialogDescription>请输入子项目名称。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="child-project-title" className="text-right">
                名称
              </Label>
              <Input
                id="child-project-title"
                value={createChildTarget?.title ?? ""}
                onChange={(event) =>
                  setCreateChildTarget((prev) =>
                    prev ? { ...prev, title: event.target.value } : prev
                  )
                }
                className="col-span-3"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleCreateChildProject();
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="child-project-custom-path" className="text-right">
                自定义路径
              </Label>
              <div className="col-span-3 flex items-center gap-3">
                <Switch
                  checked={createChildTarget?.useCustomPath ?? false}
                  onCheckedChange={(checked) =>
                    setCreateChildTarget((prev) =>
                      prev ? { ...prev, useCustomPath: Boolean(checked) } : prev
                    )
                  }
                />
                <span className="text-xs text-muted-foreground">
                  勾选后可指定项目目录
                </span>
              </div>
            </div>
            {createChildTarget?.useCustomPath ? (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="child-project-path" className="text-right">
                  路径
                </Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Input
                    id="child-project-path"
                    value={createChildTarget?.customPath ?? ""}
                    onChange={(event) =>
                      setCreateChildTarget((prev) =>
                        prev ? { ...prev, customPath: event.target.value } : prev
                      )
                    }
                    placeholder="file://... 或 /path/to/project"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      const next = await pickDirectory(createChildTarget?.customPath);
                      if (!next) return;
                      setCreateChildTarget((prev) =>
                        prev ? { ...prev, customPath: next } : prev
                      );
                    }}
                  >
                    选择
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                取消
              </Button>
            </DialogClose>
            <Button onClick={handleCreateChildProject} disabled={isChildBusy}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(importChildTarget)}
        onOpenChange={(open) => {
          if (open) return;
          setImportChildTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入子项目</DialogTitle>
            <DialogDescription>确认子项目目录后导入配置。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="import-child-path" className="text-right">
                路径
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <Input
                  id="import-child-path"
                  value={importChildTarget?.path ?? ""}
                  onChange={(event) =>
                    setImportChildTarget((prev) =>
                      prev ? { ...prev, path: event.target.value } : prev
                    )
                  }
                  placeholder="file://... 或 /path/to/project"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const next = await pickDirectory(importChildTarget?.path);
                    if (!next) return;
                    setImportChildTarget((prev) =>
                      prev ? { ...prev, path: next } : prev
                    );
                  }}
                >
                  选择
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                取消
              </Button>
            </DialogClose>
            <Button onClick={handleImportChildProject} disabled={isImportChildBusy}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (open) return;
          setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除这个文件吗？此操作无法撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                取消
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={isBusy}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (open) return;
          setRemoveTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认移除</DialogTitle>
            <DialogDescription>仅从项目列表移除，不会删除磁盘内容。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                取消
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleRemoveProject} disabled={isRemoveBusy}>
              移除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

type PageTreePickerProps = {
  projects?: ProjectInfo[];
  activeUri?: string | null;
  onSelect: (uri: string) => void;
};

/** Project tree picker (folder selection only). */
export const PageTreePicker = ({
  projects,
  activeUri,
  onSelect,
}: PageTreePickerProps) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  const setExpanded = (uri: string, isExpanded: boolean) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [uri]: isExpanded,
    }));
  };

  const handlePrimaryClick = (node: FileNode) => {
    if (node.kind === "file") return;
    if (node.kind === "project") {
      onSelect(node.uri);
    }
    const isExpanded = expandedNodes[node.uri] ?? false;
    setExpanded(node.uri, !isExpanded);
  };

  const renderContextMenuContent = () => null;

  if (!projects?.length) {
    return null;
  }

  return (
    <SidebarProvider className="min-h-0 w-full">
      <div className="w-full">
        {projects.map((project) => (
          <FileTreeNode
            key={project.rootUri}
            node={buildProjectNode(project)}
            depth={0}
            activeUri={activeUri ?? null}
            expandedNodes={expandedNodes}
            setExpanded={setExpanded}
            onPrimaryClick={handlePrimaryClick}
            renderContextMenuContent={renderContextMenuContent}
            contextSelectedUri={null}
            onContextMenuOpenChange={() => undefined}
          />
        ))}
      </div>
    </SidebarProvider>
  );
};
