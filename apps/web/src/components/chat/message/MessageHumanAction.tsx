"use client";

import * as React from "react";
import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, Copy, Undo2, X } from "lucide-react";

interface MessageHumanActionProps {
  message: UIMessage;
  className?: string;
  actionsClassName?: string;
}

export default function MessageHumanAction({
  message,
  className,
  actionsClassName,
}: MessageHumanActionProps) {
  const [isCopied, setIsCopied] = React.useState(false);
  const [isRollbackPromptOpen, setIsRollbackPromptOpen] = React.useState(false);

  const copyMessage = async () => {
    const text = (message.parts ?? [])
      .filter((part: any) => part?.type === "text")
      .map((part: any) => part.text)
      .join("");

    await navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className={className}>
      <div className={cn("flex justify-end mt-1", actionsClassName)}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110 active:scale-95"
          aria-label={isCopied ? "已复制" : "复制"}
          title={isCopied ? "已复制" : "复制"}
          onClick={copyMessage}
        >
          <div className="relative flex items-center justify-center">
            <div
              className={cn(
                "absolute transition-all duration-300 ease-in-out",
                isCopied
                  ? "opacity-0 scale-90 rotate-12"
                  : "opacity-100 scale-100 rotate-0"
              )}
            >
              <Copy className="size-3" />
            </div>
            <div
              className={cn(
                "absolute transition-all duration-300 ease-in-out",
                isCopied
                  ? "opacity-100 scale-100 rotate-0"
                  : "opacity-0 scale-90 -rotate-12"
              )}
            >
              <Check className="size-3" />
            </div>
          </div>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110 active:scale-95"
          aria-label="撤回"
          title="撤回"
          aria-expanded={isRollbackPromptOpen}
          aria-controls={`rollback-prompt-${message.id ?? "unknown"}`}
          onClick={() => setIsRollbackPromptOpen((prev) => !prev)}
        >
          <Undo2 className="size-3" />
        </Button>
      </div>

      <div
        id={`rollback-prompt-${message.id ?? "unknown"}`}
        className={cn(
          "mt-2 flex justify-end overflow-hidden transition-[max-height,opacity,transform] duration-200 ease-out",
          isRollbackPromptOpen
            ? "max-h-96 opacity-100 translate-y-0"
            : "max-h-0 opacity-0 -translate-y-1"
        )}
      >
        <div className="w-full max-w-[80%] rounded-2xl border bg-background/80 p-3 shadow-sm ring-1 ring-border/40 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
              <Undo2 className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold leading-5">
                  确认回退到这里？
                </div>
                <div className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  回退确认
                </div>
              </div>
              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                回退会删除这条消息之后的对话内容。请选择是否同时撤销本次修改。
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="关闭回退提示"
              title="关闭"
              onClick={() => setIsRollbackPromptOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setIsRollbackPromptOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => setIsRollbackPromptOpen(false)}
            >
              回退并保留修改
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => setIsRollbackPromptOpen(false)}
            >
              回退并撤销修改
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

