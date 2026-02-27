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

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Building2,
  Check,
  ChevronsUpDown,
  LogIn,
  LogOut,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@openloaf/ui/sidebar";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { queryClient, trpc } from "@/utils/trpc";
import { getDisplayPathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@openloaf/ui/avatar";
import { Button } from "@openloaf/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { Input } from "@openloaf/ui/input";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import { useTabs } from "@/hooks/use-tabs";

export const SidebarWorkspace = () => {
  const { workspace } = useWorkspace();
  // Workspace create dialog open state.
  const [createOpen, setCreateOpen] = React.useState(false);
  // Workspace name input value.
  const [newWorkspaceName, setNewWorkspaceName] = React.useState("");
  // Workspace root path input value.
  const [newWorkspacePath, setNewWorkspacePath] = React.useState("");
  // Login dialog open state.
  const [loginOpen, setLoginOpen] = React.useState(false);
  // Workspace dropdown open state.
  const [workspaceOpen, setWorkspaceOpen] = React.useState(false);
  const {
    loggedIn: authLoggedIn,
    user: authUser,
    refreshSession,
    logout,
  } = useSaasAuth();
  const resetWorkspaceTabsToDesktop = useTabs(
    (state) => state.resetWorkspaceTabsToDesktop,
  );

  React.useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  React.useEffect(() => {
    if (authLoggedIn && loginOpen) {
      setLoginOpen(false);
    }
  }, [authLoggedIn, loginOpen]);

  React.useEffect(() => {
    if (!createOpen) return;
    setNewWorkspaceName("");
    setNewWorkspacePath("");
  }, [createOpen]);

  const workspacesQuery = useQuery(trpc.workspace.getList.queryOptions());
  // 微信登录账号展示规则。
  const isWechatLogin = Boolean(authUser?.email?.endsWith("@wechat.local"));
  const baseAccountLabel =
    authUser?.email ?? authUser?.name ?? (authLoggedIn ? "已登录" : undefined);
  const sidebarAccountLabel = isWechatLogin
    ? authUser?.name?.trim() || "微信用户"
    : baseAccountLabel;
  const dropdownAccountLabel = isWechatLogin ? "微信登录" : baseAccountLabel;
  const avatarAlt = sidebarAccountLabel ?? "User";
  const displayAvatar = authUser?.avatarUrl;

  const activateWorkspace = useMutation(
    trpc.workspace.activate.mutationOptions(),
  );

  /** Activate workspace and reset tabs to a single desktop tab. */
  const handleActivateWorkspace = React.useCallback(
    async (targetWorkspaceId: string) => {
      if (!targetWorkspaceId) return;
      await activateWorkspace.mutateAsync({ id: targetWorkspaceId });
      resetWorkspaceTabsToDesktop(targetWorkspaceId);
      queryClient.invalidateQueries();
    },
    [activateWorkspace, resetWorkspaceTabsToDesktop],
  );

  const createWorkspace = useMutation(
    trpc.workspace.create.mutationOptions({
      onSuccess: async (created) => {
        toast.success("工作空间已创建");
        setCreateOpen(false);
        setNewWorkspaceName("");
        setNewWorkspacePath("");
        await handleActivateWorkspace(created.id);
      },
    }),
  );

  if (!workspace?.id) {
    return null;
  }

  const workspaces = (workspacesQuery.data ?? []).slice().sort((a, b) => {
    if (a.id === workspace.id) return -1;
    if (b.id === workspace.id) return 1;
    return a.name.localeCompare(b.name);
  });

  const handleCreateWorkspace = async () => {
    const name = newWorkspaceName.trim();
    const rootUri = newWorkspacePath.trim();
    if (!name) {
      toast.error("请输入工作空间名称");
      return;
    }
    if (!rootUri) {
      toast.error("请选择工作空间保存目录");
      return;
    }
    // 中文注释：前端提前拦截显式重复路径，避免重复发起请求。
    if (
      (workspacesQuery.data ?? []).some(
        (item) => getDisplayPathFromUri(item.rootUri) === rootUri,
      )
    ) {
      toast.error("工作空间保存目录不能重复，请选择其他文件夹");
      return;
    }

    await createWorkspace.mutateAsync({ name, rootUri });
  };

  /** Pick a directory from system dialog (Electron only). */
  const pickDirectory = React.useCallback(async (initialValue?: string) => {
    const api = window.openloafElectron;
    if (api?.pickDirectory) {
      const result = await api.pickDirectory(
        initialValue ? { defaultPath: initialValue } : undefined,
      );
      if (result?.ok && result.path) return result.path;
    }
    return initialValue ?? null;
  }, []);

  /** Open SaaS login dialog. */
  const handleOpenLogin = () => {
    setLoginOpen(true);
  };

  /** Clear SaaS login and local UI state. */
  const handleLogout = () => {
    logout();
    toast.success("已退出登录");
  };

  /** Trigger incremental update check for Electron. */
  const handleCheckUpdate = React.useCallback(async () => {
    // 开发模式禁用更新检查，避免触发无效请求。
    if (process.env.NODE_ENV !== "production") {
      toast.message("开发模式不支持更新检查");
      return;
    }
    const api = window.openloafElectron;
    if (!api?.checkIncrementalUpdate) {
      toast.message("当前环境不支持更新检查");
      return;
    }
    const result = await api.checkIncrementalUpdate();
    if (result.ok) {
      toast.success("已触发更新检查");
      return;
    }
    // 中文注释：未打包环境的错误提示需要转换为可读文案。
    const reason =
      result.reason === "not-packaged"
        ? "当前环境不支持更新检查"
        : result.reason;
    toast.error(reason ? `更新检查失败：${reason}` : "更新检查失败");
  }, []);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DropdownMenu open={workspaceOpen} onOpenChange={setWorkspaceOpen}>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="default"
                className=" h-12 rounded-lg px-1.5 py-3 [&:not([data-highlight])]:hover:bg-sidebar-accent [&:not([data-highlight])]:hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="size-8 rounded-md">
                  <AvatarImage src={displayAvatar || undefined} alt={avatarAlt} />
                  <AvatarFallback className="bg-transparent">
                    <img
                      src="/head_s.png"
                      alt="OpenLoaf"
                      className="size-full object-contain"
                    />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <div className="truncate text-sm font-medium leading-5">
                    {workspace.name}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground leading-4">
                    {sidebarAccountLabel ?? "未登录"}
                  </div>
                </div>
                <ChevronsUpDown className="text-muted-foreground size-4 group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="bottom"
              sideOffset={8}
              className="w-72 rounded-xl p-2"
            >
              <div className="flex items-center gap-3 px-2 py-2">
                <Avatar className="size-9">
                  <AvatarImage src={displayAvatar || undefined} alt={avatarAlt} />
                  <AvatarFallback>
                    <img
                      src="/logo.svg"
                      alt="OpenLoaf"
                      className="size-full object-cover"
                    />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium leading-5">
                    {authUser?.name || "当前账号"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground leading-4">
                    {dropdownAccountLabel ?? "未登录"}
                  </div>
                </div>
              </div>

              <DropdownMenuSeparator className="my-2" />

              <div className="space-y-1">
                {authLoggedIn ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => void handleLogout()}
                    className="rounded-lg"
                  >
                    <LogOut className="size-4" />
                    退出登录
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => handleOpenLogin()}
                    className="rounded-lg"
                  >
                    <LogIn className="size-4" />
                    登录OpenLoaf账户
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => void handleCheckUpdate()}
                  className="rounded-lg"
                >
                  <RefreshCcw className="size-4" />
                  检查更新
                </DropdownMenuItem>
              </div>

              <DropdownMenuSeparator className="my-2" />

              <DropdownMenuLabel className="px-2 text-xs text-muted-foreground">
                工作空间
              </DropdownMenuLabel>

              <div className="mt-1 space-y-1">
                {workspacesQuery.isLoading ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    加载中…
                  </div>
                ) : (
                  workspaces.map((ws) => {
                    const isActive = ws.id === workspace.id;
                    return (
                      <DropdownMenuItem
                        key={ws.id}
                        disabled={isActive || activateWorkspace.isPending}
                        onSelect={() => {
                          if (isActive) return;
                          void handleActivateWorkspace(ws.id);
                        }}
                        className="rounded-lg"
                      >
                        <div className="bg-muted text-muted-foreground flex size-5 items-center justify-center rounded-md">
                          <Building2 className="size-3" />
                        </div>
                        <span className="min-w-0 flex-1 truncate">
                          {ws.name}
                        </span>
                        {isActive ? (
                          <Check className="text-muted-foreground size-4" />
                        ) : null}
                      </DropdownMenuItem>
                    );
                  })
                )}
              </div>

              <DropdownMenuItem
                onSelect={() => setCreateOpen(true)}
                className="mt-1 rounded-lg"
              >
                <Plus className="size-4" />
                新增工作空间
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DialogContent className="sm:max-w-md">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleCreateWorkspace();
              }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle>新增工作空间</DialogTitle>
                <DialogDescription>
                  创建一个新的工作空间，并自动切换到它。
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-2">
                <Input
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="例如：我的团队"
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <div className="text-sm text-muted-foreground">保存目录</div>
                <div className="flex items-center gap-2">
                  <Input
                    value={newWorkspacePath}
                    onChange={(e) => setNewWorkspacePath(e.target.value)}
                    placeholder="/path/to/workspace"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      const next = await pickDirectory(newWorkspacePath);
                      if (!next) return;
                      setNewWorkspacePath(next);
                    }}
                  >
                    选择
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  disabled={createWorkspace.isPending}
                >
                  取消
                </Button>
                <Button type="submit" disabled={createWorkspace.isPending}>
                  {createWorkspace.isPending ? "创建中…" : "创建"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
