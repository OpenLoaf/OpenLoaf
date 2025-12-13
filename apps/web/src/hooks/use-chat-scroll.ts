import * as React from "react";
import type { UIMessage } from "@ai-sdk/react";

interface UseChatScrollProps {
  messages: UIMessage[];
  status: string;
  scrollToBottomToken: number;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

export function useChatScroll({
  messages,
  status,
  scrollToBottomToken,
  viewportRef,
  bottomRef,
  contentRef,
}: UseChatScrollProps) {
  const lastMessageTextLength = React.useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last) return 0;
    return (last.parts ?? []).reduce((sum: number, part: any) => {
      if (part?.type !== "text") return sum;
      return sum + (typeof part.text === "string" ? part.text.length : 0);
    }, 0);
  }, [messages]);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior) => {
    const viewport = viewportRef.current;
    const bottom = bottomRef.current;
    if (!viewport || !bottom) return;
    bottom.scrollIntoView({ block: "end", behavior });
  }, [viewportRef, bottomRef]);

  React.useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollToBottomToken, scrollToBottom]);

  React.useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
    return () => cancelAnimationFrame(raf);
  }, [messages.length, lastMessageTextLength, status, scrollToBottom]);

  React.useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      scrollToBottom("auto");
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [contentRef, scrollToBottom]);
}
