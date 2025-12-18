import * as React from "react";

interface UseChatScrollProps {
  scrollToBottomToken: number;
  followToBottomToken?: number;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

export function useChatScroll({
  scrollToBottomToken,
  followToBottomToken,
  viewportRef,
  bottomRef,
  contentRef,
}: UseChatScrollProps) {
  const isPinnedToBottomRef = React.useRef(true);
  const isAutoScrollingRef = React.useRef(false);

  const getIsAtBottom = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return true;
    const threshold = 48;
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
      // 自动滚动触发的 scroll 事件不要更新 pinned 状态（避免流式输出期间误判为“用户离底”）
      if (isAutoScrollingRef.current) return;
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
    if (!viewport) return;
    isPinnedToBottomRef.current = true;
    isAutoScrollingRef.current = true;
    // 用 scrollTop 方式更可靠：scrollIntoView 在某些布局/嵌套滚动场景下不会滚动目标容器
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    // 下一帧再允许 scroll 事件更新 pinned 状态
    requestAnimationFrame(() => {
      isAutoScrollingRef.current = false;
      isPinnedToBottomRef.current = getIsAtBottom();
    });
  }, [viewportRef, getIsAtBottom]);

  React.useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollToBottomToken, scrollToBottom]);

  React.useLayoutEffect(() => {
    if (followToBottomToken === undefined) return;
    if (!isPinnedToBottomRef.current) return;
    const raf = requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
    return () => cancelAnimationFrame(raf);
  }, [followToBottomToken, scrollToBottom]);

  React.useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    if (typeof ResizeObserver === "undefined") return;

    let raf: number | null = null;
    const observer = new ResizeObserver(() => {
      if (!isPinnedToBottomRef.current) return;
      if (raf != null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        scrollToBottom("auto");
      });
    });

    observer.observe(content);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [contentRef, scrollToBottom]);
}
