"use client";

import * as React from "react";
import {
  motion,
  useSpring,
  useTransform,
  useReducedMotion,
} from "motion/react";
import { cn } from "@/lib/utils";
import { Chat } from "@/components/chat/Chat";
import { useTabs, LEFT_DOCK_MIN_PX } from "@/hooks/use-tabs";
import { LeftDock } from "./LeftDock";
import type { Tab } from "@teatime-ai/api/common";
import {
  bindPanelHost,
  hasPanel,
  renderPanel,
  setPanelActive,
  syncPanelTabs,
} from "@/lib/panel-runtime";

const RIGHT_CHAT_MIN_PX = 360;
const DIVIDER_GAP_PX = 10;
const SPRING_CONFIG = { type: "spring", stiffness: 140, damping: 30 };
const PANEL_SWITCH_DELAY_MS = 180;

// Render the chat panel for a tab.
function ChatPanel({ tabId }: { tabId: string }) {
  const tab = useTabs((s) => s.getTabById(tabId));
  const setTabChatSession = useTabs((s) => s.setTabChatSession);

  const handleSessionChange = React.useCallback(
    (sessionId: string, options?: { loadHistory?: boolean }) => {
      setTabChatSession(tabId, sessionId, options);
    },
    [setTabChatSession, tabId],
  );

  if (!tab) return null;

  return (
    <div
      className="h-full w-full min-h-0 min-w-0 p-2"
      style={{ minWidth: RIGHT_CHAT_MIN_PX }}
    >
      <Chat
        panelKey={`chat:${tab.id}`}
        sessionId={tab.chatSessionId}
        loadHistory={tab.chatLoadHistory}
        tabId={tab.id}
        {...(tab.chatParams ?? {})}
        onSessionChange={handleSessionChange}
      />
    </div>
  );
}

// Render the main tab layout container.
export function TabLayout({
  tabs,
  activeTabId,
}: {
  tabs: Tab[];
  activeTabId: string;
}) {
  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );
  const stackHidden = useTabs((s) => Boolean(s.stackHiddenByTabId[activeTabId]));
  const setTabLeftWidthPercent = useTabs((s) => s.setTabLeftWidthPercent);
  const reduceMotion = useReducedMotion();

  const containerRef = React.useRef<HTMLDivElement>(null);
  const leftHostRef = React.useRef<HTMLDivElement>(null);
  const rightHostRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [minLeftEnabled, setMinLeftEnabled] = React.useState(true);
  const activeTabIdRef = React.useRef<string | null>(null);
  const mountTimerRef = React.useRef<number | null>(null);
  const switchTokenRef = React.useRef(0);
  const prevLeftVisibleRef = React.useRef<boolean | null>(null);
  const pendingMinLeftEnableRef = React.useRef(false);
  const leftVisibleRef = React.useRef(false);
  const minLeftEnableRafRef = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    bindPanelHost("left", leftHostRef.current);
    bindPanelHost("right", rightHostRef.current);
    return () => {
      bindPanelHost("left", null);
      bindPanelHost("right", null);
    };
  }, []);

  React.useEffect(() => {
    const tabIds = tabs.map((tab) => tab.id);
    syncPanelTabs("left", tabIds);
    syncPanelTabs("right", tabIds);
  }, [tabs]);

  React.useEffect(() => {
    const prevTabId = activeTabIdRef.current;
    if (prevTabId && prevTabId !== activeTabId) {
      setPanelActive("left", prevTabId, false);
      setPanelActive("right", prevTabId, false);
    }

    activeTabIdRef.current = activeTabId;

    if (mountTimerRef.current) {
      window.clearTimeout(mountTimerRef.current);
    }

    if (!activeTabId) return;

    switchTokenRef.current += 1;
    const token = switchTokenRef.current;
    const delay = reduceMotion || !prevTabId ? 0 : PANEL_SWITCH_DELAY_MS;

    mountTimerRef.current = window.setTimeout(() => {
      if (switchTokenRef.current !== token) return;
      // 中文注释：延迟挂载活跃 tab，避开切换动画期的主线程峰值。
      if (!hasPanel("left", activeTabId)) {
        renderPanel("left", activeTabId, <LeftDock tabId={activeTabId} />, true);
      } else {
        setPanelActive("left", activeTabId, true);
      }

      if (!hasPanel("right", activeTabId)) {
        renderPanel("right", activeTabId, <ChatPanel tabId={activeTabId} />, true);
      } else {
        setPanelActive("right", activeTabId, true);
      }
    }, delay);

    return () => {
      if (mountTimerRef.current) {
        window.clearTimeout(mountTimerRef.current);
        mountTimerRef.current = null;
      }
    };
  }, [activeTabId, reduceMotion]);

  React.useLayoutEffect(() => {
    // App should never horizontally scroll; prevent focus/scrollIntoView from shifting the page.
    if (typeof window === "undefined") return;
    if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    const scrollingEl = document.scrollingElement as HTMLElement | null;
    if (scrollingEl && scrollingEl.scrollLeft !== 0) scrollingEl.scrollLeft = 0;
  }, [activeTabId]);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 通过 rAF 节流 + 数值去抖，避免 ResizeObserver 回调内同步 setState 引发布局循环
    let rafId: number | null = null;
    let lastWidth = -1;
    const observer = new ResizeObserver((entries) => {
      // 拖拽时跳过，避免容器内部频繁重排触发循环通知
      if (draggingRef.current) return;
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = Math.round(entry.contentRect.width);
      if (nextWidth === lastWidth) return;
      lastWidth = nextWidth;
      if (rafId !== null) return; // 同一帧只更新一次
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setContainerWidth(nextWidth);
      });
    });

    observer.observe(container);
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      observer.disconnect();
    };
  }, []);

  const hasLeftContent =
    Boolean(activeTab?.base) ||
    (!stackHidden && (activeTab?.stack?.length ?? 0) > 0);
  const storedLeftWidthPercent = hasLeftContent ? activeTab?.leftWidthPercent ?? 0 : 0;
  const isRightCollapsed = Boolean(activeTab?.base) && Boolean(activeTab?.rightChatCollapsed);

  const effectiveMinLeft = activeTab?.minLeftWidth ?? LEFT_DOCK_MIN_PX;

  const isLeftVisible = storedLeftWidthPercent > 0;
  const isRightVisible = !isRightCollapsed;

  let targetSplitPercent = 50;
  let targetDividerWidth = 0;

  if (!isLeftVisible && isRightVisible) {
    // Mode C: Right Only (Left hidden)
    targetSplitPercent = 0;
    targetDividerWidth = 0;
  } else if (isLeftVisible && !isRightVisible) {
    // Mode B: Left Only (Right hidden)
    targetSplitPercent = 100;
    targetDividerWidth = 0;
  } else {
    // Mode A: Both visible
    targetDividerWidth = DIVIDER_GAP_PX;
    if (containerWidth > 0) {
      const minLeft = effectiveMinLeft;
      const maxLeft = Math.max(minLeft, containerWidth - RIGHT_CHAT_MIN_PX - targetDividerWidth);

      const storedLeftPx = (storedLeftWidthPercent / 100) * maxLeft;
      const targetPx = Math.max(minLeft, Math.min(storedLeftPx, maxLeft));
      targetSplitPercent = (targetPx / containerWidth) * 100;
    } else {
      targetSplitPercent = 30;
    }
  }

  const splitPercent = useSpring(targetSplitPercent, SPRING_CONFIG);

  React.useEffect(() => {
    leftVisibleRef.current = isLeftVisible;
  }, [isLeftVisible]);

  // 中文注释：左侧从隐藏切到显示时先关闭 minWidth，让宽度从 0 动画到目标，动画完成后再恢复 minWidth，避免 30% 闪动。
  React.useLayoutEffect(() => {
    const prevLeftVisible = prevLeftVisibleRef.current;
    prevLeftVisibleRef.current = isLeftVisible;

    if (!isLeftVisible) {
      pendingMinLeftEnableRef.current = false;
      if (minLeftEnableRafRef.current !== null) {
        cancelAnimationFrame(minLeftEnableRafRef.current);
        minLeftEnableRafRef.current = null;
      }
      if (minLeftEnabled) setMinLeftEnabled(false);
      return;
    }

    if (prevLeftVisible === false) {
      if (reduceMotion) {
        pendingMinLeftEnableRef.current = false;
        setMinLeftEnabled(true);
      } else {
        pendingMinLeftEnableRef.current = true;
        setMinLeftEnabled(false);
      }
      return;
    }

    if (prevLeftVisible === null && !minLeftEnabled) {
      setMinLeftEnabled(true);
    }
  }, [isLeftVisible, reduceMotion, minLeftEnabled]);

  React.useEffect(() => {
    // Enable min width after the split animation settles.
    const handleComplete = () => {
      if (!pendingMinLeftEnableRef.current) return;
      pendingMinLeftEnableRef.current = false;
      if (!leftVisibleRef.current) return;
      // 中文注释：动画完成后下一帧再开启 minWidth，避开 ResizeObserver 循环警告。
      if (minLeftEnableRafRef.current !== null) {
        cancelAnimationFrame(minLeftEnableRafRef.current);
      }
      minLeftEnableRafRef.current = requestAnimationFrame(() => {
        minLeftEnableRafRef.current = null;
        if (leftVisibleRef.current) setMinLeftEnabled(true);
      });
    };

    const unsubComplete = splitPercent.on("animationComplete", handleComplete);
    const unsubCancel = splitPercent.on("animationCancel", handleComplete);
    return () => {
      unsubComplete();
      unsubCancel();
      if (minLeftEnableRafRef.current !== null) {
        cancelAnimationFrame(minLeftEnableRafRef.current);
        minLeftEnableRafRef.current = null;
      }
    };
  }, [splitPercent]);

  React.useEffect(() => {
    if (isDragging) return;
    if (reduceMotion) {
      splitPercent.jump(targetSplitPercent);
      return;
    }
    splitPercent.set(targetSplitPercent);
  }, [targetSplitPercent, isDragging, splitPercent, reduceMotion]);

  // 拖拽状态写入 ref，供 ResizeObserver 回调读取，避免闭包状态过期
  const draggingRef = React.useRef(false);
  React.useEffect(() => {
    draggingRef.current = isDragging;
  }, [isDragging]);

  // Handle the start of the resize drag.
  const handleDragStart = (e: React.PointerEvent) => {
    if (targetDividerWidth === 0) return;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  // Handle the resize drag move.
  const handleDragMove = (e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;

    const minLeft = effectiveMinLeft;
    const maxLeft = Math.max(minLeft, rect.width - RIGHT_CHAT_MIN_PX - targetDividerWidth);
    const newLeftPx = Math.max(minLeft, Math.min(relativeX, maxLeft));

    const newPercent = (newLeftPx / rect.width) * 100;
    splitPercent.jump(newPercent);
  };

  // Handle the end of the resize drag.
  const handleDragEnd = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);

    const container = containerRef.current;
    if (!container || !activeTabId) return;

    const rect = container.getBoundingClientRect();
    const minLeft = effectiveMinLeft;
    const maxLeft = Math.max(minLeft, rect.width - RIGHT_CHAT_MIN_PX - targetDividerWidth);
    const currentLeftPx = (splitPercent.get() / 100) * rect.width;
    const nextPercentOfMax = (currentLeftPx / maxLeft) * 100;
    setTabLeftWidthPercent(activeTabId, Math.round(nextPercentOfMax * 10) / 10);
  };

  const isDividerHidden = targetDividerWidth === 0;

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full overflow-hidden bg-sidebar pr-2"
      data-slot="tab-layout"
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
      onPointerLeave={handleDragEnd}
    >
      <motion.div
        className="relative z-10 flex min-h-0 min-w-0 flex-col rounded-xl bg-background overflow-hidden"
        style={{
          width: useTransform(splitPercent, (v) => `${v}%`),
          minWidth: isLeftVisible && minLeftEnabled ? effectiveMinLeft : 0,
        }}
        animate={{ opacity: isLeftVisible ? 1 : 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.18, ease: "easeOut" }
        }
      >
        <div ref={leftHostRef} className="relative h-full w-full min-h-0 min-w-0" />
      </motion.div>

      <motion.div
        className={cn(
          "relative z-20 flex shrink-0 items-center justify-center rounded-4xl bg-sidebar touch-none select-none",
          "hover:bg-primary/20 active:bg-primary/30",
          isDragging ? "cursor-col-resize bg-primary/20" : "cursor-col-resize"
        )}
        style={{
          width: targetDividerWidth,
          opacity: isDividerHidden ? 0 : 1,
          pointerEvents: isDividerHidden ? "none" : "auto",
        }}
        onPointerDown={handleDragStart}
      >
        <div className={cn("h-6 w-1 rounded-full bg-muted/70", isDragging && "bg-primary/70")} />
      </motion.div>

      <motion.div
        className="flex-1 min-w-0 relative z-10 flex flex-col rounded-xl bg-background overflow-hidden"
        animate={{ opacity: isRightVisible ? 1 : 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.18, ease: "easeOut" }
        }
      >
        <div ref={rightHostRef} className="relative h-full w-full min-h-0 min-w-0" />
      </motion.div>
    </div>
  );
}
