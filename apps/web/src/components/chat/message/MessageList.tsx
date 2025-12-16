"use client";

import { cn } from "@/lib/utils";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import type { UIMessage } from "@ai-sdk/react";
import { useChatContext } from "../ChatProvider";
import MessageHelper from "./MessageHelper";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import MessageItem from "./MessageItem";
import MessageThinking from "./MessageThinking";
import MessageError from "./MessageError";

interface MessageListProps {
  className?: string;
}

const SCROLLBAR_STYLE = { right: "0px" } as const;

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
    historyMessages,
    latestMessage,
    status,
    error,
    scrollToBottomToken,
    isHistoryLoading,
  } = useChatContext();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  const fallbackKeyMapRef = React.useRef<WeakMap<UIMessage, string>>(
    new WeakMap()
  );
  const fallbackKeySeqRef = React.useRef(0);

  React.useEffect(() => {
    fallbackKeyMapRef.current = new WeakMap();
    fallbackKeySeqRef.current = 0;
  }, [sessionId]);

  const getMessageKey = React.useCallback(
    (message: UIMessage) => {
      if (message.id) return message.id;
      const existing = fallbackKeyMapRef.current.get(message);
      if (existing) return existing;
      const created = `m_${sessionId}_${fallbackKeySeqRef.current++}`;
      fallbackKeyMapRef.current.set(message, created);
      return created;
    },
    [sessionId]
  );

  const visibleMessages = React.useMemo(() => {
    if (!latestMessage) return historyMessages;
    return [...historyMessages, latestMessage];
  }, [historyMessages, latestMessage]);

  useChatScroll({
    messages: visibleMessages,
    status,
    scrollToBottomToken,
    viewportRef,
    bottomRef,
    contentRef,
  });

  const historyItems = React.useMemo(() => {
    const lastHumanIndex = historyMessages.findLastIndex(
      (message) => message.role === "user"
    );
    const lastAiIndex = historyMessages.findLastIndex(
      (message) => message.role !== "user"
    );

    const latestRole = latestMessage?.role ?? null;
    const historyLastHumanIndex =
      latestRole === "user" ? -1 : lastHumanIndex;
    const historyLastAiIndex =
      latestRole && latestRole !== "user" ? -1 : lastAiIndex;

    return historyMessages.map((message, index) => (
      <MessageItem
        key={getMessageKey(message)}
        message={message}
        isLastHumanMessage={index === historyLastHumanIndex}
        isLastAiMessage={index === historyLastAiIndex}
      />
    ));
  }, [historyMessages, latestMessage?.role, getMessageKey]);

  const latestItem = React.useMemo(() => {
    if (!latestMessage) return null;
    const isUser = latestMessage.role === "user";
    return (
      <MessageItem
        key={getMessageKey(latestMessage)}
        message={latestMessage}
        isLastHumanMessage={isUser}
        isLastAiMessage={!isUser}
      />
    );
  }, [latestMessage, getMessageKey]);

  return (
    <div
      className={cn(
        "flex-1 relative min-w-0 flex flex-col min-h-0 overflow-x-hidden overflow-y-hidden",
        className
      )}
    >
      <ScrollArea.Root className="flex-1 w-full min-w-0 overflow-x-hidden overflow-y-hidden">
        <ScrollArea.Viewport
          ref={viewportRef}
          className="w-full h-full min-h-0 min-w-0 overflow-x-hidden !select-text [&_*:not(summary)]:!select-text"
        >
          <div ref={contentRef} className="min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={sessionId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-4 min-w-0 pb-4"
              >
                {isHistoryLoading && visibleMessages.length === 0 ? (
                  <MessageHistorySkeleton />
                ) : visibleMessages.length > 0 ? (
                  <>
                    {historyItems}
                    {latestItem}

                    {(status === "submitted" || status === "streaming") && (
                      <MessageThinking />
                    )}

                    {error && <MessageError error={error} />}
                  </>
                ) : null}
              </motion.div>
            </AnimatePresence>

            <div ref={bottomRef} />
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" style={SCROLLBAR_STYLE}>
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
        <ScrollArea.Corner />
      </ScrollArea.Root>

      {/* 将MessageHelper移到ScrollArea外 */}
      {visibleMessages.length === 0 && !isHistoryLoading && <MessageHelper />}
    </div>
  );
}
