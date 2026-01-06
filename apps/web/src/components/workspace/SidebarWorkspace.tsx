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
} from "@/components/ui/sidebar";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { queryClient, trpc } from "@/utils/trpc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { resolveServerUrl } from "@/utils/server-url";

function readCookie(name: string) {
  if (typeof document === "undefined") return undefined;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!cookie) return undefined;
  return decodeURIComponent(cookie.slice(name.length + 1));
}

export const SidebarWorkspace = () => {
  const { workspace } = useWorkspace();
  // Workspace create dialog open state.
  const [createOpen, setCreateOpen] = React.useState(false);
  // Workspace name input value.
  const [newWorkspaceName, setNewWorkspaceName] = React.useState("");
  // Stored user email fallback.
  const [userEmail, setUserEmail] = React.useState<string | undefined>();
  // Stored user avatar fallback.
  const [userAvatarUrl, setUserAvatarUrl] = React.useState<string | undefined>();
  // Login dialog open state.
  const [loginOpen, setLoginOpen] = React.useState(false);
  // Workspace dropdown open state.
  const [workspaceOpen, setWorkspaceOpen] = React.useState(false);
  // Login flow status.
  const [loginStatus, setLoginStatus] = React.useState<
    "idle" | "opening" | "polling" | "error"
  >("idle");
  // Login error message.
  const [loginError, setLoginError] = React.useState<string | null>(null);
  // Auth user profile from server.
  const [authUser, setAuthUser] = React.useState<{
    email?: string;
    name?: string;
    picture?: string;
    avatarUrl?: string;
  } | null>(null);
  // Auth login status from server.
  const [authLoggedIn, setAuthLoggedIn] = React.useState(false);
  // SaaS balance snapshot.
  const [balanceInfo, setBalanceInfo] = React.useState<BalanceData | null>(null);
  // Balance error message.
  const [balanceError, setBalanceError] = React.useState<string | null>(null);
  // Polling timer id.
  const pollingRef = React.useRef<number | null>(null);
  // Balance polling timer id.
  const balancePollingRef = React.useRef<number | null>(null);
  // Server base URL for auth endpoints.
  const authBaseUrl = resolveServerUrl();

  React.useEffect(() => {
    const fromStorageEmail = window.localStorage.getItem("user-email") ?? "";
    const fromCookieEmail = readCookie("user-email") ?? "";
    const email = fromStorageEmail || fromCookieEmail;
    setUserEmail(email || undefined);

    const fromStorageAvatar = window.localStorage.getItem("user-avatar") ?? "";
    const fromCookieAvatar = readCookie("user-avatar") ?? "";
    const avatar = fromStorageAvatar || fromCookieAvatar;
    setUserAvatarUrl(avatar || undefined);
  }, []);

  React.useEffect(() => {
    let canceled = false;
    const loadSession = async () => {
      if (!authBaseUrl) return;
      try {
        const session = await fetchAuthSession(authBaseUrl);
        if (canceled) return;
        if (session.loggedIn) {
          if (session.user) {
            setAuthUser({
              email: session.user.email,
              name: session.user.name,
              picture: session.user.picture,
              avatarUrl: session.user.avatarUrl,
            });
          } else {
            setAuthUser(null);
          }
          setAuthLoggedIn(true);
        } else {
          setAuthUser(null);
          setAuthLoggedIn(false);
          setBalanceInfo(null);
          setBalanceError(null);
        }
      } catch {
        // ignore
      }
    };
    void loadSession();
    return () => {
      canceled = true;
    };
  }, [authBaseUrl]);

  /** Stop the login status polling loop. */
  const stopLoginPolling = React.useCallback(() => {
    if (pollingRef.current != null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  /** Stop the balance polling loop. */
  const stopBalancePolling = React.useCallback(() => {
    if (balancePollingRef.current != null) {
      window.clearInterval(balancePollingRef.current);
      balancePollingRef.current = null;
    }
  }, []);

  /** Fetch balance once. */
  const pollBalanceOnce = React.useCallback(async () => {
    if (!authBaseUrl) return;
    try {
      const payload = await fetchAuthBalance(authBaseUrl);
      // 中文注释：仅在成功时刷新余额，失败保留上次值。
      if (payload?.success && payload.data) {
        setBalanceInfo(payload.data);
        setBalanceError(null);
        if (payload.user) {
          setAuthUser({
            email: payload.user.email,
            name: payload.user.name,
            picture: payload.user.picture,
            avatarUrl: payload.user.avatarUrl,
          });
          setAuthLoggedIn(true);
        }
      } else {
        setBalanceError("余额返回异常");
      }
    } catch (error) {
      setBalanceError((error as Error)?.message ?? "余额获取失败");
    }
  }, [authBaseUrl]);

  /** Start polling auth session until login completes or fails. */
  const startLoginPolling = React.useCallback(() => {
    stopLoginPolling();
    pollingRef.current = window.setInterval(async () => {
      if (!authBaseUrl) return;
      try {
        const session = await fetchAuthSession(authBaseUrl);
        if (session.loggedIn) {
          if (session.user) {
            setAuthUser({
              email: session.user.email,
              name: session.user.name,
              picture: session.user.picture,
              avatarUrl: session.user.avatarUrl,
            });
          } else {
            setAuthUser(null);
          }
          setAuthLoggedIn(true);
          setLoginOpen(false);
          setLoginStatus("idle");
          setLoginError(null);
          stopLoginPolling();
          toast.success("登录成功");
        }
      } catch (error) {
        setLoginStatus("error");
        setLoginError((error as Error)?.message ?? "登录状态获取失败");
        stopLoginPolling();
      }
    }, 1000);
  }, [authBaseUrl, stopLoginPolling]);

  React.useEffect(() => {
    return () => {
      stopLoginPolling();
      stopBalancePolling();
    };
  }, [stopBalancePolling, stopLoginPolling]);

  /** Start polling SaaS balance once logged in. */
  const startBalancePolling = React.useCallback(() => {
    stopBalancePolling();
    balancePollingRef.current = window.setInterval(() => {
      void pollBalanceOnce();
    }, 60000);
  }, [pollBalanceOnce, stopBalancePolling]);

  React.useEffect(() => {
    if (!authLoggedIn) {
      stopBalancePolling();
      setBalanceInfo(null);
      setBalanceError(null);
      return;
    }
    startBalancePolling();
    return () => {
      stopBalancePolling();
    };
  }, [authLoggedIn, startBalancePolling, stopBalancePolling]);

  React.useEffect(() => {
    if (!authLoggedIn || !workspaceOpen) return;
    void pollBalanceOnce();
  }, [authLoggedIn, pollBalanceOnce, workspaceOpen]);

  React.useEffect(() => {
    if (!createOpen) return;
    setNewWorkspaceName("");
  }, [createOpen]);

  const workspacesQuery = useQuery(trpc.workspace.getList.queryOptions());
  const displayEmail =
    authUser?.email ?? authUser?.name ?? userEmail ?? (authLoggedIn ? "已登录" : undefined);
  const displayAvatar = authUser?.picture ?? authUser?.avatarUrl ?? userAvatarUrl;
  const displayInitial =
    (authUser?.name ?? displayEmail ?? "?")[0]?.toUpperCase() ?? "?";

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

  /** Begin the SaaS login flow. */
  const handleLogin = async () => {
    if (!authBaseUrl) {
      toast.error("登录未配置");
      return;
    }
    setLoginError(null);
    setLoginStatus("opening");
    setLoginOpen(true);

    try {
      const loginUrl = await fetchLoginUrl(authBaseUrl);
      await openExternalUrl(loginUrl);
      setLoginStatus("polling");
      startLoginPolling();
    } catch (error) {
      setLoginStatus("error");
      setLoginError((error as Error)?.message ?? "无法打开登录页面");
    }
  };

  /** Cancel the login flow and stop polling. */
  const handleCancelLogin = async () => {
    stopLoginPolling();
    setLoginOpen(false);
    setLoginStatus("idle");
    setLoginError(null);
    if (!authBaseUrl) return;
    try {
      await fetch(`${authBaseUrl}/auth/cancel`, { method: "POST" });
    } catch {
      // ignore
    }
  };

  /** Clear server-side login and local UI state. */
  const handleLogout = async () => {
    if (!authBaseUrl) return;
    try {
      await fetch(`${authBaseUrl}/auth/logout`, { method: "POST" });
      setAuthUser(null);
      setAuthLoggedIn(false);
      setUserEmail(undefined);
      setUserAvatarUrl(undefined);
      setBalanceInfo(null);
      setBalanceError(null);
      window.localStorage.removeItem("user-email");
      window.localStorage.removeItem("user-avatar");
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
              <DialogTitle>正在登录</DialogTitle>
              <DialogDescription>
                {loginStatus === "opening" && "正在打开系统浏览器…"}
                {loginStatus === "polling" && "等待登录完成…"}
                {loginStatus === "error" &&
                  (loginError ?? "登录失败，请重试")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              {loginStatus === "error" ? (
                <Button type="button" onClick={handleLogin}>
                  重新打开登录页
                </Button>
              ) : null}
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
                  <AvatarFallback className="text-[11px]">
                    {displayInitial}
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
                  <AvatarFallback className="text-xs">
                    {displayInitial}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium leading-5">
                    {authUser?.name || "当前账号"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground leading-4">
                    {displayEmail ?? "未登录"}
                  </div>
                  {authLoggedIn ? (
                    <div className="truncate text-xs text-muted-foreground leading-4">
                      {balanceInfo
                        ? `余额：${balanceInfo.remainQuota}`
                        : balanceError
                          ? "余额获取失败"
                          : "余额获取中…"}
                    </div>
                  ) : null}
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
                    onSelect={() => void handleLogin()}
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

type AuthSessionResponse = {
  /** Whether user is logged in. */
  loggedIn: boolean;
  /** User profile (optional). */
  user?: {
    /** User email. */
    email?: string;
    /** User display name. */
    name?: string;
    /** User avatar URL. */
    avatarUrl?: string;
  };
};

type BalanceData = {
  /** SaaS user id. */
  newApiUserId: string;
  /** Total quota. */
  quota: number;
  /** Used quota. */
  usedQuota: number;
  /** Remaining quota. */
  remainQuota: number;
};

type BalanceResponse = {
  /** Request success flag. */
  success: boolean;
  /** Balance payload. */
  data?: BalanceData;
  /** User profile (optional). */
  user?: {
    /** User email. */
    email?: string;
    /** User display name. */
    name?: string;
    /** Avatar URL. */
    avatarUrl?: string;
  };
};

/** Fetch the SaaS login URL from server. */
async function fetchLoginUrl(baseUrl: string): Promise<string> {
  const url = new URL(`${baseUrl}/auth/login-url`);
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("无法获取登录地址");
  }
  const payload = (await response.json()) as { authorizeUrl?: string };
  if (!payload.authorizeUrl) {
    throw new Error("登录地址无效");
  }
  return payload.authorizeUrl;
}

/** Fetch the current auth session from server. */
async function fetchAuthSession(baseUrl: string): Promise<AuthSessionResponse> {
  const response = await fetch(`${baseUrl}/auth/session`);
  if (!response.ok) {
    throw new Error("无法获取登录状态");
  }
  return (await response.json()) as AuthSessionResponse;
}

/** Fetch auth profile and balance snapshot from server. */
async function fetchAuthBalance(baseUrl: string): Promise<BalanceResponse> {
  const response = await fetch(`${baseUrl}/auth/balance`);
  if (!response.ok) {
    throw new Error("无法获取余额");
  }
  return (await response.json()) as BalanceResponse;
}

/** Open external URL in system browser (Electron) or new tab. */
async function openExternalUrl(url: string): Promise<void> {
  if (window.teatimeElectron?.openExternal) {
    const result = await window.teatimeElectron.openExternal(url);
    if (!result.ok) {
      throw new Error(result.reason ?? "无法打开浏览器");
    }
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
