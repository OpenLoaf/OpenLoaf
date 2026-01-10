"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { queryClient, trpc } from "@/utils/trpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { TeatimeSettingsGroup } from "@/components/ui/teatime/TeatimeSettingsGroup";
import { TeatimeSettingsField } from "@/components/ui/teatime/TeatimeSettingsField";
import { getDisplayPathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import { Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

export function WorkspaceSettings() {
  const { data: activeWorkspace } = useQuery(trpc.workspace.getActive.queryOptions());
  /** Track workspace name draft. */
  const [draftWorkspaceName, setDraftWorkspaceName] = useState("");
  /** Workspace path for display. */
  const displayWorkspacePath = useMemo(() => {
    if (!activeWorkspace?.rootUri) return "-";
    return getDisplayPathFromUri(activeWorkspace.rootUri);
  }, [activeWorkspace?.rootUri]);

  const statsQuery = useQuery({
    ...trpc.chat.getChatStats.queryOptions(),
    staleTime: 5000,
  });

  const updateWorkspaceName = useMutation(
    trpc.workspace.updateName.mutationOptions({
      onSuccess: () => {
        toast.success("已更新工作空间名称");
        queryClient.invalidateQueries({
          queryKey: trpc.workspace.getActive.queryOptions().queryKey,
        });
        queryClient.invalidateQueries({
          queryKey: trpc.workspace.getList.queryOptions().queryKey,
        });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const clearAllChat = useMutation(
    trpc.chat.clearAllChat.mutationOptions({
      onSuccess: (res) => {
        toast.success(
          `已清除：${res.deletedSessions} 个会话 / ${res.deletedMessages} 条消息`,
        );
        queryClient.invalidateQueries();
      },
    }),
  );

  const sessionCount = statsQuery.data?.sessionCount;
  const usage = statsQuery.data?.usageTotals;
  /** Current workspace name from server. */
  const currentWorkspaceName = activeWorkspace?.name ?? "";
  /** Whether workspace name is modified. */
  const isWorkspaceNameDirty =
    draftWorkspaceName.trim() !== currentWorkspaceName.trim();

  /** Clear all chat data with a confirm gate. */
  const handleClearAllChat = async () => {
    const confirmText = `确认清除所有 AI 聊天内容？${
      typeof sessionCount === "number" ? `（当前 ${sessionCount} 个会话）` : ""
    }\n此操作不可撤销。`;
    if (!window.confirm(confirmText)) return;
    await clearAllChat.mutateAsync();
  };

  /** Sync draft name with workspace data. */
  useEffect(() => {
    if (!activeWorkspace?.name) {
      setDraftWorkspaceName("");
      return;
    }
    setDraftWorkspaceName(activeWorkspace.name);
  }, [activeWorkspace?.name]);

  /** Copy workspace id to clipboard. */
  const handleCopyWorkspaceId = async () => {
    if (!activeWorkspace?.id) return;
    try {
      await navigator.clipboard.writeText(activeWorkspace.id);
      toast.success("已复制工作空间ID");
    } catch {
      // 兼容旧浏览器的降级方案。
      const textarea = document.createElement("textarea");
      textarea.value = activeWorkspace.id;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success("已复制工作空间ID");
    }
  };

  /** Save workspace name changes. */
  const handleSaveWorkspaceName = async () => {
    if (!activeWorkspace?.id) return;
    const name = draftWorkspaceName.trim();
    if (!name) {
      toast.error("工作空间名称不能为空");
      return;
    }
    if (name === currentWorkspaceName.trim()) return;
    await updateWorkspaceName.mutateAsync({ id: activeWorkspace.id, name });
  };

  return (
    <div className="space-y-6">
      <TeatimeSettingsGroup title="基本信息">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">工作空间ID</div>
            <TeatimeSettingsField className="flex items-center justify-end gap-2 text-right text-xs text-muted-foreground">
              <span>{activeWorkspace?.id ?? "—"}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => void handleCopyWorkspaceId()}
                disabled={!activeWorkspace?.id}
                aria-label="复制工作空间ID"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </TeatimeSettingsField>
          </div>
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">工作空间名称</div>
            <TeatimeSettingsField className="w-full sm:w-[320px] shrink-0 justify-end gap-2">
              <Input
                value={draftWorkspaceName}
                placeholder="输入工作空间名称"
                onChange={(event) => setDraftWorkspaceName(event.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!isWorkspaceNameDirty || updateWorkspaceName.isPending}
                onClick={() => void handleSaveWorkspaceName()}
              >
                {updateWorkspaceName.isPending ? "保存中..." : "保存"}
              </Button>
            </TeatimeSettingsField>
          </div>
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">存储路径</div>
            <TeatimeSettingsField className="text-right text-xs text-muted-foreground">
              {displayWorkspacePath}
            </TeatimeSettingsField>
          </div>
        </div>
      </TeatimeSettingsGroup>

      <TeatimeSettingsGroup title="聊天数据">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">会话总数</div>
            <TeatimeSettingsField className="text-right text-xs text-muted-foreground">
              {typeof sessionCount === "number" ? sessionCount : "—"}
            </TeatimeSettingsField>
          </div>
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">Token 总计</div>
            <TeatimeSettingsField className="text-right text-xs text-muted-foreground">
              {usage ? formatTokenCount(usage.totalTokens) : "—"}
            </TeatimeSettingsField>
          </div>
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">Token 输入 / 输出</div>
            <TeatimeSettingsField className="text-right text-xs text-muted-foreground">
              {usage
                ? `${formatTokenCount(usage.inputTokens)}（输入: ${formatTokenCount(
                    Math.max(0, usage.inputTokens - usage.cachedInputTokens),
                  )} + 缓存: ${formatTokenCount(usage.cachedInputTokens)}） / ${formatTokenCount(
                    usage.outputTokens,
                  )}`
                : "—"}
            </TeatimeSettingsField>
          </div>
        </div>
      </TeatimeSettingsGroup>

      <TeatimeSettingsGroup title="清理">
        <div className="flex flex-wrap items-start gap-3 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">清除所有 AI 聊天内容</div>
            <div className="text-xs text-muted-foreground">
              会删除全部会话与消息记录
            </div>
          </div>

          <TeatimeSettingsField>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={clearAllChat.isPending}
              onClick={() => void handleClearAllChat()}
            >
              {clearAllChat.isPending ? "清除中..." : "立即清除"}
            </Button>
          </TeatimeSettingsField>
        </div>
      </TeatimeSettingsGroup>
    </div>
  );
}
