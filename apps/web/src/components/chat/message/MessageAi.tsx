"use client";

import * as React from "react";
import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";
import MessageParts from "./MessageParts";
import MessagePlan from "./tools/MessagePlan";

interface MessageAiProps {
  /** Message data to render. */
  message: UIMessage;
  /** Extra class names for the container. */
  className?: string;
  /** Whether to animate streaming markdown output. */
  isAnimating?: boolean;
}

export default React.memo(function MessageAi({ message, className, isAnimating }: MessageAiProps) {
  return (
    <div className={cn("flex justify-start min-w-0", className)}>
      <div className="min-w-0 w-full space-y-2">
        <MessagePlan metadata={message.metadata} parts={message.parts as unknown[]} />
        <MessageParts
          parts={message.parts as any[]}
          options={{ isAnimating, messageId: message.id }}
        />
      </div>
    </div>
  );
}, (prev, next) => {
  // 流式输出期间始终重渲染，确保打字机效果正常
  if (prev.isAnimating || next.isAnimating) return false;
  return prev.message === next.message && prev.className === next.className;
});
