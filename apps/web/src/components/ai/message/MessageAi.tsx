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
import MessageParts from "./MessageParts";
import MessagePlan from "./tools/MessagePlan";
import { Message, MessageContent } from "@/components/ai-elements/message";

interface MessageAiProps {
  /** Message data to render. */
  message: UIMessage;
  /** Extra class names for the container. */
  className?: string;
  /** Whether to animate streaming markdown output. */
  isAnimating?: boolean;
}

export default React.memo(function MessageAi({ message, className, isAnimating }: MessageAiProps) {
  const messageParts = React.useMemo(() => {
    return Array.isArray(message.parts) ? (message.parts as any[]) : [];
  }, [message.parts]);

  return (
    <Message from="assistant" className={cn("min-w-0 w-full", className)}>
      <MessageContent className="min-w-0 w-full space-y-2">
        <MessagePlan metadata={message.metadata} parts={message.parts as unknown[]} />
        <MessageParts parts={messageParts} options={{ isAnimating, messageId: message.id }} />
      </MessageContent>
    </Message>
  );
}, (prev, next) => {
  // 流式输出期间始终重渲染，确保打字机效果正常
  if (prev.isAnimating || next.isAnimating) return false;
  return prev.message === next.message && prev.className === next.className;
});
