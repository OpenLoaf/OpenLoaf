"use client";

import { cn } from "@/lib/utils";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { useChatContext } from "../ChatProvider";
import MessageAi from "./MessageAi";
import MessageHuman from "./MessageHuman";
import MessageHelper from "./MessageHelper";

interface MessageListProps {
  className?: string;
}

export default function MessageList({ className }: MessageListProps) {
  const { messages, status, error } = useChatContext();

  return (
    <div className={cn("flex-1 mb-4 relative", className)}>
      <ScrollArea.Root className="h-full w-full">
        <ScrollArea.Viewport className="w-full h-full min-h-0">
          {messages.length === 0 ? (
            <MessageHelper />
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) =>
                message.role === "user" ? (
                  <MessageHuman
                    key={`${message.id}-${index}`}
                    message={message}
                  />
                ) : (
                  <MessageAi key={`${message.id}-${index}`} message={message} />
                )
              )}

              {(status === "submitted" || status === "streaming") && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] p-3 rounded-lg bg-secondary text-secondary-foreground">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse"></div>
                      <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse delay-150"></div>
                      <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse delay-300"></div>
                      <span className="text-xs text-muted-foreground">
                        正在思考...
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] p-3 rounded-lg bg-destructive/10 text-destructive">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">出错了</span>
                    </div>
                    <p className="text-xs mt-1">{error.message}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" style={{ right: "-7px" }}>
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
        <ScrollArea.Corner />
      </ScrollArea.Root>
    </div>
  );
}
