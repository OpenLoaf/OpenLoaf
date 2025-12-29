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
} from "@/components/animate-ui/components/radix/sidebar";
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

type ProjectInfo = {
  projectId: string;
  title: string;
  icon?: string;
  rootUri: string;
};

type FileNode = {
  uri: string;
  name: string;
  kind: "folder" | "file";
  ext?: string;
  isProjectRoot?: boolean;
  projectId?: string;
  projectIcon?: string;
};

type RenameTarget = {
  node: FileNode;
  nextName: string;
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
  if (ext === "ttskill") return "file-viewer";
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
  const children = listQuery.data?.entries ?? [];

  const Item = depth === 0 ? SidebarMenuItem : SidebarMenuSubItem;
  const Button = depth === 0 ? SidebarMenuButton : SidebarMenuSubButton;

  if (node.kind === "file") {
    return (
      <Item key={node.uri}>
        <ContextMenu onOpenChange={(open) => onContextMenuOpenChange(node, open)}>
          <ContextMenuTrigger asChild>
            <Button
              tooltip={node.name}
              size="default"
              isActive={isActive}
              className="text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
              onClick={() => onPrimaryClick(node)}
            >
              <FileText className="h-4 w-4" />
              <span>{node.name}</span>
            </Button>
          </ContextMenuTrigger>
          {renderContextMenuContent(node)}
        </ContextMenu>
      </Item>
    );
  }

  return (
    <Collapsible
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
              size="default"
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
        <CollapsibleTrigger asChild>
          <SidebarMenuAction
            aria-label="Toggle"
            className="text-muted-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <ChevronRight className="transition-transform duration-300 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <SidebarMenuSub className="mx-1 px-1">
            {children.map((child: any) => (
              <FileTreeNode
                key={child.uri}
                node={{
                  uri: child.uri,
                  name: child.name,
                  kind: child.kind,
                  ext: child.ext,
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
        </CollapsibleContent>
      </Item>
    </Collapsible>
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
  const renameFile = useMutation(trpc.fs.rename.mutationOptions());
  const deleteFile = useMutation(trpc.fs.delete.mutationOptions());
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null);
  const [contextSelectedUri, setContextSelectedUri] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

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
      chatParams: { resourceUri: project.rootUri },
    });
  };

  const openFileTab = (node: FileNode) => {
    if (!workspace?.id) return;
    const component = resolveFileComponent(node.ext);
    const baseId = `file:${node.uri}`;
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
      title: node.name,
      icon: "📄",
      leftWidthPercent: 70,
      base: {
        id: baseId,
        component,
        params: { uri: node.uri, name: node.name, ext: node.ext },
      },
      chatParams: { resourceUri: node.uri },
    });
  };

  const handlePrimaryClick = (node: FileNode) => {
    if (node.isProjectRoot) {
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
    setRenameTarget({ node, nextName: node.name });
  };

  const openDeleteDialog = (node: FileNode) => {
    if (node.isProjectRoot) return;
    setDeleteTarget(node);
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const nextName = renameTarget.nextName.trim();
    if (!nextName) return;
    try {
      setIsBusy(true);
      if (renameTarget.node.isProjectRoot) {
        await renameProject.mutateAsync({
          rootUri: renameTarget.node.uri,
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
      if (!renameTarget.node.isProjectRoot) {
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

  const renderContextMenuContent = (node: FileNode) => (
    <ContextMenuContent className="w-52">
      {node.kind === "file" || node.isProjectRoot ? (
        <ContextMenuItem onClick={() => handlePrimaryClick(node)}>
          在新标签页打开
        </ContextMenuItem>
      ) : null}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => openRenameDialog(node)}>重命名</ContextMenuItem>
      <ContextMenuItem onClick={() => openDeleteDialog(node)} disabled={node.isProjectRoot}>
        删除
      </ContextMenuItem>
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
          node={{
            uri: project.rootUri,
            name: project.title || "Untitled Project",
            kind: "folder",
            isProjectRoot: true,
            projectId: project.projectId,
            projectIcon: project.icon,
          }}
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
    </>
  );
};
