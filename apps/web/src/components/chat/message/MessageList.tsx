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

  const lastHumanIndex = React.useMemo(
    () => messages.findLastIndex((message) => message.role === "user"),
    [messages]
  );
  const lastAiIndex = React.useMemo(
    () => messages.findLastIndex((message) => message.role !== "user"),
    [messages]
  );
  const hideAiActions = status === "submitted" || status === "streaming";

  useChatScroll({
    scrollToBottomToken,
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

              {/* {(status === "submitted" || status === "streaming") && (
                <MessageThinking />
              )} */}

              {error && <MessageError error={error} />}
            </>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
