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
import { BarChart3, Sparkles, Crown, Layers, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@openloaf/ui/button";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";
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

export function GlobalSettings() {
  const { t } = useTranslation("project", { keyPrefix: "global" });
  const { loggedIn } = useSaasAuth();
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
  const clearUnboundBoards = useMutation(
    trpc.board.clearUnboundBoards.mutationOptions({
      onSuccess: (result) => {
        if (result.deletedBoards > 0) {
          toast.success(
            t("settings.clearCanvasSuccess", { count: result.deletedBoards }),
          );
        } else {
          toast.info(t("settings.clearCanvasEmpty"));
        }
        queryClient.invalidateQueries();
      },
      onError: () => {
        toast.error(t("settings.clearCanvasError"));
      },
    }),
  );

  const sessionCount = statsQuery.data?.sessionCount;
  const usage = statsQuery.data?.usageTotals;
  const totalProjectCount = useMemo(
    () => countProjectNodes(projectsQuery.data),
    [projectsQuery.data],
  );

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

  /**
   * Clear all canvases that are not attached to any project.
   */
  const handleClearUnboundBoards = async () => {
    if (!window.confirm(t("settings.clearCanvasConfirm"))) return;
    await clearUnboundBoards.mutateAsync({});
  };

  return (
    <div className="space-y-6">
      {loggedIn && (
        <OpenLoafSettingsGroup title={t("settings.accountInfo")}>
          <div className="divide-y divide-border/40">
            <div className="flex flex-wrap items-center gap-2 py-3">
              <SettingIcon icon={Crown} bg="bg-ol-amber-bg" fg="text-ol-amber" />
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
              <SettingIcon icon={Sparkles} bg="bg-ol-green-bg" fg="text-ol-green" />
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
            <SettingIcon icon={Layers} bg="bg-ol-purple-bg" fg="text-ol-purple" />
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
            <SettingIcon icon={MessageSquare} bg="bg-ol-blue-bg" fg="text-ol-blue" />
            <div className="text-sm font-medium">{t("settings.totalSessions")}</div>
            <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
              {typeof sessionCount === "number" ? sessionCount : "—"}
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Sparkles} bg="bg-ol-amber-bg" fg="text-ol-amber" />
            <div className="text-sm font-medium">{t("settings.totalTokens")}</div>
            <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
              {usage ? formatTokenCount(usage.totalTokens) : "—"}
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={BarChart3} bg="bg-ol-green-bg" fg="text-ol-green" />
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
            <SettingIcon icon={Trash2} bg="bg-ol-red-bg" fg="text-ol-red" />
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
                className="rounded-full bg-ol-red-bg text-ol-red shadow-none hover:bg-ol-red-bg-hover"
                disabled={clearAllChat.isPending}
                onClick={() => void handleClearAllChat()}
              >
                {clearAllChat.isPending ? t("settings.clearingButton") : t("settings.clearButton")}
              </Button>
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Layers} bg="bg-ol-amber-bg" fg="text-ol-amber" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t("settings.clearAllCanvas")}</div>
              <div className="text-xs text-muted-foreground">
                {t("settings.clearAllCanvasDescription")}
              </div>
            </div>
            <OpenLoafSettingsField>
              <Button
                type="button"
                size="sm"
                className="rounded-full bg-ol-amber-bg text-ol-amber shadow-none hover:bg-ol-amber-bg-hover"
                disabled={clearUnboundBoards.isPending}
                onClick={() => void handleClearUnboundBoards()}
              >
                {clearUnboundBoards.isPending
                  ? t("settings.clearingCanvasButton")
                  : t("settings.clearCanvasButton")}
              </Button>
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>
    </div>
  );
}
