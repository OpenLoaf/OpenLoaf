/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import * as React from "react";
import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";
import { Check, Copy, Pencil, X } from "lucide-react";
import MessageBranchNav from "./MessageBranchNav";
import { getMessagePlainText } from "@/lib/chat/message-text";
import { MessageAction, MessageActions } from "@/components/ai-elements/message";

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
      <MessageActions className={cn("mt-1 justify-end", actionsClassName)}>
        <MessageBranchNav messageId={message.id} />

        <MessageAction
          aria-label={isCopied ? "已复制" : "复制"}
          title={isCopied ? "已复制" : "复制"}
          label={isCopied ? "已复制" : "复制"}
          tooltip={isCopied ? "已复制" : "复制"}
          className="h-6 w-6 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105 active:scale-95"
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
        </MessageAction>

        <MessageAction
          aria-label={isEditing ? "取消编辑" : "编辑"}
          title={isEditing ? "取消编辑" : "编辑"}
          label={isEditing ? "取消编辑" : "编辑"}
          tooltip={isEditing ? "取消编辑" : "编辑"}
          className="h-6 w-6 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105 active:scale-95"
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
        </MessageAction>
      </MessageActions>
    </div>
  );
}
