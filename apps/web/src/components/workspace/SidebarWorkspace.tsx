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
} from "@tenas-ai/ui/sidebar";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { queryClient, trpc } from "@/utils/trpc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@tenas-ai/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@tenas-ai/ui/avatar";
import { Button } from "@tenas-ai/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tenas-ai/ui/dialog";
import { Input } from "@tenas-ai/ui/input";
import { Switch } from "@tenas-ai/ui/switch";
import { Label } from "@tenas-ai/ui/label";
import { useSaasAuth } from "@/hooks/use-saas-auth";

export const SidebarWorkspace = () => {
  const { workspace } = useWorkspace();
  // Workspace create dialog open state.
  const [createOpen, setCreateOpen] = React.useState(false);
  // Workspace name input value.
  const [newWorkspaceName, setNewWorkspaceName] = React.useState("");
  // Login dialog open state.
  const [loginOpen, setLoginOpen] = React.useState(false);
  // Login provider selection.
  const [loginProvider, setLoginProvider] = React.useState<"google" | "wechat">("google");
  // Workspace dropdown open state.
  const [workspaceOpen, setWorkspaceOpen] = React.useState(false);
  const {
    loggedIn: authLoggedIn,
    user: authUser,
    loginStatus,
    loginError,
    remember,
    setRemember,
    startLogin,
    cancelLogin,
    refreshSession,
    logout,
  } = useSaasAuth();

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
  }, [createOpen]);

  const workspacesQuery = useQuery(trpc.workspace.getList.queryOptions());
  const displayEmail =
    authUser?.email ?? authUser?.name ?? (authLoggedIn ? "已登录" : undefined);
  const displayAvatar = authUser?.avatarUrl;

  const activateWorkspace = useMutation(
    trpc.workspace.activate.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
      },
    })
  );

  const createWorkspace = useMutation(
    trpc.workspace.create.mutationOptions({
      onSuccess: async (created) => {
        toast.success("工作空间已创建");
        setCreateOpen(false);
        setNewWorkspaceName("");
        await activateWorkspace.mutateAsync({ id: created.id });
        queryClient.invalidateQueries();
      },
    })
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
    if (!name) {
      toast.error("请输入工作空间名称");
      return;
    }

    await createWorkspace.mutateAsync({ name });
  };

  /** Open SaaS login dialog. */
  const handleOpenLogin = () => {
    setLoginOpen(true);
  };

  /** Begin the SaaS login flow. */
  const handleStartLogin = async () => {
    setLoginOpen(true);
    await startLogin(loginProvider);
  };

  /** Cancel the login flow and stop polling. */
  const handleCancelLogin = () => {
    cancelLogin();
    setLoginOpen(false);
  };

  /** Clear SaaS login and local UI state. */
  const handleLogout = async () => {
    try {
      await logout();
      toast.success("已退出登录");
    } catch (error) {
      toast.error((error as Error)?.message ?? "退出登录失败");
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Dialog open={loginOpen} onOpenChange={(open) => !open && void handleCancelLogin()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>登录云端账号</DialogTitle>
              <DialogDescription>
                {loginStatus === "opening" && "正在打开系统浏览器…"}
                {loginStatus === "polling" && "等待登录完成…"}
                {loginStatus === "error" && (loginError ?? "登录失败，请重试")}
                {loginStatus === "idle" && "选择登录方式并继续"}
              </DialogDescription>
            </DialogHeader>
            {loginStatus === "idle" || loginStatus === "error" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={loginProvider === "google" ? "default" : "outline"}
                    onClick={() => setLoginProvider("google")}
                  >
                    Google
                  </Button>
                  <Button
                    type="button"
                    variant={loginProvider === "wechat" ? "default" : "outline"}
                    onClick={() => setLoginProvider("wechat")}
                  >
                    微信
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                  <Label htmlFor="saas-remember" className="text-sm">
                    记住登录
                  </Label>
                  <Switch
                    id="saas-remember"
                    checked={remember}
                    onCheckedChange={setRemember}
                  />
                </div>
              </div>
            ) : null}
            <DialogFooter className="gap-2">
              {loginStatus === "polling" || loginStatus === "opening" ? null : (
                <Button type="button" onClick={handleStartLogin}>
                  {loginStatus === "error" ? "重新打开登录页" : "开始登录"}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={handleCancelLogin}>
                取消登录
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DropdownMenu open={workspaceOpen} onOpenChange={setWorkspaceOpen}>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="default"
                className=" h-12 rounded-lg px-1.5 py-3 [&:not([data-highlight])]:hover:bg-sidebar-accent [&:not([data-highlight])]:hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="size-8 rounded-md">
                  {displayAvatar ? (
                    <AvatarImage src={displayAvatar} alt={displayEmail ?? "User"} />
                  ) : null}
                  <AvatarFallback className="bg-transparent">
                    <img src="/head_s.png" alt="Tenas" className="size-full object-contain" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <div className="truncate text-sm font-medium leading-5">
                    {workspace.name}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground leading-4">
                    {displayEmail ?? "未登录"}
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
                  {displayAvatar ? (
                    <AvatarImage src={displayAvatar} alt={displayEmail ?? "User"} />
                  ) : null}
                  <AvatarFallback>
                    <img src="/logo.svg" alt="Tenas" className="size-full object-cover" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium leading-5">
                    {authUser?.name || "当前账号"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground leading-4">
                    {displayEmail ?? "未登录"}
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
                    登录账户
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => toast.message("暂未接入更新检查")}
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
                          activateWorkspace.mutate({ id: ws.id });
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
