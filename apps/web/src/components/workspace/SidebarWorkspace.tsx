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
  Lightbulb,
  LogIn,
  LogOut,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import { SaaSClient, SaaSHttpError } from "@openloaf-saas/sdk";

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
import { Checkbox } from "@openloaf/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { Input } from "@openloaf/ui/input";
import { Label } from "@openloaf/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@openloaf/ui/select";
import { Textarea } from "@openloaf/ui/textarea";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { fetchUserProfile, getAccessToken, resolveSaasBaseUrl } from "@/lib/saas-auth";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { isElectronEnv } from "@/utils/is-electron-env";

/** Feedback category values supported by SaaS. */
type FeedbackType = "ui" | "performance" | "bug" | "feature" | "other";

/** Feedback category values for rendering (labels resolved at runtime via i18n). */
const FEEDBACK_TYPE_VALUES: FeedbackType[] = ["ui", "performance", "bug", "feature", "other"];

// Membership labels will be dynamically set via useTranslation hook in component

import { resolveWorkspaceDisplayName } from "@/utils/workspace-display-name";

/** 会员等级胶囊徽章样式 — 低透明彩色背景 + 对应文字色，light/dark 双套。 */
const MEMBERSHIP_BADGE_STYLES: Record<string, string> = {
  free: "bg-secondary text-secondary-foreground",
  vip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  svip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  infinity: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
};

/** Normalize a string value into a trimmed optional string. */
function toOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Build device metadata for feedback context. */
function buildDeviceInfo(): { platform?: string; userAgent?: string } | undefined {
  const platform = typeof navigator !== "undefined" ? navigator.platform : "";
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const device: { platform?: string; userAgent?: string } = {};

  if (platform.trim()) device.platform = platform;
  if (userAgent.trim()) device.userAgent = userAgent;

  return Object.keys(device).length > 0 ? device : undefined;
}

export const SidebarWorkspace = () => {
  const { t } = useTranslation('workspace', { keyPrefix: 'workspace' });
  const { t: tNav } = useTranslation('nav');
  const { workspace } = useWorkspace();
  const workspaceDisplayName = resolveWorkspaceDisplayName(workspace?.name ?? '', t);
  const activeTabId = useTabs((state) => state.activeTabId);
  const tabs = useTabs((state) => state.tabs);
  const runtimeByTabId = useTabRuntime((state) => state.runtimeByTabId);

  const MEMBERSHIP_LABELS: Record<string, string> = {
    free: t('membership.free'),
    vip: t('membership.vip'),
    svip: t('membership.svip'),
    infinity: t('membership.infinity'),
  };
  // Workspace create dialog open state.
  const [createOpen, setCreateOpen] = React.useState(false);
  // Feedback dialog open state.
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  // Workspace name input value.
  const [newWorkspaceName, setNewWorkspaceName] = React.useState("");
  // Workspace root path input value.
  const [newWorkspacePath, setNewWorkspacePath] = React.useState("");
  // Login dialog open state.
  const [loginOpen, setLoginOpen] = React.useState(false);
  // Workspace dropdown open state.
  const [workspaceOpen, setWorkspaceOpen] = React.useState(false);

  // Feedback form state.
  const [feedbackType, setFeedbackType] = React.useState<FeedbackType>("other");
  const [feedbackContent, setFeedbackContent] = React.useState("");
  const [feedbackEmail, setFeedbackEmail] = React.useState("");
  const [feedbackIncludeLogs, setFeedbackIncludeLogs] = React.useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = React.useState(false);
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
    if (authLoggedIn) {
      setLoginOpen(false);
    }
  }, [authLoggedIn]);

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (open) {
      setNewWorkspaceName("");
      setNewWorkspacePath("");
    }
  };

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

  /** Activate workspace. Only reset tabs when creating a new workspace. */
  const handleActivateWorkspace = React.useCallback(
    async (targetWorkspaceId: string, options?: { resetTabs?: boolean }) => {
      if (!targetWorkspaceId) return;
      await activateWorkspace.mutateAsync({ id: targetWorkspaceId });
      if (options?.resetTabs) {
        resetWorkspaceTabsToDesktop(targetWorkspaceId);
      }
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
        await handleActivateWorkspace(created.id, { resetTabs: true });
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

  const isElectron = isElectronEnv();
  const isDevDesktop = isElectron && process.env.NODE_ENV !== "production";

  // Feedback-related memoized values.
  const showLogOption = isElectron;

  /** Resolve active tab metadata for feedback context. */
  const activeTab = React.useMemo(() => {
    if (!activeTabId) return null;
    const target = tabs.find((tab) => tab.id === activeTabId) ?? null;
    if (workspace && target?.workspaceId !== workspace.id) return null;
    return target;
  }, [activeTabId, tabs, workspace]);

  /** Resolve active runtime params for feedback context. */
  const activeParams = React.useMemo(() => {
    if (!activeTabId) return {};
    return (runtimeByTabId[activeTabId]?.base?.params ?? {}) as Record<string, unknown>;
  }, [activeTabId, runtimeByTabId]);

  /** Validate optional email input. */
  const trimmedEmail = feedbackEmail.trim();
  const isEmailValid = !trimmedEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);

  /** Build feedback context payload. */
  const buildFeedbackContext = React.useCallback(async () => {
    const page = typeof window !== "undefined" ? window.location.pathname : "";
    const appVersion = isElectron
      ? await window.openloafElectron?.getAppVersion?.().catch(() => null)
      : null;

    const projectId = toOptionalText(activeParams.projectId);
    const rootUri = toOptionalText(activeParams.rootUri);
    const openUri = toOptionalText(activeParams.openUri);
    const uri = toOptionalText(activeParams.uri);

    const context: Record<string, unknown> = {
      page: toOptionalText(page),
      env: isElectron ? "electron" : "web",
      device: buildDeviceInfo(),
      appVersion: toOptionalText(appVersion ?? ""),
      workspaceId: toOptionalText(workspace?.id ?? ""),
      workspaceRootUri: toOptionalText(workspace?.rootUri ?? ""),
      tabId: toOptionalText(activeTab?.id ?? ""),
      tabTitle: toOptionalText(activeTab?.title ?? ""),
      projectId,
      rootUri,
      openUri,
      uri,
    };

    return Object.fromEntries(
      Object.entries(context).filter(([, value]) => value !== undefined && value !== null)
    );
  }, [activeParams, activeTab, isElectron, workspace]);

  /** Submit feedback to SaaS. */
  const submitFeedback = React.useCallback(async () => {
    const trimmed = feedbackContent.trim();
    if (!trimmed) {
      toast.error(tNav('sidebar.feedback.emptyError'));
      return;
    }
    if (!authLoggedIn && !isEmailValid) {
      toast.error(tNav('sidebar.feedback.emailInvalid'));
      return;
    }

    const baseUrl = resolveSaasBaseUrl();
    if (!baseUrl) {
      toast.error(tNav('sidebar.feedback.saasNotConfigured'));
      return;
    }

    setFeedbackSubmitting(true);
    try {
      const client = new SaaSClient({
        baseUrl,
        getAccessToken: async () => (await getAccessToken()) ?? "",
      });
      const context = await buildFeedbackContext();

      // 勾选日志时，先上传日志文件为附件，再将 URL 放入 context。
      if (feedbackIncludeLogs && isElectronEnv()) {
        const result = await window.openloafElectron?.readStartupLog?.();
        if (result?.ok) {
          const logContent = (result as { ok: true; content: string }).content;
          const blob = new Blob([logContent], { type: "text/plain" });
          try {
            const attachment = await client.feedback.uploadAttachment(blob, "startup.log");
            context.logAttachmentUrl = attachment.url;
            context.logAttachmentKey = attachment.key;
          } catch {
            // 上传失败时回退：将日志内容内联到 context
            context.startupLog = logContent;
          }
        }
      }

      await client.feedback.submit({
        source: "openloaf",
        type: feedbackType,
        content: trimmed,
        context,
        email: authLoggedIn ? undefined : feedbackEmail.trim() || undefined,
      });
      toast.success(tNav('sidebar.feedback.success'));
      setFeedbackContent("");
      setFeedbackEmail("");
      setFeedbackType("other");
      setFeedbackIncludeLogs(false);
      setFeedbackOpen(false);
    } catch (error) {
      if (error instanceof SaaSHttpError) {
        const payload = error.payload as { message?: unknown } | undefined;
        const message = typeof payload?.message === "string" ? payload.message : "";
        toast.error(message ? tNav('sidebar.feedback.failedWithMessage', { message }) : tNav('sidebar.feedback.failed'));
        return;
      }
      toast.error(tNav('sidebar.feedback.failed'));
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [authLoggedIn, buildFeedbackContext, feedbackContent, feedbackEmail, feedbackIncludeLogs, feedbackType, isEmailValid, tNav]);

  const handleFeedbackOpenChange = (open: boolean) => {
    setFeedbackOpen(open);
    if (!open) {
      setFeedbackContent("");
      setFeedbackEmail("");
      setFeedbackType("other");
      setFeedbackIncludeLogs(false);
    }
  };

  const [updateStatus, setUpdateStatus] = React.useState<OpenLoafIncrementalUpdateStatus | null>(null);
  const [restartDialogOpen, setRestartDialogOpen] = React.useState(false);
  const updateTriggeredRef = React.useRef(false);

  const UPDATE_TOAST_ID = 'sidebar-update-check';

  React.useEffect(() => {
    if (!isElectron) return;
    const onUpdateStatus = (event: Event) => {
      const detail = (event as CustomEvent<OpenLoafIncrementalUpdateStatus>).detail;
      if (detail) setUpdateStatus(detail);
    };
    window.addEventListener("openloaf:incremental-update:status", onUpdateStatus);
    // 初始拉取一次状态。
    void window.openloafElectron?.getIncrementalUpdateStatus?.().then((s) => {
      if (s) setUpdateStatus(s);
    });
    return () => window.removeEventListener("openloaf:incremental-update:status", onUpdateStatus);
  }, [isElectron]);

  React.useEffect(() => {
    if (!updateStatus) return;
    switch (updateStatus.state) {
      case 'checking':
        break;
      case 'downloading': {
        const pct = updateStatus.progress?.percent;
        const msg = pct != null
          ? `${t('downloadingUpdate')} ${Math.round(pct)}%`
          : t('downloadingUpdate');
        toast.loading(msg, { id: UPDATE_TOAST_ID });
        break;
      }
      case 'ready':
        toast.dismiss(UPDATE_TOAST_ID);
        setRestartDialogOpen(true);
        break;
      case 'error':
        toast.error(updateStatus.error ?? t('checkUpdateError'), { id: UPDATE_TOAST_ID });
        updateTriggeredRef.current = false;
        break;
      case 'idle':
        if (updateTriggeredRef.current && updateStatus.lastCheckedAt) {
          toast.success(t('isLatest'), { id: UPDATE_TOAST_ID });
          updateTriggeredRef.current = false;
        }
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateStatus]);

  /** Trigger incremental update check for Electron. */
  const handleCheckUpdate = React.useCallback(async () => {
    if (isDevDesktop) {
      toast.message(t('devModeNoUpdate'));
      return;
    }
    const api = window.openloafElectron;
    if (!api?.checkIncrementalUpdate) {
      toast.message(t('envNoUpdate'));
      return;
    }
    updateTriggeredRef.current = true;
    toast.loading(t('checkingUpdate'), { id: UPDATE_TOAST_ID });
    await api.checkIncrementalUpdate();
  }, [isDevDesktop, t]);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />

        <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
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
                    {sidebarAccountLabel ?? (authLoggedIn ? t('loggedIn') : t('notLoggedIn'))}
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
              {authLoggedIn && (
                <>
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
                      <div className="flex items-center gap-1.5 leading-5">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {authUser?.name || t('currentAccount')}
                        </span>
                        {userProfileQuery.data && (
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[10px] font-medium leading-4 transition-colors duration-150 ${MEMBERSHIP_BADGE_STYLES[userProfileQuery.data.membershipLevel] ?? "bg-secondary text-secondary-foreground"}`}
                          >
                            {MEMBERSHIP_LABELS[userProfileQuery.data.membershipLevel] ?? userProfileQuery.data.membershipLevel}
                          </span>
                        )}
                        {userProfileQuery.data && (
                          <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] leading-4 text-muted-foreground">
                            {Math.floor(userProfileQuery.data.creditsBalance).toLocaleString()} {t('credits')}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground leading-4">{dropdownAccountLabel}</div>
                    </div>
                  </div>

                  <DropdownMenuSeparator className="my-2" />
                </>
              )}

              <div className="space-y-1">
                {authLoggedIn ? (
                  <>
                    <DropdownMenuItem
                      onSelect={() => setFeedbackOpen(true)}
                      className="rounded-lg"
                    >
                      <Lightbulb className="size-4" />
                      {tNav('sidebar.feedback.title')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => void handleLogout()}
                      className="rounded-lg"
                    >
                      <LogOut className="size-4" />
                      {t('logout')}
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem
                      onSelect={() => handleOpenLogin()}
                      className="rounded-lg bg-sky-500/8 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400 focus:bg-sky-500/15 focus:text-sky-600 dark:focus:bg-sky-500/15 dark:focus:text-sky-400"
                    >
                      <LogIn className="size-4 text-sky-600 dark:text-sky-400" />
                      {t('loginAccount')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setFeedbackOpen(true)}
                      className="rounded-lg"
                    >
                      <Lightbulb className="size-4" />
                      {tNav('sidebar.feedback.title')}
                    </DropdownMenuItem>
                  </>
                )}
                {isElectron && (
                  <DropdownMenuItem
                    onSelect={() => void handleCheckUpdate()}
                    disabled={
                      isDevDesktop ||
                      updateStatus?.state === "checking" ||
                      updateStatus?.state === "downloading" ||
                      updateStatus?.state === "ready"
                    }
                    className="rounded-lg text-amber-600 dark:text-amber-400 focus:bg-amber-500/10 focus:text-amber-600 dark:focus:bg-amber-500/10 dark:focus:text-amber-400"
                  >
                    <RefreshCcw className="size-4 text-amber-600 dark:text-amber-400" />
                    <span className="flex-1">
                      {updateStatus?.state === "ready"
                        ? t('updateReady')
                        : updateStatus?.state === "checking" || updateStatus?.state === "downloading"
                          ? t('updating')
                          : t('checkUpdate')}
                    </span>
                    {updateStatus?.state === "ready" && (
                      <span className="ml-1 size-2 rounded-full bg-blue-500" />
                    )}
                  </DropdownMenuItem>
                )}
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
                className="mt-1 rounded-lg bg-emerald-500/8 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 focus:bg-emerald-500/15 focus:text-emerald-600 dark:focus:bg-emerald-500/15 dark:focus:text-emerald-400"
              >
                <Plus className="size-4 text-emerald-600 dark:text-emerald-400" />
                {t('addWorkspace')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DialogContent className="sm:max-w-md shadow-none border-border/60">
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
                <Button
                  type="submit"
                  disabled={createWorkspace.isPending}
                  className="bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 dark:text-sky-400 dark:hover:bg-sky-500/20 shadow-none"
                >
                  {createWorkspace.isPending ? t('creatingButton') : t('createButton')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </SidebarMenuItem>

      <Dialog open={restartDialogOpen} onOpenChange={setRestartDialogOpen}>
        <DialogContent className="sm:max-w-sm shadow-none border-border/60">
          <DialogHeader>
            <DialogTitle>{t('updateReady')}</DialogTitle>
            <DialogDescription>{t('restartToApply')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRestartDialogOpen(false)}
            >
              {t('cancelButton')}
            </Button>
            <Button
              type="button"
              className="bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 dark:text-sky-400 dark:hover:bg-sky-500/20 shadow-none"
              onClick={async () => {
                setRestartDialogOpen(false);
                await window.openloafElectron?.relaunchApp?.();
              }}
            >
              {t('relaunchNow')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={feedbackOpen} onOpenChange={handleFeedbackOpenChange}>
        <DialogContent className="sm:max-w-md shadow-none border-border/60">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 dark:bg-violet-500/20">
                <Lightbulb className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              </div>
              <DialogTitle>{tNav('sidebar.feedback.title')}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Select value={feedbackType} onValueChange={(value) => setFeedbackType(value as FeedbackType)}>
              <SelectTrigger aria-label={tNav('sidebar.feedback.typeLabel')}>
                <SelectValue placeholder={tNav('sidebar.feedback.typePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_TYPE_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {tNav(`sidebar.feedback.types.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={feedbackContent}
              onChange={(event) => setFeedbackContent(event.target.value)}
              placeholder={tNav('sidebar.feedback.contentPlaceholder')}
              className="min-h-[96px]"
            />
            {!authLoggedIn && (
              <>
                <Input
                  value={feedbackEmail}
                  onChange={(event) => setFeedbackEmail(event.target.value)}
                  placeholder={tNav('sidebar.feedback.emailPlaceholder')}
                  type="email"
                />
                {!isEmailValid ? (
                  <div className="text-xs text-destructive">{tNav('sidebar.feedback.emailInvalid')}</div>
                ) : null}
              </>
            )}
            {showLogOption && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="workspace-feedback-include-logs"
                  checked={feedbackIncludeLogs}
                  onCheckedChange={(checked) => setFeedbackIncludeLogs(checked === true)}
                />
                <Label
                  htmlFor="workspace-feedback-include-logs"
                  className="text-xs text-muted-foreground cursor-pointer select-none"
                >
                  {tNav('sidebar.feedback.includeLogs')}
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFeedbackOpen(false)}
              disabled={feedbackSubmitting}
            >
              {tNav('sidebar.feedback.cancel')}
            </Button>
            <Button
              type="button"
              className="bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 dark:text-sky-400 dark:hover:bg-sky-500/20 shadow-none"
              onClick={submitFeedback}
              disabled={feedbackSubmitting}
            >
              {feedbackSubmitting ? tNav('sidebar.feedback.submitting') : tNav('sidebar.feedback.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarMenu>
  );
};
