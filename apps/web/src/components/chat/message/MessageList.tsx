"use client";

import { cn } from "@/lib/utils";
import { useChatContext } from "../ChatProvider";
import MessageHelper from "./MessageHelper";
import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import MessageItem from "./MessageItem";
import MessageThinking from "./MessageThinking";
import MessageError from "./MessageError";
import { AnimatePresence } from "motion/react";

interface MessageListProps {
  className?: string;
}

function MessageHistorySkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-start">
        <div className="max-w-[80%] w-[520px] rounded-lg bg-secondary p-3">
          <Skeleton className="h-4 w-[72%]" />
          <Skeleton className="mt-2 h-4 w-[56%]" />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="max-w-[80%] w-[460px] rounded-lg bg-primary/10 p-3">
          <Skeleton className="h-4 w-[64%]" />
          <Skeleton className="mt-2 h-4 w-[40%]" />
        </div>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[80%] w-[560px] rounded-lg bg-secondary p-3">
          <Skeleton className="h-4 w-[78%]" />
          <Skeleton className="mt-2 h-4 w-[62%]" />
          <Skeleton className="mt-2 h-4 w-[48%]" />
        </div>
      </div>
    </div>
  );
}

export default function MessageList({ className }: MessageListProps) {
  const { messages, status, error, scrollToBottomToken, isHistoryLoading } =
    useChatContext();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  // 判断 assistant 消息是否已有“可见内容”（文本/工具卡片等），用于决定是否显示“正在思考中”
  const hasVisibleContent = React.useCallback((message: any) => {
    const parts = message?.parts ?? [];
    const hasText = parts.some(
      (part: any) =>
        part?.type === "text" && typeof part?.text === "string" && part.text.trim().length > 0
    );
    if (hasText) return true;
    return parts.some(
      (part: any) =>
        typeof part?.type === "string" &&
        (part.type === "dynamic-tool" || part.type.startsWith("tool-"))
    );
  }, []);

  const lastHumanIndex = React.useMemo(
    () => messages.findLastIndex((message) => message.role === "user"),
    [messages]
  );
  const lastAiIndex = React.useMemo(
    () => messages.findLastIndex((message) => message.role !== "user"),
    [messages]
  );
  const hideAiActions = status === "submitted" || status === "streaming";

  // 发送消息后，在 AI 还没返回任何可见内容前显示“正在思考中”
  const shouldShowThinking = React.useMemo(() => {
    if (error) return false;
    if (!(status === "submitted" || status === "streaming")) return false;
    const last = messages[messages.length - 1] as any;
    if (!last) return false;
    if (last.role === "user") return true;
    // assistant 已创建但还没产出内容（例如刚进入 streaming）
    return last.role === "assistant" && !hasVisibleContent(last);
  }, [messages, status, error, hasVisibleContent]);

  useChatScroll({
    scrollToBottomToken,
    // AI 输出过程中/结束瞬间：仅当用户贴底时跟随滚动（避免用户上滑时被强制拉回底部）
    followToBottomToken:
      messages.length + (status === "ready" ? 1 : 0) + (error ? 1 : 0),
    viewportRef,
    bottomRef,
    contentRef,
  });

  if (!isHistoryLoading && messages.length === 0) {
    return (
      <div
        className={cn(
          "flex-1 relative min-w-0 flex flex-col min-h-0 overflow-hidden",
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
        <div ref={contentRef} className="min-w-0 space-y-4 pb-4">
          {isHistoryLoading && messages.length === 0 ? (
            <MessageHistorySkeleton />
          ) : (
            <>
              {messages.map((message, index) => (
                <MessageItem
                  key={message.id ?? `m_${index}`}
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
            </>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
