"use client";

import { cn } from "@/lib/utils";
import { useChatState } from "../context";
import MessageHelper from "./MessageHelper";
import * as React from "react";
import MessageItem from "./MessageItem";
import MessageThinking from "./MessageThinking";
import MessageError from "./tools/MessageError";
import PendingCloudLoginPrompt from "./PendingCloudLoginPrompt";
import { AnimatePresence, motion } from "motion/react";
import { messageHasVisibleContent } from "@/lib/chat/message-visible";
import { incrementChatPerf } from "@/lib/chat/chat-perf";
import { useStreamingMessageBuffer } from "../hooks/use-streaming-message-buffer";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";

interface MessageListProps {
  className?: string;
}

/** Chat message list for the active session. */
export default function MessageList({ className }: MessageListProps) {
  // 中文注释：统计渲染频率，用于定位流式渲染压力。
  incrementChatPerf("render.messageList");
  const { messages, status, error, isHistoryLoading, stepThinking, pendingCloudMessage } =
    useChatState();
  const { staticMessages, streamingMessage } = useStreamingMessageBuffer({
    messages,
    status,
    isHistoryLoading,
  });

  const hasStreamingVisibleContent = React.useMemo(
    () => (streamingMessage ? messageHasVisibleContent(streamingMessage) : false),
    [streamingMessage]
  );
  // 发送消息后，在 AI 还没返回任何可见内容前显示“正在思考中”。
  const shouldShowThinking = React.useMemo(() => {
    if (error) return false;
    if (stepThinking) return true;
    if (!(status === "submitted" || status === "streaming")) return false;
    // 逻辑：流式内容已可见时隐藏 thinking。
    if (hasStreamingVisibleContent) return false;
    const last = messages[messages.length - 1] as any;
    if (!last) return false;
    if (last.role === "user") return true;
    return last.role === "assistant" && !messageHasVisibleContent(last);
  }, [messages, status, error, stepThinking, hasStreamingVisibleContent]);

  const displayMessages = React.useMemo(
    () =>
      streamingMessage && !shouldShowThinking
        ? [...staticMessages, streamingMessage]
        : staticMessages,
    [staticMessages, streamingMessage, shouldShowThinking]
  );

  const lastHumanIndex = React.useMemo(
    () => (displayMessages as any[]).findLastIndex((m) => m?.role === "user"),
    [displayMessages]
  );
  const lastAiIndex = React.useMemo(
    () => (displayMessages as any[]).findLastIndex((m) => m?.role !== "user"),
    [displayMessages]
  );
  const lastVisibleAiIndex = React.useMemo(
    () =>
      (displayMessages as any[]).findLastIndex(
        (m) => m?.role !== "user" && messageHasVisibleContent(m)
      ),
    [displayMessages]
  );
  // 中文注释：动作栏的“最后一条 assistant”以可见内容为准，避免空占位导致闪烁。
  const lastAiActionIndex = lastVisibleAiIndex >= 0 ? lastVisibleAiIndex : lastAiIndex;
  const hideAiActions = status === "submitted" || status === "streaming";
  const lastMessageIsAssistant = displayMessages[displayMessages.length - 1]?.role !== "user";
  // 空态时展示提示卡片。
  const shouldShowHelper = !isHistoryLoading && messages.length === 0 && !pendingCloudMessage;

  const messageNodes = React.useMemo(
    () =>
      (displayMessages as any[]).map((message, index) => (
        <MessageItem
          key={message?.id ?? `m_${index}`}
          message={message}
          isLastHumanMessage={index === lastHumanIndex}
          isLastAiMessage={index === lastAiIndex}
          isLastAiActionMessage={index === lastAiActionIndex}
          hideAiActions={hideAiActions && lastMessageIsAssistant && index === lastAiIndex}
        />
      )),
    [
      displayMessages,
      lastHumanIndex,
      lastAiIndex,
      lastAiActionIndex,
      hideAiActions,
      lastMessageIsAssistant,
    ]
  );

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        className
      )}
    >
      <Conversation className="min-h-0 flex-1 overflow-x-hidden [&_*:not(summary)]:!select-text">
        <ConversationContent className="flex min-h-full w-full min-w-0 flex-col space-y-4 pb-4">
          {shouldShowHelper ? (
            <ConversationEmptyState
              title="开始对话"
              description="输入消息开始与 AI 交互"
              className="flex-1"
            >
              <MessageHelper />
            </ConversationEmptyState>
          ) : null}

          {!shouldShowHelper ? messageNodes : null}

          <AnimatePresence initial={false}>
            {shouldShowThinking ? (
              <motion.div
                key="thinking"
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
              >
                <MessageThinking />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {pendingCloudMessage ? <PendingCloudLoginPrompt /> : null}
          </AnimatePresence>

          {error ? <MessageError error={error} /> : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  );
}
