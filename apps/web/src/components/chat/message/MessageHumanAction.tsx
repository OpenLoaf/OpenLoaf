"use client";

import * as React from "react";
import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, Copy, Pencil, X } from "lucide-react";
import MessageBranchNav from "./MessageBranchNav";
import { getMessagePlainText } from "@/lib/chat/message-text";
import { messageActionIconButtonClassName } from "./message-action-styles";

interface MessageHumanActionProps {
  message: UIMessage;
  className?: string;
  actionsClassName?: string;
  isEditing?: boolean;
  onToggleEdit?: () => void;
}

export default function MessageHumanAction({
  message,
  className,
  actionsClassName,
  isEditing,
  onToggleEdit,
}: MessageHumanActionProps) {
  const [isCopied, setIsCopied] = React.useState(false);

  const copyMessage = async () => {
    const text = getMessagePlainText(message);
    if (!text) return;

    await navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className={className}>
      <div className={cn("flex justify-end mt-1", actionsClassName)}>
        <MessageBranchNav messageId={message.id} />

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={messageActionIconButtonClassName}
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
              <Copy className="size-3" strokeWidth={2.5} />
            </div>
            <div
              className={cn(
                "absolute transition-all duration-300 ease-in-out",
                isCopied
                  ? "opacity-100 scale-100 rotate-0"
                  : "opacity-0 scale-90 -rotate-12"
              )}
            >
              <Check className="size-3" strokeWidth={2.5} />
            </div>
          </div>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={messageActionIconButtonClassName}
          aria-label={isEditing ? "取消编辑" : "编辑"}
          title={isEditing ? "取消编辑" : "编辑"}
          onClick={onToggleEdit}
        >
          <div className="relative flex items-center justify-center">
            {/* 编辑/取消编辑图标做淡入淡出切换，避免“瞬间跳变” */}
            <div
              className={cn(
                "absolute transition-all duration-300 ease-in-out",
                isEditing
                  ? "opacity-0 scale-90 rotate-12"
                  : "opacity-100 scale-100 rotate-0"
              )}
            >
              <Pencil className="size-3" />
            </div>
            <div
              className={cn(
                "absolute transition-all duration-300 ease-in-out",
                isEditing
                  ? "opacity-100 scale-100 rotate-0"
                  : "opacity-0 scale-90 -rotate-12"
              )}
            >
              <X className="size-3" />
            </div>
          </div>
        </Button>
      </div>
    </div>
  );
}
