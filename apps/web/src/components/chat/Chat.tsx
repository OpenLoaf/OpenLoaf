"use client";

import { cn } from "@/lib/utils";
import ChatProvider from "./ChatProvider";
import MessageList from "./message/MessageList";
import ChatInput from "./ChatInput";
import ChatHeader from "./ChatHeader";

interface ChatProps {
  className?: string;
}

export function Chat({ className }: ChatProps) {
  return (
    <ChatProvider>
      <div className={cn("flex h-full w-full flex-col  min-h-0", className)}>
        <ChatHeader />
        <MessageList className="flex-1 min-h-0" />
        <ChatInput />
      </div>
    </ChatProvider>
  );
}
