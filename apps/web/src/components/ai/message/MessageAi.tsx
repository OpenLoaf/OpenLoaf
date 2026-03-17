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
import MessageParts from "./MessageParts";
import MessagePlan from "./tools/MessagePlan";
import ClaudeCodeStatusBar from "./ClaudeCodeStatusBar";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { useChatSession } from "../context";
import AssistantMessageHeader from "./AssistantMessageHeader";
import { useBasicConfig } from "@/hooks/use-basic-config";

interface MessageAiProps {
  /** Message data to render. */
  message: UIMessage;
  /** Extra class names for the container. */
  className?: string;
  /** Whether to animate streaming markdown output. */
  isAnimating?: boolean;
  /** Whether this is the last AI message in the conversation. */
  isLastAiMessage?: boolean;
  /** Whether to show the assistant header (avatar + name). Defaults to true. */
  showHeader?: boolean;
}

export default React.memo(function MessageAi({ message, className, isAnimating, isLastAiMessage, showHeader = true }: MessageAiProps) {
  const { tabId } = useChatSession();
  const { basic } = useBasicConfig();
  const showAllToolResults = basic.chatShowAllToolResults;
  const messageParts = React.useMemo(() => {
    return Array.isArray(message.parts) ? (message.parts as any[]) : [];
  }, [message.parts]);

  // StatusBar 在流式输出期间和最后一条 AI 消息上都显示（后者保留 result 统计）
  const showStatusBar = Boolean(tabId) && Boolean(isAnimating || isLastAiMessage);

  return (
    <Message from="assistant" className={cn("min-w-0 w-full", className)}>
      {showHeader && <AssistantMessageHeader message={message} />}
      <MessageContent className="min-w-0 w-full space-y-2">
        <MessagePlan metadata={message.metadata} parts={message.parts as unknown[]} />
        <MessageParts parts={messageParts} options={{ isAnimating, messageId: message.id, showAllToolResults }} />
        {showStatusBar && tabId && <ClaudeCodeStatusBar tabId={tabId} />}
      </MessageContent>
    </Message>
  );
}, (prev, next) => {
  // 流式输出期间始终重渲染，确保打字机效果正常
  if (prev.isAnimating || next.isAnimating) return false;
  // isLastAiMessage 变化时需要重渲染（控制 StatusBar 显示）
  if (prev.isLastAiMessage !== next.isLastAiMessage) return false;
  if (prev.showHeader !== next.showHeader) return false;
  return prev.message === next.message && prev.className === next.className;
});
