/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";
import { Check, Copy, Pencil, X } from "lucide-react";
import MessageBranchNav from "./MessageBranchNav";
import { getMessagePlainText } from "@/lib/chat/message-text";
import { MessageAction, MessageActions } from "@/components/ai-elements/message";
import { TooltipProvider } from "@openloaf/ui/tooltip";
import { useChatActions } from "../context";

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
  const { readOnly } = useChatActions();
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
      <TooltipProvider delayDuration={300}>
      <MessageActions className={cn("mt-1 justify-end", actionsClassName)}>
        <MessageBranchNav messageId={message.id} />

        <MessageAction
          aria-label={isCopied ? "\u5DF2\u590D\u5236" : "\u590D\u5236"}
          title={isCopied ? "\u5DF2\u590D\u5236" : "\u590D\u5236"}
          label={isCopied ? "\u5DF2\u590D\u5236" : "\u590D\u5236"}
          tooltip={isCopied ? "\u5DF2\u590D\u5236" : "\u590D\u5236"}
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

        {!readOnly ? (
          <MessageAction
            aria-label={isEditing ? "\u53D6\u6D88\u7F16\u8F91" : "\u7F16\u8F91"}
            title={isEditing ? "\u53D6\u6D88\u7F16\u8F91" : "\u7F16\u8F91"}
            label={isEditing ? "\u53D6\u6D88\u7F16\u8F91" : "\u7F16\u8F91"}
            tooltip={isEditing ? "\u53D6\u6D88\u7F16\u8F91" : "\u7F16\u8F91"}
            className="h-6 w-6 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105 active:scale-95"
            onClick={onToggleEdit}
          >
            <div className="relative flex items-center justify-center">
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
        ) : null}
      </MessageActions>
      </TooltipProvider>
    </div>
  );
}
