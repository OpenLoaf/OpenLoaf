import * as React from "react";

interface UseChatScrollProps {
  scrollToBottomToken: number;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

export function useChatScroll({
  scrollToBottomToken,
  viewportRef,
  bottomRef,
  contentRef,
}: UseChatScrollProps) {
  const isPinnedToBottomRef = React.useRef(true);

  const getIsAtBottom = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return true;
    const threshold = 32;
    const distanceFromBottom =
      viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
    return distanceFromBottom <= threshold;
  }, [viewportRef]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    isPinnedToBottomRef.current = getIsAtBottom();

    let raf: number | null = null;
    const onScroll = () => {
      if (raf != null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        isPinnedToBottomRef.current = getIsAtBottom();
      });
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      viewport.removeEventListener("scroll", onScroll);
    };
  }, [viewportRef, getIsAtBottom]);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior) => {
    const viewport = viewportRef.current;
    const bottom = bottomRef.current;
    if (!viewport || !bottom) return;
    isPinnedToBottomRef.current = true;
    bottom.scrollIntoView({ block: "end", behavior });
  }, [viewportRef, bottomRef]);

  React.useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollToBottomToken, scrollToBottom]);

  React.useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (isPinnedToBottomRef.current) {
        scrollToBottom("auto");
      }
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [contentRef, scrollToBottom]);
}
