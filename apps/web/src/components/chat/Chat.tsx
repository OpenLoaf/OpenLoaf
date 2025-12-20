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
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const sessionIdRef = React.useRef<string>(sessionId ?? generateId());
  const effectiveSessionId = sessionId ?? sessionIdRef.current;
  const effectiveLoadHistory = loadHistory ?? Boolean(sessionId);

  React.useEffect(() => {
    if (sessionId) return;
    onSessionChange?.(effectiveSessionId, { loadHistory: false });
  }, [sessionId, effectiveSessionId, onSessionChange]);

  React.useEffect(() => {
    /**
     * 中文备注：监听 Tab 快捷键，按下后强制聚焦到输入框，便于快速进入输入状态。
     */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const inputElement = rootRef.current?.querySelector<HTMLTextAreaElement>(
        'textarea[data-teatime-chat-input="true"]'
      );
      if (!inputElement) return;

      event.preventDefault();
      event.stopPropagation();
      inputElement.focus();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

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
        ref={rootRef}
        className={cn(
          "flex h-full w-full flex-col min-h-0 min-w-0 overflow-x-hidden overflow-y-hidden",
          className
        )}
      >
        <ChatHeader loadHistory={effectiveLoadHistory} />
        <MessageList className="flex-1 min-h-0" />
        <ChatInput />
      </div>
    </ChatProvider>
  );
}
