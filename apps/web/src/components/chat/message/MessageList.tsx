"use client";

import { cn } from "@/lib/utils";
import * as ScrollArea from "@radix-ui/react-scroll-area";
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
  const {
    id: sessionId,
    messages,
    status,
    error,
    scrollToBottomToken,
    isHistoryLoading,
  } = useChatContext();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  useChatScroll({
    messages,
    status,
    scrollToBottomToken,
    viewportRef,
    bottomRef,
    contentRef,
  });

  return (
    <div className={cn("flex-1 mb-4 relative min-w-0", className)}>
      <ScrollArea.Root className="h-full w-full min-w-0">
        <ScrollArea.Viewport
          ref={viewportRef}
          className="w-full h-full min-h-0 min-w-0 overflow-x-hidden !select-text [&_*]:!select-text"
        >
          <div ref={contentRef} className="min-w-0">
            <div key={sessionId} className="space-y-4 min-w-0">
              {isHistoryLoading && messages.length === 0 ? (
                <MessageHistorySkeleton />
              ) : messages.length === 0 ? (
                <MessageHelper />
              ) : (
                <>
                  {messages.map((message, index) => {
                    const key = message.id ?? `${message.role}-${index}`;
                    return (
                      <MessageItem
                        key={key}
                        message={message}
                        isLast={index === messages.length - 1}
                      />
                    );
                  })}

                  {(status === "submitted" || status === "streaming") && (
                    <MessageThinking />
                  )}

                  {error && <MessageError error={error} />}
                </>
              )}
            </div>

            <div ref={bottomRef} />
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" style={{ right: "-10px" }}>
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
        <ScrollArea.Corner />
      </ScrollArea.Root>
    </div>
  );
}
