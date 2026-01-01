"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/animate-ui/components/radix/sidebar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
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
import { PageTreeMenu } from "./PageTree";
import { toast } from "sonner";

export const SidebarPage = () => {
  const queryClient = useQueryClient();
  const { data: projects = [] } = useQuery(trpc.project.list.queryOptions());
  const createProject = useMutation(trpc.project.create.mutationOptions());

  // 将状态提升到顶层组件，确保整个页面树只有一个状态管理
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(
    {}
  );

  const [isPlatformOpen, setIsPlatformOpen] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [useCustomPath, setUseCustomPath] = useState(false);
  const [customPath, setCustomPath] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importPath, setImportPath] = useState("");
  const [isImportBusy, setIsImportBusy] = useState(false);

  /** Create a new project and refresh list. */
  const handleCreateProject = async () => {
    const title = createTitle.trim();
    try {
      setIsBusy(true);
      await createProject.mutateAsync({
        title: title || undefined,
        rootUri: useCustomPath ? customPath.trim() || undefined : undefined,
      });
      toast.success("项目已创建");
      setCreateTitle("");
      setUseCustomPath(false);
      setCustomPath("");
      setIsCreateOpen(false);
      // 中文注释：创建后刷新项目列表，确保新项目立即出现。
      await queryClient.invalidateQueries({
        queryKey: trpc.project.list.queryOptions().queryKey,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "创建失败");
    } finally {
      setIsBusy(false);
    }
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

  /** Import an existing project into workspace config. */
  const handleImportProject = async () => {
    const picked = await pickDirectory(importPath);
    setIsCreateOpen(false);
    setImportPath(picked ?? importPath);
    setIsImportOpen(true);
  };

  const handleConfirmImport = async () => {
    const targetPath = importPath.trim();
    if (!targetPath) return;
    try {
      setIsImportBusy(true);
      await createProject.mutateAsync({ rootUri: targetPath });
      toast.success("项目已导入");
      setImportPath("");
      setIsImportOpen(false);
      await queryClient.invalidateQueries({
        queryKey: trpc.project.list.queryOptions().queryKey,
      });
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
                <CollapsiblePrimitive.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
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
          <ContextMenuItem onClick={() => setIsCreateOpen(true)}>
            新建项目
          </ContextMenuItem>
          <ContextMenuItem onClick={() => void handleImportProject()}>
            导入项目
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsCreateOpen(true);
            return;
          }
          setIsCreateOpen(false);
          setCreateTitle("");
          setUseCustomPath(false);
          setCustomPath("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>请输入项目名称。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="project-title" className="text-right">
                名称
              </Label>
              <Input
                id="project-title"
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
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
                    placeholder="file://... 或 /path/to/project"
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
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                取消
              </Button>
            </DialogClose>
            <Button variant="secondary" type="button" onClick={() => void handleImportProject()}>
              导入项目
            </Button>
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
            return;
          }
          setIsImportOpen(false);
          setImportPath("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入项目</DialogTitle>
            <DialogDescription>确认项目目录后导入配置。</DialogDescription>
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
                  onClick={() => void handleImportProject()}
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
            <Button onClick={handleConfirmImport} disabled={isImportBusy}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
