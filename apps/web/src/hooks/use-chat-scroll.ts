import * as React from "react";

interface UseChatScrollProps {
  scrollToBottomToken: number;
  scrollToMessageToken?: { messageId: string; token: number } | null;
  followToBottomToken?: number;
  /** Enable follow-to-bottom while SSE is loading. */
  forceFollow?: boolean;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

export function useChatScroll({
  scrollToBottomToken,
  scrollToMessageToken,
  followToBottomToken,
  forceFollow,
  viewportRef,
  bottomRef,
  contentRef,
}: UseChatScrollProps) {
  const isPinnedToBottomRef = React.useRef(true);
  const shouldAutoFollowRef = React.useRef(true);
  const isAutoScrollingRef = React.useRef(false);
  const lastScrollTopRef = React.useRef(0);
  const userScrollIntentRef = React.useRef(false);
  // Whether force-follow is enabled by props.
  const forceFollowEnabledRef = React.useRef(false);
  // Whether we are currently forcing follow.
  const forceFollowRef = React.useRef(false);

  React.useEffect(() => {
    // 中文注释：SSE loading 仅在未被用户上滑打断时才启用贴底跟随。
    forceFollowEnabledRef.current = Boolean(forceFollow);
    if (!forceFollowEnabledRef.current) {
      forceFollowRef.current = false;
      return;
    }
    if (shouldAutoFollowRef.current) {
      forceFollowRef.current = true;
      userScrollIntentRef.current = false;
    }
  }, [forceFollow]);

  const escapeAttrValue = React.useCallback((value: string) => {
    // 关键：CSS.escape 在老环境可能不存在，这里做最小兜底，避免选择器注入/崩溃。
    if (typeof (globalThis as any).CSS?.escape === "function") {
      return (globalThis as any).CSS.escape(value);
    }
    return value.replace(/["\\]/g, "\\$&");
  }, []);

  const getDistanceFromBottom = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return 0;
    return viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
  }, [viewportRef]);

  const getIsAtBottom = React.useCallback(() => {
    const bottomThreshold = 48;
    return getDistanceFromBottom() <= bottomThreshold;
  }, [getDistanceFromBottom]);

  React.useEffect(() => {
    let raf: number | null = null;
    let poll: number | null = null;
    let viewport: HTMLDivElement | null = null;

    const attach = (nextViewport: HTMLDivElement) => {
      viewport = nextViewport;

      const initialPinned = getIsAtBottom();
      isPinnedToBottomRef.current = initialPinned;
      shouldAutoFollowRef.current = initialPinned;
      lastScrollTopRef.current = viewport.scrollTop;

      const onScroll = () => {
        // 自动滚动触发的 scroll 事件不要更新 pinned 状态（避免流式输出期间误判为“用户离底”）
        if (isAutoScrollingRef.current) return;
        if (raf != null) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          if (!viewport) return;
          const pinned = getIsAtBottom();
          const currentScrollTop = viewport.scrollTop;
          const scrolledUp = currentScrollTop < lastScrollTopRef.current - 2;
          const scrolledDown = currentScrollTop > lastScrollTopRef.current + 2;
          const distanceFromBottom = getDistanceFromBottom();
          isPinnedToBottomRef.current = pinned;
          // 中文注释：只要用户有上滑动作就暂停自动跟随，避免被“拖回底部”。
          if (scrolledUp && distanceFromBottom > 8 && userScrollIntentRef.current) {
            shouldAutoFollowRef.current = false;
            forceFollowRef.current = false;
          } else if (
            forceFollowEnabledRef.current &&
            !shouldAutoFollowRef.current &&
            scrolledDown &&
            distanceFromBottom <= 120 &&
            userScrollIntentRef.current
          ) {
            // 中文注释：SSE loading 下用户向下滑接近底部时恢复跟随（避免追不上“移动的底部”）。
            shouldAutoFollowRef.current = true;
            forceFollowRef.current = true;
            userScrollIntentRef.current = false;
          } else if (pinned) {
            // 中文注释：用户回到底部后恢复自动跟随。
            shouldAutoFollowRef.current = true;
            userScrollIntentRef.current = false;
            if (forceFollowEnabledRef.current) {
              forceFollowRef.current = true;
            }
          }
          lastScrollTopRef.current = currentScrollTop;
        });
      };

      viewport.addEventListener("scroll", onScroll, { passive: true });
      const markUserScrollIntent = () => {
        userScrollIntentRef.current = true;
      };
      viewport.addEventListener("wheel", markUserScrollIntent, { passive: true });
      viewport.addEventListener("touchstart", markUserScrollIntent, { passive: true });
      viewport.addEventListener("pointerdown", markUserScrollIntent);

      return () => {
        viewport?.removeEventListener("scroll", onScroll);
        viewport?.removeEventListener("wheel", markUserScrollIntent);
        viewport?.removeEventListener("touchstart", markUserScrollIntent);
        viewport?.removeEventListener("pointerdown", markUserScrollIntent);
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
    userScrollIntentRef.current = false;
    if (forceFollowEnabledRef.current) {
      forceFollowRef.current = true;
    }
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
    forceFollowRef.current = false;

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
    const distance = getDistanceFromBottom();
    const shouldFollow =
      forceFollowRef.current ||
      shouldAutoFollowRef.current ||
      distance <= 8 ||
      isPinnedToBottomRef.current;
    if (!shouldFollow) return;
    const raf = requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
    return () => cancelAnimationFrame(raf);
  }, [followToBottomToken, scrollToBottom, getDistanceFromBottom]);

  React.useEffect(() => {
    let raf: number | null = null;
    let poll: number | null = null;
    let content: HTMLDivElement | null = null;
    let mutationObserver: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const schedule = () => {
      const distance = getDistanceFromBottom();
      const shouldFollow =
        forceFollowRef.current ||
        shouldAutoFollowRef.current ||
        distance <= 8 ||
        isPinnedToBottomRef.current;
      if (!shouldFollow) return;
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
  }, [contentRef, scrollToBottom, getDistanceFromBottom]);
}
