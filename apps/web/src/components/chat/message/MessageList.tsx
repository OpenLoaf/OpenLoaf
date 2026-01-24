"use client";

import { cn } from "@/lib/utils";
import { useChatContext } from "../ChatProvider";
import MessageHelper from "./MessageHelper";
import * as React from "react";
import MessageItem from "./MessageItem";
import MessageThinking from "./MessageThinking";
import MessageError from "./tools/MessageError";
import { AnimatePresence } from "motion/react";
import { messageHasVisibleContent } from "@/lib/chat/message-visible";
import { incrementChatPerf } from "@/lib/chat/chat-perf";

interface MessageListProps {
  className?: string;
}

/** Chat message list for the active session. */
export default function MessageList({ className }: MessageListProps) {
  // 中文注释：统计渲染频率，用于定位流式渲染压力。
  incrementChatPerf("render.messageList");
  const {
    messages,
    status,
    error,
    isHistoryLoading,
    stepThinking,
    sessionId,
  } = useChatContext();

  const lastHumanIndex = React.useMemo(
    () => (messages as any[]).findLastIndex((m) => m?.role === "user"),
    [messages]
  );
  const lastAiIndex = React.useMemo(
    () => (messages as any[]).findLastIndex((m) => m?.role !== "user"),
    [messages]
  );
  const hideAiActions = status === "submitted" || status === "streaming";
  // 空态时展示提示卡片。
  const shouldShowHelper = !isHistoryLoading && messages.length === 0;

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

  if (shouldShowHelper) {
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
        className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden !select-text [&_*:not(summary)]:!select-text"
      >
        <div className="min-h-full w-full min-w-0 space-y-4 pb-4 flex flex-col">
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
        </div>
      </div>
    </div>
  );
}
