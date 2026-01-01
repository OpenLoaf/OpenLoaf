"use client";

import { Button } from "@/components/ui/button";
import { queryClient, trpc } from "@/utils/trpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { TeatimeSettingsGroup } from "@/components/ui/teatime/TeatimeSettingsGroup";
import { TeatimeSettingsField } from "@/components/ui/teatime/TeatimeSettingsField";

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
  const statsQuery = useQuery({
    ...trpc.chat.getChatStats.queryOptions(),
    staleTime: 5000,
  });

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

  /** Clear all chat data with a confirm gate. */
  const handleClearAllChat = async () => {
    const confirmText = `确认清除所有 AI 聊天内容？${
      typeof sessionCount === "number" ? `（当前 ${sessionCount} 个会话）` : ""
    }\n此操作不可撤销。`;
    if (!window.confirm(confirmText)) return;
    await clearAllChat.mutateAsync();
  };

  return (
    <div className="space-y-6">
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
