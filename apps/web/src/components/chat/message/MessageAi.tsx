"use client";

import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";
import { renderMessageParts } from "./renderMessageParts";
import MessagePlan from "./tools/MessagePlan";

interface MessageAiProps {
  /** Message data to render. */
  message: UIMessage;
  /** Extra class names for the container. */
  className?: string;
  /** Whether to animate streaming markdown output. */
  isAnimating?: boolean;
}

export default function MessageAi({ message, className, isAnimating }: MessageAiProps) {
  return (
    <div className={cn("flex justify-start min-w-0", className)}>
      <div className="min-w-0 w-full space-y-2">
        <MessagePlan metadata={message.metadata} />
        {renderMessageParts(message.parts as any[], { isAnimating, messageId: message.id })}
      </div>
    </div>
  );
}
