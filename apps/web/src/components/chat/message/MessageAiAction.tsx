"use client";

import * as React from "react";
import type { UIMessage } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Copy, Hash, RotateCcw, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { useChatContext } from "../ChatProvider";
import { trpc } from "@/utils/trpc";
import { useMutation } from "@tanstack/react-query";
import MessageBranchNav from "./MessageBranchNav";
import { getMessagePlainText } from "@/lib/chat/message-text";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { messageActionIconButtonClassName } from "./message-action-styles";

/**
 * 把 token 数值格式化为更易读的字符串（例如：5,824）。
 */
function formatTokenCount(value: unknown): string {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return "-";
  return new Intl.NumberFormat("en-US").format(numberValue);
}

export default function MessageAiAction({
  message,
  className,
}: {
  message: UIMessage;
  className?: string;
}) {
  const { retryAssistantMessage, clearError, status, updateMessage } = useChatContext();
  const [isCopying, setIsCopying] = React.useState(false);
  const text = getMessagePlainText(message);

  const handleCopy = async () => {
    if (!text) return;
    try {
      setIsCopying(true);
      await navigator.clipboard.writeText(text);
      toast.success("已复制");
    } catch (error) {
      toast.error("复制失败");
      console.error(error);
    } finally {
      setIsCopying(false);
    }
  };

  const handleRetry = () => {
    clearError();
    // 关键：允许对任意 assistant 消息重试（会在该节点处产生新分支）
    retryAssistantMessage(message.id);
  };

  // 仅在“正在提交/流式输出”时禁用交互；error/ready 状态都允许重试
  const isBusy = status === "submitted" || status === "streaming";

  const ratingValue = (message.metadata as any)?.isGood ?? null;

  // 使用 TanStack React Query 调用接口更新评价
  const updateRatingMutation = useMutation({
    ...trpc.chatmessage.updateOneChatMessage.mutationOptions(),
    onSuccess: (result) => {
      // 成功后，用服务端返回的 metadata 更新到 useChatContext（可能为 null）
      updateMessage(message.id, { metadata: (result as any).metadata ?? null });
      toast.success("评价成功");
    },
    onError: () => {
      toast.error("评价失败，请稍后重试");
    },
  });

  const isRating = updateRatingMutation.isPending;

  const usage = (message.metadata as any)?.totalUsage as
    | {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        reasoningTokens?: number;
        cachedInputTokens?: number;
        inputTokenDetails?: { noCacheTokens?: number; cacheReadTokens?: number };
        outputTokenDetails?: { textTokens?: number; reasoningTokens?: number };
      }
    | undefined;

  const agentModel = (message.metadata as any)?.agent?.model as
    | { provider?: string; modelId?: string }
    | undefined;

  const buildNextMetadata = (nextIsGood: boolean | null) => {
    // 点赞/点踩为“单选”状态；重复点击同一选项则取消（回到 null）
    const nextMetadata = { ...((message.metadata as any) ?? {}) } as Record<string, unknown>;
    if (nextIsGood === null) {
      delete nextMetadata.isGood;
    } else {
      nextMetadata.isGood = nextIsGood;
    }
    return Object.keys(nextMetadata).length > 0 ? nextMetadata : null;
  };

  // 处理好评点击
  const handleGoodRating = () => {
    if (!message.id) return;

    updateRatingMutation.mutate({
      where: { id: message.id },
      data: {
        metadata: buildNextMetadata(ratingValue === true ? null : true),
      },
    });
  };

  // 处理差评点击
  const handleBadRating = () => {
    if (!message.id) return;

    updateRatingMutation.mutate({
      where: { id: message.id },
      data: {
        metadata: buildNextMetadata(ratingValue === false ? null : false),
      },
    });
  };

  return (
    <div className={cn("flex ml-1 items-center justify-start gap-0.5", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={messageActionIconButtonClassName}
        onClick={handleCopy}
        disabled={!text || isCopying}
        aria-label="复制"
        title="复制"
      >
        <Copy className="size-3" strokeWidth={2.5} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={messageActionIconButtonClassName}
        onClick={handleRetry}
        disabled={isBusy}
        aria-label="重试"
        title="重试"
      >
        <RotateCcw className="size-3" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={messageActionIconButtonClassName}
        onClick={handleGoodRating}
        disabled={isRating}
        aria-label="好评"
        title="好评"
      >
        <ThumbsUp
          className={cn(
            "size-3 transition-all",
            ratingValue === true && "fill-primary  text-primary"
          )}
        />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={messageActionIconButtonClassName}
        onClick={handleBadRating}
        disabled={isRating}
        aria-label="差评"
        title="差评"
      >
        <ThumbsDown
          className={cn(
            "size-3 transition-all",
            ratingValue === false && "fill-primary  text-primary"
          )}
        />
      </Button>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={messageActionIconButtonClassName}
            disabled={!usage}
            aria-label="查看 token 用量"
            title="Token 用量"
          >
            <Hash className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-xs">
          {usage ? (
            <div className="space-y-1">
              <div className="font-medium">Token 用量（本地）</div>
              {agentModel?.provider || agentModel?.modelId ? (
                <div className="opacity-90">
                  {agentModel?.provider ?? "-"} / {agentModel?.modelId ?? "-"}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 opacity-95">
                <div>输入</div>
                <div className="text-right tabular-nums">{formatTokenCount(usage.inputTokens)}</div>
                <div>输出</div>
                <div className="text-right tabular-nums">{formatTokenCount(usage.outputTokens)}</div>
                <div>总计</div>
                <div className="text-right tabular-nums">{formatTokenCount(usage.totalTokens)}</div>
                <div>缓存输入</div>
                <div className="text-right tabular-nums">{formatTokenCount(usage.cachedInputTokens)}</div>
                <div>缓存读取</div>
                <div className="text-right tabular-nums">
                  {formatTokenCount(usage.inputTokenDetails?.cacheReadTokens)}
                </div>
                <div>非缓存</div>
                <div className="text-right tabular-nums">
                  {formatTokenCount(usage.inputTokenDetails?.noCacheTokens)}
                </div>
              </div>
            </div>
          ) : (
            <div>暂无 token 信息</div>
          )}
        </TooltipContent>
      </Tooltip>

      <MessageBranchNav messageId={message.id} />
    </div>
  );
}
