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
import { useTranslation } from "react-i18next";
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
import { fetchUserProfile } from "@/lib/saas-auth";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import { useTabs } from "@/hooks/use-tabs";

// Membership labels will be dynamically set via useTranslation hook in component

/** All known system-generated default workspace names across supported languages. */
const KNOWN_DEFAULT_WORKSPACE_NAMES = new Set([
  '默认工作空间',
  '預設工作區',
  'Default Workspace',
  'デフォルト ワークスペース',
  '기본 작업 공간',
  'Espace de travail par défaut',
  'Standardarbeitsbereich',
  'Espacio de trabajo predeterminado',
]);

/** Resolve display name for a workspace, translating system defaults to current language. */
function resolveWorkspaceDisplayName(name: string, t: (key: string) => string): string {
  if (KNOWN_DEFAULT_WORKSPACE_NAMES.has(name)) {
    return t('defaultWorkspaceName');
  }
  return name;
}

/** 会员等级胶囊徽章样式 — 低透明彩色背景 + 对应文字色，light/dark 双套。 */
const MEMBERSHIP_BADGE_STYLES: Record<string, string> = {
  free: "bg-secondary text-secondary-foreground",
  vip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  svip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  infinity: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
};

export const SidebarWorkspace = () => {
  const { t } = useTranslation('workspace', { keyPrefix: 'workspace' });
  const { workspace } = useWorkspace();
  const workspaceDisplayName = resolveWorkspaceDisplayName(workspace?.name ?? '', t);

  const MEMBERSHIP_LABELS: Record<string, string> = {
    free: t('membership.free'),
    vip: t('membership.vip'),
    svip: t('membership.svip'),
    infinity: t('membership.infinity'),
  };
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
  const userProfileQuery = useQuery({
    queryKey: ["saas", "userProfile"],
    queryFn: fetchUserProfile,
    enabled: authLoggedIn,
    staleTime: 60_000,
  });
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
    authUser?.email ?? authUser?.name ?? (authLoggedIn ? t('loggedIn') : undefined);
  const sidebarAccountLabel = isWechatLogin
    ? authUser?.name?.trim() || t('wechatUser')
    : baseAccountLabel;
  const dropdownAccountLabel = isWechatLogin ? t('wechatLogin') : baseAccountLabel;
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
        toast.success(t('created'));
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
      toast.error(t('nameEmpty'));
      return;
    }
    if (!rootUri) {
      toast.error(t('pathEmpty'));
      return;
    }
    // 前端提前拦截显式重复路径，避免重复发起请求。
    if (
      (workspacesQuery.data ?? []).some(
        (item) => getDisplayPathFromUri(item.rootUri) === rootUri,
      )
    ) {
      toast.error(t('pathDuplicate'));
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
    toast.success(t('loggedOut'));
  };

  /** Trigger incremental update check for Electron. */
  const handleCheckUpdate = React.useCallback(async () => {
    // 开发模式禁用更新检查，避免触发无效请求。
    if (process.env.NODE_ENV !== "production") {
      toast.message(t('devModeNoUpdate'));
      return;
    }
    const api = window.openloafElectron;
    if (!api?.checkIncrementalUpdate) {
      toast.message(t('envNoUpdate'));
      return;
    }
    const result = await api.checkIncrementalUpdate();
    if (result.ok) {
      toast.success(t('checkUpdateTriggered'));
      return;
    }
    // 未打包环境的错误提示需要转换为可读文案。
    const reason =
      result.reason === "not-packaged"
        ? t('envNoUpdate')
        : result.reason;
    toast.error(reason ? `${t('checkUpdateError')}：${reason}` : t('checkUpdateError'));
  }, [t]);

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
                    {workspaceDisplayName}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground leading-4">
                    {sidebarAccountLabel ?? t('loggedIn')}
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
                    {authUser?.name || t('currentAccount')}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground leading-4">
                    <span className="truncate">{dropdownAccountLabel ?? t('loggedIn')}</span>
                    {authLoggedIn && userProfileQuery.data && (
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium leading-4 transition-colors duration-150 ${MEMBERSHIP_BADGE_STYLES[userProfileQuery.data.membershipLevel] ?? "bg-secondary text-secondary-foreground"}`}
                        >
                          {MEMBERSHIP_LABELS[userProfileQuery.data.membershipLevel] ?? userProfileQuery.data.membershipLevel}
                        </span>
                        <span className="text-[11px] leading-4">
                          {Math.floor(userProfileQuery.data.creditsBalance).toLocaleString()} {t('credits')}
                        </span>
                      </span>
                    )}
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
                    {t('logout')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => handleOpenLogin()}
                    className="rounded-lg"
                  >
                    <LogIn className="size-4" />
                    {t('loginAccount')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => void handleCheckUpdate()}
                  className="rounded-lg"
                >
                  <RefreshCcw className="size-4" />
                  {t('checkUpdate')}
                </DropdownMenuItem>
              </div>

              <DropdownMenuSeparator className="my-2" />

              <DropdownMenuLabel className="px-2 text-xs text-muted-foreground">
                {t('title')}
              </DropdownMenuLabel>

              <div className="mt-1 space-y-1">
                {workspacesQuery.isLoading ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    {t('loading')}
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
                          {resolveWorkspaceDisplayName(ws.name, t)}
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
                {t('addWorkspace')}
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
                <DialogTitle>{t('addWorkspace')}</DialogTitle>
                <DialogDescription>
                  {t('addWorkspaceDescription')}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-2">
                <Input
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <div className="text-sm text-muted-foreground">{t('pathLabel')}</div>
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
                    {t('selectButton')}
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
                  {t('cancelButton')}
                </Button>
                <Button type="submit" disabled={createWorkspace.isPending}>
                  {createWorkspace.isPending ? t('creatingButton') : t('createButton')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
