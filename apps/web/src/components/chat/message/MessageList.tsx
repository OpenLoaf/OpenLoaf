"use client";

import { cn } from "@/lib/utils";
import { useChatContext } from "../ChatProvider";
import MessageHelper from "./MessageHelper";
import * as React from "react";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import MessageItem from "./MessageItem";
import MessageThinking from "./MessageThinking";
import MessageError from "./MessageError";
import { AnimatePresence } from "motion/react";
import { messageHasVisibleContent } from "@/lib/chat/message-visible";

interface MessageListProps {
  className?: string;
}

export default function MessageList({ className }: MessageListProps) {
  const {
    messages,
    status,
    error,
    scrollToBottomToken,
    scrollToMessageToken,
    streamTick,
    isHistoryLoading,
    stepThinking,
  } = useChatContext();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  const lastHumanIndex = React.useMemo(
    () => (messages as any[]).findLastIndex((m) => m?.role === "user"),
    [messages]
  );
  const lastAiIndex = React.useMemo(
    () => (messages as any[]).findLastIndex((m) => m?.role !== "user"),
    [messages]
  );
  const hideAiActions = status === "submitted" || status === "streaming";
  // SSE loading state.
  const isSseLoading = status === "submitted" || status === "streaming";

  // 发送消息后，在 AI 还没返回任何可见内容前显示“正在思考中”
  const shouldShowThinking = React.useMemo(() => {
    if (error) return false;
    if (stepThinking) return true;
    if (!(status === "submitted" || status === "streaming")) return false;
    const last = messages[messages.length - 1] as any;
    if (!last) return false;
    if (last.role === "user") return true;
    // assistant 已创建但还没产出内容（例如刚进入 streaming）
    return last.role === "assistant" && !messageHasVisibleContent(last);
  }, [messages, status, error, stepThinking]);

  useChatScroll({
    scrollToBottomToken,
    scrollToMessageToken,
    // AI 输出过程中/结束瞬间：仅当用户贴底时跟随滚动（避免用户上滑时被强制拉回底部）
    followToBottomToken:
      messages.length + streamTick + (status === "ready" ? 1 : 0) + (error ? 1 : 0),
    // 中文注释：SSE 请求中启用贴底跟随，用户上滑可暂停。
    forceFollow: isSseLoading,
    viewportRef,
    bottomRef,
    contentRef,
  });

  if (!isHistoryLoading && messages.length === 0) {
    return (
      <div
        className={cn(
          "flex-1 relative min-w-0 flex flex-col min-h-0 overflow-x-hidden overflow-y-auto",
          className
        )}
      >
        <MessageHelper />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex-1 relative min-w-0 flex flex-col min-h-0 overflow-hidden",
        className
      )}
    >
      <div
        ref={viewportRef}
        className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden !select-text [&_*:not(summary)]:!select-text"
      >
        <div
          ref={contentRef}
          className="min-h-full w-full min-w-0 space-y-4 pb-4 flex flex-col justify-end"
        >
          {(messages as any[]).map((message, index) => (
            <MessageItem
              key={message?.id ?? `m_${index}`}
              message={message}
              isLastHumanMessage={index === lastHumanIndex}
              isLastAiMessage={index === lastAiIndex}
              hideAiActions={hideAiActions}
            />
          ))}

          <AnimatePresence initial={false}>
            {shouldShowThinking ? <MessageThinking /> : null}
          </AnimatePresence>

          {error && <MessageError error={error} />}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
