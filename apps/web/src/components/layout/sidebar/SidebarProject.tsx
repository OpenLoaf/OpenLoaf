"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useProjects } from "@/hooks/use-projects";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { PageTreeMenu } from "./ProjectTree";
import { toast } from "sonner";
import { getDisplayPathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import { ClipboardCopy, FolderOpen, FolderPlus, RotateCw } from "lucide-react";

export const SidebarProject = () => {
  // 当前项目列表查询。
  const projectListQuery = useProjects();
  const projects = projectListQuery.data ?? [];
  const createProject = useMutation(trpc.project.create.mutationOptions());
  const { workspace } = useWorkspace();

  // 将状态提升到顶层组件，确保整个页面树只有一个状态管理
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(
    {}
  );

  const [isPlatformOpen, setIsPlatformOpen] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [folderName, setFolderName] = useState("");
  const [isFolderNameSynced, setIsFolderNameSynced] = useState(true);
  const [useCustomPath, setUseCustomPath] = useState(false);
  const [customPath, setCustomPath] = useState("");
  const [importPath, setImportPath] = useState("");
  const [enableVersionControl, setEnableVersionControl] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isImportBusy, setIsImportBusy] = useState(false);

  /** Create a new project and refresh list. */
  const handleCreateProject = async () => {
    const title = createTitle.trim();
    const folderNameValue = folderName.trim();
    try {
      setIsBusy(true);
      await createProject.mutateAsync({
        title: title || undefined,
        folderName: folderNameValue || undefined,
        rootUri: useCustomPath ? customPath.trim() || undefined : undefined,
        enableVersionControl,
      });
      toast.success("项目已创建");
      setCreateTitle("");
      setFolderName("");
      setIsFolderNameSynced(true);
      setUseCustomPath(false);
      setCustomPath("");
      setEnableVersionControl(true);
      setIsCreateOpen(false);
      // 中文注释：创建后刷新项目列表，确保新项目立即出现。
      await projectListQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "创建失败");
    } finally {
      setIsBusy(false);
    }
  };

  /** Refresh project list. */
  const handleRefreshProjects = async () => {
    try {
      await projectListQuery.refetch();
      toast.success("项目列表已刷新");
    } catch (err: any) {
      toast.error(err?.message ?? "刷新失败");
    }
  };

  /** Copy text to clipboard with fallback. */
  const copyTextToClipboard = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      // 中文注释：剪贴板 API 失败时使用降级复制。
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success(message);
    }
  };

  /** Copy workspace path to clipboard. */
  const handleCopyWorkspacePath = async () => {
    const rootUri = workspace?.rootUri;
    if (!rootUri) {
      toast.error("未找到工作空间路径");
      return;
    }
    const displayPath = getDisplayPathFromUri(rootUri);
    await copyTextToClipboard(displayPath, "已复制路径");
  };

  /** Pick a directory from system dialog (Electron only). */
  const pickDirectory = async (initialValue?: string) => {
    const api = window.tenasElectron;
    if (api?.pickDirectory) {
      const result = await api.pickDirectory(
        initialValue ? { defaultPath: initialValue } : undefined,
      );
      if (result?.ok && result.path) return result.path;
    }
    if (initialValue) return initialValue;
    return null;
  };

  /** Import an existing project into workspace config. */
  const handleImportProject = async () => {
    const path = importPath.trim();
    if (!path) {
      toast.error("请选择项目目录");
      return;
    }
    try {
      setIsImportBusy(true);
      // 中文注释：导入时直接写入配置并刷新列表，避免多余弹窗。
      await createProject.mutateAsync({
        rootUri: path,
        enableVersionControl,
      });
      toast.success("项目已导入");
      setIsImportOpen(false);
      setImportPath("");
      setEnableVersionControl(true);
      await projectListQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "导入失败");
    } finally {
      setIsImportBusy(false);
    }
  };

  return (
    <>
      {/* Nav Main */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex h-full flex-col">
            <CollapsiblePrimitive.Root
              open={isPlatformOpen}
              onOpenChange={setIsPlatformOpen}
              asChild
            >
              <SidebarGroup className="group pt-0">
                <CollapsiblePrimitive.Trigger asChild>
                  <SidebarGroupLabel className="cursor-pointer">
                    <span className="text-muted-foreground">项目</span>
                  </SidebarGroupLabel>
                </CollapsiblePrimitive.Trigger>
                <CollapsiblePrimitive.Content className="data-[state=closed]:overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down data-[state=open]:overflow-visible">
                  <SidebarMenu>
                    <PageTreeMenu
                      projects={projects}
                      expandedNodes={expandedNodes}
                      setExpandedNodes={setExpandedNodes}
                    />
                  </SidebarMenu>
                </CollapsiblePrimitive.Content>
              </SidebarGroup>
            </CollapsiblePrimitive.Root>
            <div className="flex-1" />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem icon={RotateCw} onClick={() => void handleRefreshProjects()}>
            刷新
          </ContextMenuItem>
          <ContextMenuItem
            icon={ClipboardCopy}
            onClick={() => void handleCopyWorkspacePath()}
          >
            复制工作空间路径
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem icon={FolderPlus} onClick={() => setIsCreateOpen(true)}>
            新建项目
          </ContextMenuItem>
          <ContextMenuItem icon={FolderOpen} onClick={() => setIsImportOpen(true)}>
            导入项目
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsCreateOpen(true);
            setEnableVersionControl(true);
            return;
          }
          setIsCreateOpen(false);
          setCreateTitle("");
          setFolderName("");
          setIsFolderNameSynced(true);
          setUseCustomPath(false);
          setCustomPath("");
          setEnableVersionControl(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="project-title" className="text-right">
                显示名称
              </Label>
              <Input
                id="project-title"
                value={createTitle}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setCreateTitle(nextValue);
                  // 中文注释：文件夹名称未手动修改时，默认与显示名称同步。
                  if (isFolderNameSynced) {
                    setFolderName(nextValue);
                  }
                }}
                className="col-span-3"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleCreateProject();
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="project-folder-name" className="text-right">
                文件夹名称
              </Label>
              <Input
                id="project-folder-name"
                value={folderName}
                onChange={(event) => {
                  setFolderName(event.target.value);
                  setIsFolderNameSynced(false);
                }}
                className="col-span-3"
                placeholder="默认与显示名称一致"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleCreateProject();
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="project-custom-path" className="text-right">
                自定义路径
              </Label>
              <div className="col-span-3 flex items-center gap-3">
                <Switch
                  checked={useCustomPath}
                  onCheckedChange={(checked) => setUseCustomPath(Boolean(checked))}
                />
                <span className="text-xs text-muted-foreground">
                  勾选后可指定项目目录
                </span>
              </div>
            </div>
            {useCustomPath ? (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="project-custom-path-input" className="text-right">
                  路径
                </Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Input
                    id="project-custom-path-input"
                    value={customPath}
                    onChange={(event) => setCustomPath(event.target.value)}
                    placeholder="/path/to/project"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      const next = await pickDirectory(customPath);
                      if (!next) return;
                      setCustomPath(next);
                    }}
                  >
                    选择
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="project-version-control" className="text-right">
                是否开启项目版本控制
              </Label>
              <div className="col-span-3 flex items-center gap-3">
                <Switch
                  id="project-version-control"
                  checked={enableVersionControl}
                  onCheckedChange={(checked) =>
                    setEnableVersionControl(Boolean(checked))
                  }
                />
                <span className="text-xs text-muted-foreground">
                  默认启用，可随时关闭
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                取消
              </Button>
            </DialogClose>
            <Button onClick={handleCreateProject} disabled={isBusy}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isImportOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsImportOpen(true);
            setEnableVersionControl(true);
            setImportPath("");
            return;
          }
          setIsImportOpen(false);
          setImportPath("");
          setEnableVersionControl(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入项目</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="project-import-path" className="text-right">
                路径
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <Input
                  id="project-import-path"
                  value={importPath}
                  onChange={(event) => setImportPath(event.target.value)}
                  placeholder="file://... 或 /path/to/project"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const next = await pickDirectory(importPath);
                    if (!next) return;
                    setImportPath(next);
                  }}
                >
                  选择
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="project-import-version-control" className="text-right">
                是否开启项目版本控制
              </Label>
              <div className="col-span-3 flex items-center gap-3">
                <Switch
                  id="project-import-version-control"
                  checked={enableVersionControl}
                  onCheckedChange={(checked) =>
                    setEnableVersionControl(Boolean(checked))
                  }
                />
                <span className="text-xs text-muted-foreground">
                  默认启用，可随时关闭
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                取消
              </Button>
            </DialogClose>
            <Button onClick={handleImportProject} disabled={isImportBusy}>
              导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
};
