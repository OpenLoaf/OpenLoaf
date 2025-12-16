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

function getMessagePlainText(message: UIMessage) {
  const parts = (message.parts ?? []).filter(
    (part: any) => part?.type === "text" && typeof part?.text === "string"
  );
  return parts
    .map((p: any) => p.text)
    .join("\n")
    .trim();
}

export default function MessageAiAction({
  message,
  className,
  canRetry,
}: {
  message: UIMessage;
  className?: string;
  canRetry?: boolean;
}) {
  const { regenerate, clearError, status, updateMessage } = useChatContext();
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
    regenerate();
  };

  const isBusy = status !== "ready";

  const ratingValue = (message.metadata as any)?.isGood ?? null;

  // 使用 TanStack React Query 调用接口更新评价
  const updateRatingMutation = useMutation({
    ...trpc.chatmessage.updateOneChatMessage.mutationOptions(),
    onSuccess: (result, variables) => {
      // 成功后，用服务端返回的 meta 更新到 useChatContext
      console.log("id", message.id);
      console.log("result", (result as any).meta);
      console.log("orgin", message.metadata);
      updateMessage(message.id, {
        ...message,
        metadata: {
          ...(result as any).meta,
        },
      });
      // selectSession(sessionId);
      toast.success("评价成功");
    },
    onError: () => {
      toast.error("评价失败，请稍后重试");
    },
  });

  React.useEffect(() => {
    if (!message.metadata) return;
    console.log("now", message.metadata);
  }, [message.metadata]);

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
        disabled={!canRetry || isBusy}
        aria-label="重试"
        title={canRetry ? "重试" : "仅支持重试最新回复"}
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
