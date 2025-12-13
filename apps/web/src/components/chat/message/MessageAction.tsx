"use client";

import * as React from "react";
import type { UIMessage } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Copy, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useChatContext } from "../ChatProvider";

function getMessagePlainText(message: UIMessage) {
  const parts = (message.parts ?? []).filter(
    (part: any) => part?.type === "text" && typeof part?.text === "string"
  );
  return parts.map((p: any) => p.text).join("\n").trim();
}

export default function MessageAction({
  message,
  className,
  canRetry,
}: {
  message: UIMessage;
  className?: string;
  canRetry?: boolean;
}) {
  const { regenerate, clearError, status } = useChatContext();
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
    </div>
  );
}
