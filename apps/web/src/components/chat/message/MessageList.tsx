"use client";

import { cn } from "@/lib/utils";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
  const reduceMotion = useReducedMotion();
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
    <div className={cn("flex-1 mb-4 relative", className)}>
      <ScrollArea.Root className="h-full w-full">
        <ScrollArea.Viewport
          ref={viewportRef}
          className="w-full h-full min-h-0"
        >
          <div ref={contentRef}>
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={sessionId}
                className="space-y-4"
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <AnimatePresence initial={false} mode="wait">
                  {isHistoryLoading && messages.length === 0 ? (
                    <motion.div
                      key="history-loading"
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12, ease: "easeOut" }}
                    >
                      <MessageHistorySkeleton />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="history-ready"
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12, ease: "easeOut" }}
                    >
                      <AnimatePresence initial={false} mode="popLayout">
                        {messages.length === 0 ? (
                          <motion.div
                            key="message-helper"
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={
                              reduceMotion
                                ? { opacity: 0 }
                                : { opacity: 0, y: -6 }
                            }
                            transition={{ duration: 0.18, ease: "easeOut" }}
                          >
                            <MessageHelper />
                          </motion.div>
                        ) : (
                          <>
                            {messages.map((message, index) => {
                              const key =
                                message.id ?? `${message.role}-${index}`;
                              return (
                                <MessageItem
                                  key={key}
                                  message={message}
                                  reduceMotion={reduceMotion}
                                />
                              );
                            })}

                            {(status === "submitted" ||
                              status === "streaming") && (
                              <MessageThinking reduceMotion={reduceMotion} />
                            )}

                            {error && (
                              <MessageError
                                error={error}
                                reduceMotion={reduceMotion}
                              />
                            )}
                          </>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </AnimatePresence>

            <div ref={bottomRef} />
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" style={{ right: "-8px" }}>
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
        <ScrollArea.Corner />
      </ScrollArea.Root>
    </div>
  );
}