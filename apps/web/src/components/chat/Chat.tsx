"use client";

import { cn } from "@/lib/utils";
import ChatProvider from "./ChatProvider";
import MessageList from "./message/MessageList";
import ChatInput from "./ChatInput";
import ChatHeader from "./ChatHeader";
import { generateId } from "ai";
import * as React from "react";
import { useTabs } from "@/hooks/use_tabs";

type ChatProps = {
  className?: string;
  panelKey: string;
  sessionId?: string;
  loadHistory?: boolean;
} & Record<string, unknown>;

export function Chat({
  className,
  panelKey,
  sessionId,
  loadHistory,
  ...params
}: ChatProps) {
  const sessionIdRef = React.useRef<string>(sessionId ?? generateId());
  const effectiveSessionId = sessionId ?? sessionIdRef.current;
  const effectiveLoadHistory = loadHistory ?? Boolean(sessionId);
  const { updatePanelParamsByKey } = useTabs();

  React.useEffect(() => {
    if (sessionId) return;
    updatePanelParamsByKey(panelKey, {
      sessionId: effectiveSessionId,
      loadHistory: false,
    });
  }, [sessionId, panelKey, effectiveSessionId, updatePanelParamsByKey]);

  return (
    <ChatProvider
      key={effectiveSessionId}
      sessionId={effectiveSessionId}
      loadHistory={effectiveLoadHistory}
      params={params}
      onSessionChange={(nextSessionId, options) => {
        updatePanelParamsByKey(panelKey, {
          sessionId: nextSessionId,
          loadHistory: options?.loadHistory,
        });
      }}
    >
      <div
        className={cn(
          "flex h-full w-full flex-col min-h-0 min-w-0 overflow-x-visible overflow-y-hidden",
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
