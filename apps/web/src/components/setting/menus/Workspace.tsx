"use client";

import { Button } from "@/components/ui/button";
import { queryClient, trpc } from "@/utils/trpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { SettingsGroup } from "./SettingsGroup";

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
      <SettingsGroup title="聊天数据">
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 px-3 py-3">
            <div className="text-sm font-medium">会话总数</div>
            <div className="text-xs text-muted-foreground">
              {typeof sessionCount === "number" ? sessionCount : "—"}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 px-3 py-3">
            <div className="text-sm font-medium">Token 总计</div>
            <div className="text-xs text-muted-foreground">
              {usage ? usage.totalTokens : "—"}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 px-3 py-3">
            <div className="text-sm font-medium">Token 输入 / 输出</div>
            <div className="text-xs text-muted-foreground">
              {usage ? `${usage.inputTokens} / ${usage.outputTokens}` : "—"}
            </div>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup title="清理">
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">清除所有 AI 聊天内容</div>
            <div className="text-xs text-muted-foreground">
              会删除全部会话与消息记录
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={clearAllChat.isPending}
            onClick={() => void handleClearAllChat()}
          >
            {clearAllChat.isPending ? "清除中..." : "立即清除"}
          </Button>
        </div>
      </SettingsGroup>
    </div>
  );
}
