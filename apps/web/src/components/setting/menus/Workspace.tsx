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

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { BarChart3, Sparkles, Copy, Crown, FolderOpen, Hash, Layers, MessageSquare, TextCursorInput, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@openloaf/ui/button";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";
import { getDisplayPathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import { useProjects } from "@/hooks/use-projects";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { fetchUserProfile } from "@/lib/saas-auth";
import { queryClient, trpc } from "@/utils/trpc";

const TOKEN_K = 1000;
const TOKEN_M = 1000 * 1000;

function formatTokenCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= TOKEN_M) {
    const next = value / TOKEN_M;
    const fixed = abs % TOKEN_M === 0 ? next.toFixed(0) : next.toFixed(1);
    return `${fixed.replace(/\.0$/, "")}M`;
  }
  if (abs >= TOKEN_K) {
    const next = value / TOKEN_K;
    const fixed = abs % TOKEN_K === 0 ? next.toFixed(0) : next.toFixed(1);
    return `${fixed.replace(/\.0$/, "")}K`;
  }
  return String(value);
}

/**
 * Count project nodes in a project tree.
 */
function countProjectNodes(nodes?: ProjectNode[]): number {
  if (!nodes?.length) return 0;
  return nodes.reduce((total, node) => total + 1 + countProjectNodes(node.children), 0);
}

/**
 * Render a compact settings icon badge.
 */
function SettingIcon({ icon: Icon, bg, fg }: { icon: LucideIcon; bg: string; fg: string }) {
  return (
    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${bg}`}>
      <Icon className={`h-3 w-3 ${fg}`} />
    </div>
  );
}

export function WorkspaceSettings() {
  const { t } = useTranslation("workspace", { keyPrefix: "workspace" });
  const { loggedIn } = useSaasAuth();
  const workspaceCompatQuery = useQuery({
    ...trpc.settings.getWorkspaceCompat.queryOptions(),
    staleTime: 5 * 60 * 1000,
  });
  const activeWorkspace = workspaceCompatQuery.data;
  const projectsQuery = useProjects();

  const membershipLabels = {
    free: t("membership.free"),
    vip: t("membership.vip"),
    svip: t("membership.svip"),
    infinity: t("membership.infinity"),
  };

  const userProfileQuery = useQuery({
    queryKey: ["saas", "userProfile"],
    queryFn: fetchUserProfile,
    enabled: loggedIn,
    staleTime: 60_000,
  });

  const statsQuery = useQuery({
    ...trpc.chat.getChatStats.queryOptions(),
    staleTime: 5000,
  });

  const clearAllChat = useMutation(
    trpc.chat.clearAllChat.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          t("settings.sessionsClearedSuccess", { count: result.deletedSessions }),
        );
        queryClient.invalidateQueries();
      },
    }),
  );

  const displayWorkspacePath = useMemo(() => {
    if (!activeWorkspace?.rootUri) return "-";
    return getDisplayPathFromUri(activeWorkspace.rootUri);
  }, [activeWorkspace?.rootUri]);

  const currentWorkspaceName = activeWorkspace?.name ?? "";
  const sessionCount = statsQuery.data?.sessionCount;
  const usage = statsQuery.data?.usageTotals;
  const totalProjectCount = useMemo(
    () => countProjectNodes(projectsQuery.data),
    [projectsQuery.data],
  );

  /**
   * Copy text to clipboard with a browser fallback.
   */
  const copyTextToClipboard = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      // 逻辑：兼容旧浏览器的复制能力，避免设置页操作失效。
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

  /**
   * Open the global storage path in the system file manager.
   */
  const handleOpenWorkspacePath = async () => {
    const rootUri = activeWorkspace?.rootUri;
    if (!rootUri) return;
    const api = window.openloafElectron;
    if (!api?.openPath) {
      toast.error(t("settings.webNoFileManager"));
      return;
    }
    const result = await api.openPath({ uri: rootUri });
    if (!result?.ok) {
      toast.error(result?.reason ?? t("settings.openFileManagerError"));
    }
  };

  /**
   * Clear all chat sessions after confirmation.
   */
  const handleClearAllChat = async () => {
    const countPart =
      typeof sessionCount === "number"
        ? t("settings.clearChatConfirmWithCount", { count: sessionCount })
        : "";
    const confirmText = `${t("settings.clearChatConfirm", { countText: countPart })}`;
    if (!window.confirm(confirmText)) return;
    await clearAllChat.mutateAsync();
  };

  return (
    <div className="space-y-6">
      {loggedIn && (
        <OpenLoafSettingsGroup title={t("settings.accountInfo")}>
          <div className="divide-y divide-border/40">
            <div className="flex flex-wrap items-center gap-2 py-3">
              <SettingIcon icon={Crown} bg="bg-amber-500/10" fg="text-amber-600 dark:text-amber-400" />
              <div className="text-sm font-medium">{t("settings.membershipLevel")}</div>
              <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
                {userProfileQuery.isLoading
                  ? t("settings.loading")
                  : userProfileQuery.data?.membershipLevel
                    ? membershipLabels[userProfileQuery.data.membershipLevel] ??
                      userProfileQuery.data.membershipLevel
                    : "—"}
              </OpenLoafSettingsField>
            </div>
            <div className="flex flex-wrap items-center gap-2 py-3">
              <SettingIcon icon={Sparkles} bg="bg-emerald-500/10" fg="text-emerald-600 dark:text-emerald-400" />
              <div className="text-sm font-medium">{t("settings.creditsBalance")}</div>
              <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
                {userProfileQuery.isLoading
                  ? t("settings.loading")
                  : typeof userProfileQuery.data?.creditsBalance === "number"
                    ? Math.floor(userProfileQuery.data.creditsBalance).toLocaleString()
                    : "—"}
              </OpenLoafSettingsField>
            </div>
          </div>
        </OpenLoafSettingsGroup>
      )}

      <OpenLoafSettingsGroup title={t("settings.basicInfo")}>
        <div className="divide-y divide-border/40">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Hash} bg="bg-slate-500/10" fg="text-slate-600 dark:text-slate-400" />
            <div className="text-sm font-medium">{t("settings.workspaceId")}</div>
            <OpenLoafSettingsField className="flex items-center justify-end gap-2 text-right text-xs text-muted-foreground">
              <span>{activeWorkspace?.id ?? "—"}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => void copyTextToClipboard(activeWorkspace?.id ?? "", t("settings.copiedWorkspaceId"))}
                disabled={!activeWorkspace?.id}
                aria-label={t("settings.copyWorkspaceId")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={TextCursorInput} bg="bg-sky-500/10" fg="text-sky-600 dark:text-sky-400" />
            <div className="text-sm font-medium">{t("settings.workspaceName")}</div>
            <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
              {currentWorkspaceName || "—"}
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={FolderOpen} bg="bg-emerald-500/10" fg="text-emerald-600 dark:text-emerald-400" />
            <div className="text-sm font-medium">{t("settings.storagePath")}</div>
            <OpenLoafSettingsField className="flex items-center justify-end gap-2 text-right text-xs text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">{displayWorkspacePath}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => void copyTextToClipboard(displayWorkspacePath, t("settings.copiedStoragePath"))}
                disabled={!activeWorkspace?.rootUri}
                aria-label={t("settings.copyStoragePath")}
                title={t("settings.copy")}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => void handleOpenWorkspacePath()}
                disabled={!activeWorkspace?.rootUri}
                aria-label={t("settings.openFileManager")}
                title={t("settings.openFileManagerTooltip")}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Layers} bg="bg-violet-500/10" fg="text-violet-600 dark:text-violet-400" />
            <div className="text-sm font-medium">{t("settings.projectCount")}</div>
            <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
              {projectsQuery.isLoading ? t("settings.loading") : totalProjectCount}
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t("settings.chatData")}>
        <div className="divide-y divide-border/40">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={MessageSquare} bg="bg-sky-500/10" fg="text-sky-600 dark:text-slate-400" />
            <div className="text-sm font-medium">{t("settings.totalSessions")}</div>
            <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
              {typeof sessionCount === "number" ? sessionCount : "—"}
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Sparkles} bg="bg-amber-500/10" fg="text-amber-600 dark:text-amber-400" />
            <div className="text-sm font-medium">{t("settings.totalTokens")}</div>
            <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
              {usage ? formatTokenCount(usage.totalTokens) : "—"}
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={BarChart3} bg="bg-teal-500/10" fg="text-teal-600 dark:text-teal-400" />
            <div className="text-sm font-medium">{t("settings.tokenUsage")}</div>
            <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
              {usage
                ? t("settings.tokenBreakdown", {
                    input: formatTokenCount(usage.inputTokens),
                    inputRaw: formatTokenCount(Math.max(0, usage.inputTokens - usage.cachedInputTokens)),
                    cached: formatTokenCount(usage.cachedInputTokens),
                    output: formatTokenCount(usage.outputTokens),
                  })
                : "—"}
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t("settings.cleanup")}>
        <div className="divide-y divide-border/40">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Trash2} bg="bg-red-500/10" fg="text-red-600 dark:text-red-400" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t("settings.clearAllChat")}</div>
              <div className="text-xs text-muted-foreground">
                {t("settings.clearAllChatDescription")}
              </div>
            </div>
            <OpenLoafSettingsField>
              <Button
                type="button"
                size="sm"
                className="rounded-full bg-red-500/10 text-red-600 shadow-none hover:bg-red-500/20 dark:text-red-400"
                disabled={clearAllChat.isPending}
                onClick={() => void handleClearAllChat()}
              >
                {clearAllChat.isPending ? t("settings.clearingButton") : t("settings.clearButton")}
              </Button>
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>
    </div>
  );
}
