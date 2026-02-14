"use client";

import { Button } from "@tenas-ai/ui/button";
import { Input } from "@tenas-ai/ui/input";
import { queryClient, trpc } from "@/utils/trpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { TenasSettingsGroup } from "@tenas-ai/ui/tenas/TenasSettingsGroup";
import { TenasSettingsField } from "@tenas-ai/ui/tenas/TenasSettingsField";
import { getDisplayPathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import { Copy, FolderOpen, Loader2, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useProjects } from "@/hooks/use-projects";
import { useTabs } from "@/hooks/use-tabs";
import type { ProjectNode } from "@tenas-ai/api/services/projectTreeService";

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
 * Count project nodes in a workspace tree.
 */
function countProjectNodes(nodes?: ProjectNode[]): number {
  if (!nodes?.length) return 0;
  return nodes.reduce((total, node) => total + 1 + countProjectNodes(node.children), 0);
}

export function WorkspaceSettings() {
  const { data: activeWorkspace } = useQuery(trpc.workspace.getActive.queryOptions());
  const workspacesQuery = useQuery(trpc.workspace.getList.queryOptions());
  const projectsQuery = useProjects();
  const removeTabsByWorkspace = useTabs((state) => state.removeTabsByWorkspace);
  const resetWorkspaceTabsToDesktop = useTabs(
    (state) => state.resetWorkspaceTabsToDesktop,
  );
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

  const deleteWorkspace = useMutation(
    trpc.workspace.delete.mutationOptions({
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const activateWorkspace = useMutation(
    trpc.workspace.activate.mutationOptions({
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const clearAllChat = useMutation(
    trpc.chat.clearAllChat.mutationOptions({
      onSuccess: (res) => {
        toast.success(
          `已清除：${res.deletedSessions} 个会话`,
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
  /** Total number of projects in current workspace. */
  const totalProjectCount = useMemo(
    () => countProjectNodes(projectsQuery.data),
    [projectsQuery.data],
  );
  /** Total number of workspaces. */
  const workspaceCount = workspacesQuery.data?.length ?? 0;
  /** Whether current workspace can be deleted. */
  const canDeleteCurrentWorkspace = workspaceCount > 2;

  /** Clear all chat data with a confirm gate. */
  const handleClearAllChat = async () => {
    const confirmText = `确认清除所有 AI 聊天内容？${
      typeof sessionCount === "number" ? `（当前 ${sessionCount} 个会话）` : ""
    }\n此操作不可撤销。`;
    if (!window.confirm(confirmText)) return;
    await clearAllChat.mutateAsync();
  };

  /** Delete current workspace with confirm gate. */
  const handleDeleteCurrentWorkspace = async () => {
    const workspaceId = activeWorkspace?.id;
    if (!workspaceId) return;
    if (!canDeleteCurrentWorkspace) {
      toast.error("至少拥有 3 个工作空间时才允许删除当前工作空间");
      return;
    }
    const fallbackWorkspace = (workspacesQuery.data ?? []).find(
      (workspace) => workspace.id !== workspaceId,
    );
    if (!fallbackWorkspace) {
      toast.error("未找到可切换的工作空间");
      return;
    }
    const name = currentWorkspaceName.trim() || "当前工作空间";
    const confirmText = `确认删除工作空间「${name}」？\n此操作不可撤销。`;
    if (!window.confirm(confirmText)) return;
    await deleteWorkspace.mutateAsync({ id: workspaceId });
    queryClient.setQueryData(
      trpc.workspace.getActive.queryOptions().queryKey,
      fallbackWorkspace,
    );
    let activated = false;
    try {
      await activateWorkspace.mutateAsync({ id: fallbackWorkspace.id });
      activated = true;
      resetWorkspaceTabsToDesktop(fallbackWorkspace.id);
    } finally {
      removeTabsByWorkspace(workspaceId);
      queryClient.invalidateQueries();
    }
    if (activated) {
      toast.success("已删除当前工作空间，并切换到其他工作空间");
    }
  };

  /** Sync draft name with workspace data. */
  useEffect(() => {
    if (!activeWorkspace?.name) {
      setDraftWorkspaceName("");
      return;
    }
    setDraftWorkspaceName(activeWorkspace.name);
  }, [activeWorkspace?.name]);

  /**
   * Copy text to clipboard with fallback support.
   */
  const copyTextToClipboard = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      // 兼容旧浏览器的降级方案。
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

  /** Copy workspace id to clipboard. */
  const handleCopyWorkspaceId = async () => {
    if (!activeWorkspace?.id) return;
    await copyTextToClipboard(activeWorkspace.id, "已复制工作空间ID");
  };

  /** Copy workspace path to clipboard. */
  const handleCopyWorkspacePath = async () => {
    if (!activeWorkspace?.rootUri) return;
    await copyTextToClipboard(displayWorkspacePath, "已复制存储路径");
  };

  /** Open workspace path in system file manager. */
  const handleOpenWorkspacePath = async () => {
    const rootUri = activeWorkspace?.rootUri;
    if (!rootUri) return;
    const api = window.tenasElectron;
    if (!api?.openPath) {
      toast.error("网页版不支持打开文件管理器");
      return;
    }
    const res = await api.openPath({ uri: rootUri });
    if (!res?.ok) {
      toast.error(res?.reason ?? "无法打开文件管理器");
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
      <TenasSettingsGroup title="基本信息">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">工作空间ID</div>
            <TenasSettingsField className="flex items-center justify-end gap-2 text-right text-xs text-muted-foreground">
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
            </TenasSettingsField>
          </div>
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">工作空间名称</div>
            <TenasSettingsField className="w-full sm:w-[320px] shrink-0 justify-end gap-2 text-right">
              <Input
                value={draftWorkspaceName}
                placeholder="输入工作空间名称"
                onChange={(event) => setDraftWorkspaceName(event.target.value)}
                className="text-right"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                disabled={!isWorkspaceNameDirty || updateWorkspaceName.isPending}
                onClick={() => void handleSaveWorkspaceName()}
                aria-label="保存工作空间名称"
                title="保存"
              >
                {updateWorkspaceName.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            </TenasSettingsField>
          </div>
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">存储路径</div>
            <TenasSettingsField className="flex items-center justify-end gap-2 text-right text-xs text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">{displayWorkspacePath}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => void handleCopyWorkspacePath()}
                disabled={!activeWorkspace?.rootUri}
                aria-label="复制存储路径"
                title="复制"
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
                aria-label="打开文件管理器"
                title="在文件管理器中打开"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </TenasSettingsField>
          </div>
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">项目数量</div>
            <TenasSettingsField className="text-right text-xs text-muted-foreground">
              {projectsQuery.isLoading ? "加载中..." : totalProjectCount}
            </TenasSettingsField>
          </div>
        </div>
      </TenasSettingsGroup>

      <TenasSettingsGroup title="聊天数据">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">会话总数</div>
            <TenasSettingsField className="text-right text-xs text-muted-foreground">
              {typeof sessionCount === "number" ? sessionCount : "—"}
            </TenasSettingsField>
          </div>
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">Token 总计</div>
            <TenasSettingsField className="text-right text-xs text-muted-foreground">
              {usage ? formatTokenCount(usage.totalTokens) : "—"}
            </TenasSettingsField>
          </div>
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">Token 输入 / 输出</div>
            <TenasSettingsField className="text-right text-xs text-muted-foreground">
              {usage
                ? `${formatTokenCount(usage.inputTokens)}（输入: ${formatTokenCount(
                    Math.max(0, usage.inputTokens - usage.cachedInputTokens),
                  )} + 缓存: ${formatTokenCount(usage.cachedInputTokens)}） / ${formatTokenCount(
                    usage.outputTokens,
                  )}`
                : "—"}
            </TenasSettingsField>
          </div>
        </div>
      </TenasSettingsGroup>

      <TenasSettingsGroup title="清理">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">清除所有 AI 聊天内容</div>
              <div className="text-xs text-muted-foreground">
                会删除全部会话与消息记录
              </div>
            </div>

            <TenasSettingsField>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={clearAllChat.isPending}
                onClick={() => void handleClearAllChat()}
              >
                {clearAllChat.isPending ? "清除中..." : "立即清除"}
              </Button>
            </TenasSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">删除当前工作空间</div>
              <div className="text-xs text-muted-foreground">
                {canDeleteCurrentWorkspace
                  ? "删除后将自动切换到其他工作空间"
                  : "至少拥有 3 个工作空间时才允许删除当前工作空间"}
              </div>
            </div>

            <TenasSettingsField>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={
                  !activeWorkspace?.id ||
                  !canDeleteCurrentWorkspace ||
                  deleteWorkspace.isPending ||
                  activateWorkspace.isPending
                }
                onClick={() => void handleDeleteCurrentWorkspace()}
              >
                {deleteWorkspace.isPending || activateWorkspace.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    删除中...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    删除工作空间
                  </>
                )}
              </Button>
            </TenasSettingsField>
          </div>
        </div>
      </TenasSettingsGroup>
    </div>
  );
}
