"use client";

import { cn } from "@/lib/utils";
import ChatProvider from "./ChatProvider";
import MessageList from "./message/MessageList";
import ChatInput from "./ChatInput";
import ChatHeader from "./ChatHeader";
import { generateId } from "ai";
import * as React from "react";

type ChatProps = {
  className?: string;
  panelKey?: string;
  tabId?: string;
  sessionId?: string;
  loadHistory?: boolean;
  onSessionChange?: (
    sessionId: string,
    options?: { loadHistory?: boolean }
  ) => void;
} & Record<string, unknown>;

export function Chat({
  className,
  panelKey: _panelKey,
  tabId,
  sessionId,
  loadHistory,
  onSessionChange,
  ...params
}: ChatProps) {
  const sessionIdRef = React.useRef<string>(sessionId ?? generateId());
  const effectiveSessionId = sessionId ?? sessionIdRef.current;
  const effectiveLoadHistory = loadHistory ?? Boolean(sessionId);

  React.useEffect(() => {
    if (sessionId) return;
    onSessionChange?.(effectiveSessionId, { loadHistory: false });
  }, [sessionId, effectiveSessionId, onSessionChange]);

  return (
    <ChatProvider
      key={effectiveSessionId}
      tabId={tabId}
      sessionId={effectiveSessionId}
      loadHistory={effectiveLoadHistory}
      params={params}
      onSessionChange={onSessionChange}
    >
      <div
        className={cn(
          "flex h-full w-full flex-col min-h-0 min-w-0 overflow-x-hidden overflow-y-hidden",
          className
        )}
      >
        <ChatHeader />
        <MessageList className="flex-1 min-h-0" />
        <ChatInput />
      </div>
    </ChatProvider>
  );
}
