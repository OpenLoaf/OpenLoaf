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
import ClaudeCodeStatusBar from "./ClaudeCodeStatusBar";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { useChatSession, useChatTools } from "../context";
import AssistantMessageHeader from "./AssistantMessageHeader";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { isToolPart } from "@/lib/chat/message-parts";
import { isApprovalPending } from "./tools/shared/tool-utils";

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
  const { toolParts } = useChatTools();
  const showAllToolResults = basic.chatShowAllToolResults;
  const rawMessageParts = React.useMemo(() => {
    return Array.isArray(message.parts) ? (message.parts as any[]) : [];
  }, [message.parts]);
  // 逻辑：本条 assistant 消息内遇到待审批工具时，截断其后的工具卡片，
  // 避免并行调用中已放行的工具先于待审批工具显示输出，造成视觉错位。
  // 审批决策（通过/拒绝）后，toolParts 更新，自动显现被隐藏的后续工具。
  const messageParts = React.useMemo(() => {
    if (rawMessageParts.length === 0) return rawMessageParts;
    let cutoffIndex = -1;
    for (let i = 0; i < rawMessageParts.length; i += 1) {
      const part = rawMessageParts[i];
      if (!isToolPart(part)) continue;
      const toolCallId =
        typeof part?.toolCallId === "string" ? String(part.toolCallId) : "";
      const snapshot = toolCallId ? toolParts?.[toolCallId] : undefined;
      const mergedPart = snapshot ? { ...part, ...snapshot } : part;
      if (isApprovalPending(mergedPart as any)) {
        cutoffIndex = i;
        break;
      }
    }
    if (cutoffIndex < 0) return rawMessageParts;
    // 保留：截断位置之前的全部 parts + 待审批工具本体 + 之后的非工具 parts（文本等）
    const head = rawMessageParts.slice(0, cutoffIndex + 1);
    const tailNonTools = rawMessageParts
      .slice(cutoffIndex + 1)
      .filter((part) => !isToolPart(part));
    return head.concat(tailNonTools);
  }, [rawMessageParts, toolParts]);

  // StatusBar 在流式输出期间和最后一条 AI 消息上都显示（后者保留 result 统计）
  const showStatusBar = Boolean(tabId) && Boolean(isAnimating || isLastAiMessage);

  return (
    <Message from="assistant" className={cn("min-w-0 w-full", !isAnimating && "has-[>[data-content]:empty]:hidden", className)}>
      {showHeader && <AssistantMessageHeader message={message} />}
      <MessageContent data-content className="min-w-0 w-full space-y-1 empty:hidden">
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
