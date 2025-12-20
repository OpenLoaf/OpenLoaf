"use client";

import * as React from "react";
import type { UIMessage } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Copy, RotateCcw, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { useChatContext } from "../ChatProvider";
import { trpc } from "@/utils/trpc";
import { useMutation } from "@tanstack/react-query";
import MessageBranchNav from "./MessageBranchNav";
import { getMessagePlainText } from "@/lib/chat/message-text";

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
      // 成功后，用服务端返回的 meta 更新到 useChatContext
      updateMessage(message.id, {
        ...message,
        metadata: {
          ...(result as any).meta,
        },
      });
      toast.success("评价成功");
    },
    onError: () => {
      toast.error("评价失败，请稍后重试");
    },
  });

  const isRating = updateRatingMutation.isPending;

  // 处理好评点击
  const handleGoodRating = () => {
    if (!message.id) return;

    updateRatingMutation.mutate({
      where: { id: message.id },
      data: {
        meta: {
          ...(message.metadata as any),
          isGood: true,
        },
      },
    });
  };

  // 处理差评点击
  const handleBadRating = () => {
    if (!message.id) return;

    updateRatingMutation.mutate({
      where: { id: message.id },
      data: {
        meta: {
          ...(message.metadata as any),
          isGood: false,
        },
      },
    });
  };

  return (
    <div className={cn("inline-flex items-center gap-0.5", className)}>
      <MessageBranchNav messageId={message.id} />

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={handleCopy}
        disabled={!text || isCopying}
        aria-label="复制"
        title="复制"
      >
        <Copy className="size-3" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
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
        className="h-6 w-6 text-muted-foreground hover:text-foreground transition-all active:scale-100"
        onClick={handleGoodRating}
        disabled={isRating}
        aria-label="好评"
        title="好评"
      >
        <ThumbsUp
          className={cn(
            "size-3.5 transition-all",
            ratingValue === true && "fill-primary  text-primary"
          )}
        />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-6 w-6 text-muted-foreground hover:text-foreground transition-all active:scale-100"
        onClick={handleBadRating}
        disabled={isRating}
        aria-label="差评"
        title="差评"
      >
        <ThumbsDown
          className={cn(
            "size-3.5 transition-all",
            ratingValue === false && "fill-primary  text-primary"
          )}
        />
      </Button>
    </div>
  );
}
