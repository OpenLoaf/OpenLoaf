import * as React from "react";

interface UseChatScrollProps {
  scrollToBottomToken: number;
  scrollToMessageToken?: { messageId: string; token: number } | null;
  followToBottomToken?: number;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

export function useChatScroll({
  scrollToBottomToken,
  scrollToMessageToken,
  followToBottomToken,
  viewportRef,
  bottomRef,
  contentRef,
}: UseChatScrollProps) {
  const isPinnedToBottomRef = React.useRef(true);
  const shouldAutoFollowRef = React.useRef(true);
  const isAutoScrollingRef = React.useRef(false);

  const escapeAttrValue = React.useCallback((value: string) => {
    // 关键：CSS.escape 在老环境可能不存在，这里做最小兜底，避免选择器注入/崩溃。
    if (typeof (globalThis as any).CSS?.escape === "function") {
      return (globalThis as any).CSS.escape(value);
    }
    return value.replace(/["\\]/g, "\\$&");
  }, []);

  const getIsAtBottom = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return true;
    const threshold = 48;
    const distanceFromBottom =
      viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
    return distanceFromBottom <= threshold;
  }, [viewportRef]);

  React.useEffect(() => {
    let raf: number | null = null;
    let poll: number | null = null;
    let viewport: HTMLDivElement | null = null;

    const attach = (nextViewport: HTMLDivElement) => {
      viewport = nextViewport;

      const initialPinned = getIsAtBottom();
      isPinnedToBottomRef.current = initialPinned;
      shouldAutoFollowRef.current = initialPinned;

      const onScroll = () => {
        // 自动滚动触发的 scroll 事件不要更新 pinned 状态（避免流式输出期间误判为“用户离底”）
        if (isAutoScrollingRef.current) return;
        if (raf != null) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          if (!viewport) return;
          const pinned = getIsAtBottom();
          isPinnedToBottomRef.current = pinned;
          // 关键：是否“持续跟随”以用户滚动为准：用户上滑则退出跟随，用户滚回底部则恢复跟随。
          shouldAutoFollowRef.current = pinned;
        });
      };

      viewport.addEventListener("scroll", onScroll, { passive: true });

      return () => {
        viewport?.removeEventListener("scroll", onScroll);
      };
    };

    let detach: (() => void) | null = null;

    const tryAttach = () => {
      if (detach) return;
      const nextViewport = viewportRef.current;
      if (nextViewport) {
        detach = attach(nextViewport);
        return;
      }
      poll = requestAnimationFrame(tryAttach);
    };

    tryAttach();

    return () => {
      if (poll != null) cancelAnimationFrame(poll);
      if (raf != null) cancelAnimationFrame(raf);
      detach?.();
      detach = null;
      viewport = null;
    };
  }, [viewportRef, getIsAtBottom]);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    isPinnedToBottomRef.current = true;
    shouldAutoFollowRef.current = true;
    isAutoScrollingRef.current = true;
    // 用 scrollTop 方式更可靠：scrollIntoView 在某些布局/嵌套滚动场景下不会滚动目标容器
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    // 下一帧再允许 scroll 事件更新 pinned 状态
    requestAnimationFrame(() => {
      isAutoScrollingRef.current = false;
      // 关键：这里不要用一次 getIsAtBottom 直接覆盖 shouldAutoFollow，
      // 因为流式渲染/图片加载等可能导致“短暂离底”，但用户并未手动滚动离开底部。
      isPinnedToBottomRef.current = getIsAtBottom();
    });
  }, [viewportRef, getIsAtBottom]);

  React.useLayoutEffect(() => {
    if (!scrollToMessageToken) return;
    const { messageId } = scrollToMessageToken;
    if (!messageId) return;

    // 关键：切分支属于“浏览历史/对比”，应退出 pinned 模式，避免后续自动贴底把视图拉走。
    isPinnedToBottomRef.current = false;
    shouldAutoFollowRef.current = false;

    const selector = `[data-message-id="${escapeAttrValue(String(messageId))}"]`;
    const tryScroll = () => {
      const el = document.querySelector(selector);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        return true;
      }
      return false;
    };

    if (tryScroll()) return;
    const raf = requestAnimationFrame(() => {
      tryScroll();
    });
    return () => cancelAnimationFrame(raf);
  }, [
    scrollToMessageToken?.token,
    scrollToMessageToken?.messageId,
    escapeAttrValue,
  ]);

  React.useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollToBottomToken, scrollToBottom]);

  React.useLayoutEffect(() => {
    if (followToBottomToken === undefined) return;
    if (!shouldAutoFollowRef.current) return;
    const raf = requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
    return () => cancelAnimationFrame(raf);
  }, [followToBottomToken, scrollToBottom]);

  React.useEffect(() => {
    let raf: number | null = null;
    let poll: number | null = null;
    let content: HTMLDivElement | null = null;
    let mutationObserver: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const schedule = () => {
      if (!shouldAutoFollowRef.current) return;
      if (raf != null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        scrollToBottom("auto");
      });
    };

    const attach = (nextContent: HTMLDivElement) => {
      content = nextContent;

      // 关键：ResizeObserver 在部分环境/布局下可能不会对“文本增量”稳定触发，
      // 加一个 MutationObserver 兜底，确保 SSE 流式更新时能持续贴底。
      mutationObserver =
        typeof MutationObserver === "undefined"
          ? null
          : new MutationObserver(() => {
              schedule();
            });
      mutationObserver?.observe(content, {
        subtree: true,
        childList: true,
        characterData: true,
      });

      resizeObserver =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => {
              schedule();
            });
      resizeObserver?.observe(content);
    };

    const tryAttach = () => {
      if (content) return;
      const nextContent = contentRef.current;
      if (nextContent) {
        attach(nextContent);
        return;
      }
      poll = requestAnimationFrame(tryAttach);
    };

    tryAttach();

    return () => {
      if (poll != null) cancelAnimationFrame(poll);
      if (raf != null) cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      resizeObserver = null;
      mutationObserver = null;
      content = null;
    };
  }, [contentRef, scrollToBottom]);
}
