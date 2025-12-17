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
import { TabActiveProvider } from "./TabActiveContext";
import type { Tab } from "@teatime-ai/api/common";

const RIGHT_CHAT_MIN_PX = 360;
const DIVIDER_GAP_PX = 10;
const SPRING_CONFIG = { type: "spring", stiffness: 140, damping: 30 };

function TabLayer({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 will-change-opacity transition-opacity duration-180 ease-out",
        active ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
      )}
      aria-hidden={!active}
    >
      <TabActiveProvider active={active}>{children}</TabActiveProvider>
    </div>
  );
}

const MemoChat = React.memo(Chat);

export function TabLayout({
  tabs,
  activeTabId,
}: {
  tabs: Tab[];
  activeTabId: string;
}) {
  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const setTabLeftWidthPercent = useTabs((s) => s.setTabLeftWidthPercent);
  const setTabChatSession = useTabs((s) => s.setTabChatSession);
  const reduceMotion = useReducedMotion();

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(0);

  // Maintain chat session handlers to avoid re-renders
  const chatSessionChangeHandlersRef = React.useRef<
    Map<string, (sessionId: string, options?: { loadHistory?: boolean }) => void>
  >(new Map());

  const getOnChatSessionChange = React.useCallback(
    (tabId: string) => {
      const existing = chatSessionChangeHandlersRef.current.get(tabId);
      if (existing) return existing;
      const handler = (nextSessionId: string, options?: { loadHistory?: boolean }) => {
        setTabChatSession(tabId, nextSessionId, options);
      };
      chatSessionChangeHandlersRef.current.set(tabId, handler);
      return handler;
    },
    [setTabChatSession],
  );

  React.useEffect(() => {
    const present = new Set(tabs.map((tab) => tab.id));
    const map = chatSessionChangeHandlersRef.current;
    for (const tabId of map.keys()) {
      if (!present.has(tabId)) map.delete(tabId);
    }
  }, [tabs]);

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

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const hasLeftContent = Boolean(activeTab?.base) || (activeTab?.stack?.length ?? 0) > 0;
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
      // We allow right panel to compress if needed, but ideally enforce min width logic
      // NOTE: containerWidth is the flex container content-box width, so we must also
      // reserve divider width; otherwise right side can end up smaller than RIGHT_CHAT_MIN_PX.
      const maxLeft = Math.max(minLeft, containerWidth - RIGHT_CHAT_MIN_PX - targetDividerWidth);

      const storedLeftPx = (storedLeftWidthPercent / 100) * containerWidth;
      const targetPx = Math.max(minLeft, Math.min(storedLeftPx, maxLeft));
      targetSplitPercent = (targetPx / containerWidth) * 100;
    } else {
      targetSplitPercent = 30; // Default before measure
    }
  }

  const splitPercent = useSpring(targetSplitPercent, SPRING_CONFIG);
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    if (isDragging) return;
    if (reduceMotion) {
      splitPercent.jump(targetSplitPercent);
      return;
    }
    splitPercent.set(targetSplitPercent);
  }, [targetSplitPercent, isDragging, splitPercent, reduceMotion]);

  const handleDragStart = (e: React.PointerEvent) => {
    if (targetDividerWidth === 0) return;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

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

  const handleDragEnd = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);

    const currentPercent = splitPercent.get();
    if (activeTabId) setTabLeftWidthPercent(activeTabId, Math.round(currentPercent * 10) / 10);
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
          // 关键：左侧不可见时必须允许宽度为 0，否则 minWidth 会“顶开”右侧聊天区。
          minWidth: isLeftVisible ? effectiveMinLeft : 0,
        }}
        animate={{ opacity: isLeftVisible ? 1 : 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.18, ease: "easeOut" }
        }
      >
        <div className="h-full w-full relative">
          {tabs.map((tab) => (
            <TabLayer key={`left:${tab.id}`} active={tab.id === activeTabId}>
              <div 
                className="h-full w-full min-h-0 min-w-0"
                style={{
                  // 关键：隐藏左栏时不要再强制最小宽度，避免布局被撑开。
                  minWidth: isLeftVisible
                    ? (tab.minLeftWidth ?? LEFT_DOCK_MIN_PX)
                    : 0,
                }}
              >
                <LeftDock tabId={tab.id} />
              </div>
            </TabLayer>
          ))}
        </div>
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
        <div className="h-full w-full relative">
          {tabs.map((tab) => (
            <TabLayer key={`right:${tab.id}`} active={tab.id === activeTabId}>
              <div 
                className="h-full w-full min-h-0 min-w-0 p-2"
                style={{ minWidth: RIGHT_CHAT_MIN_PX }}
              >
                <MemoChat
                  panelKey={`chat:${tab.id}`}
                  sessionId={tab.chatSessionId}
                  loadHistory={tab.chatLoadHistory}
                  tabId={tab.id}
                  {...(tab.chatParams ?? {})}
                  onSessionChange={getOnChatSessionChange(tab.id)}
                />
              </div>
            </TabLayer>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
