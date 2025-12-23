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
const TAB_FADE_MS = 180;

type PanelMode = "both" | "left-only" | "right-only" | "none";

function getPanelMode(tab: Tab | null, options?: { stackHidden?: boolean }): PanelMode {
  // 根据 tab 的“左右可见性”抽象出模式，用于决定“切换时是否应该禁用宽度动画”。
  if (!tab) return "none";
  const stackHidden = Boolean(options?.stackHidden);
  const hasLeftContent = Boolean(tab.base) || (!stackHidden && (tab.stack?.length ?? 0) > 0);
  const storedLeftWidthPercent = hasLeftContent ? tab.leftWidthPercent ?? 0 : 0;
  const isRightCollapsed = Boolean(tab.base) && Boolean(tab.rightChatCollapsed);

  const isLeftVisible = storedLeftWidthPercent > 0;
  const isRightVisible = !isRightCollapsed;

  if (isLeftVisible && isRightVisible) return "both";
  if (isLeftVisible && !isRightVisible) return "left-only";
  if (!isLeftVisible && isRightVisible) return "right-only";
  return "none";
}

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
// 缓存 LeftDock，降低切换 tab 时的渲染成本。
const MemoLeftDock = React.memo(LeftDock);

export function TabLayout({
  tabs,
  activeTabId,
}: {
  tabs: Tab[];
  activeTabId: string;
}) {
  // layoutTabId：用于“布局计算”的 tab（决定左右面板宽度/折叠状态）
  // visibleTabId：用于“内容渲染”的 tab（决定当前显示哪一个 tab 的 LeftDock/Chat）
  // 之所以分离：在“左独占 ↔ 右独占”的切换时，我们先把内容淡出，再切布局，再淡入，避免宽度缩放动画。
  const [layoutTabId, setLayoutTabId] = React.useState(activeTabId);
  const [visibleTabId, setVisibleTabId] = React.useState<string | null>(activeTabId);
  const [isExclusiveCrossfade, setIsExclusiveCrossfade] = React.useState(false);
  // 逻辑：用 deferred 值延后内容切换，避免主线程被重组件占满。
  const deferredActiveTabId = React.useDeferredValue(activeTabId);
  // 关闭 tab（Mod+W）时，旧 tab 会从 tabs 数组移除；这里缓存最后快照，保证还能拿到“上一帧布局状态”做动画判定。
  const tabSnapshotRef = React.useRef<Map<string, Tab>>(new Map());
  const crossfadeTimeoutsRef = React.useRef<{ phase1: number | null; phase2: number | null }>({
    phase1: null,
    phase2: null,
  });
  // 当我们决定使用“淡出/淡入”替代“宽度变化”时，下一次 splitPercent 更新要用 jump 而不是 spring set。
  const skipNextWidthAnimationRef = React.useRef(false);

  const activeTab = React.useMemo(
    () =>
      tabs.find((tab) => tab.id === deferredActiveTabId) ??
      tabSnapshotRef.current.get(deferredActiveTabId) ??
      null,
    [deferredActiveTabId, tabs],
  );
  const layoutTab = React.useMemo(
    () => tabs.find((tab) => tab.id === layoutTabId) ?? tabSnapshotRef.current.get(layoutTabId) ?? null,
    [layoutTabId, tabs],
  );
  const setTabLeftWidthPercent = useTabs((s) => s.setTabLeftWidthPercent);
  const setTabChatSession = useTabs((s) => s.setTabChatSession);
  const stackHiddenByTabId = useTabs((s) => s.stackHiddenByTabId);
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

    // 记录每个 tab 的最新快照（给 closeTab 场景提供“上一个 tab 的布局判定依据”）
    for (const tab of tabs) {
      tabSnapshotRef.current.set(tab.id, tab);
    }
  }, [tabs]);

  React.useEffect(() => {
    return () => {
      if (crossfadeTimeoutsRef.current.phase1)
        window.clearTimeout(crossfadeTimeoutsRef.current.phase1);
      if (crossfadeTimeoutsRef.current.phase2)
        window.clearTimeout(crossfadeTimeoutsRef.current.phase2);
    };
  }, []);

  React.useEffect(() => {
    // tabs 变更（例如 closeTab）时的兜底：
    // - layoutTabId 如果已不存在（且快照也没有），重置到 deferredActiveTabId
    // - visibleTabId 仅在非 crossfade 阶段做兜底，避免打断“先隐藏再显示”的动画流程
    const present = new Set(tabs.map((tab) => tab.id));

    const hasLayout = present.has(layoutTabId) || tabSnapshotRef.current.has(layoutTabId);
    if (!hasLayout) setLayoutTabId(deferredActiveTabId);

    if (!isExclusiveCrossfade && visibleTabId && !present.has(visibleTabId))
      setVisibleTabId(deferredActiveTabId);
  }, [tabs, layoutTabId, visibleTabId, deferredActiveTabId, isExclusiveCrossfade]);

  React.useEffect(() => {
    // 切换 tab 的动画策略：
    // - 普通切换：直接更新 layoutTabId + visibleTabId
    // - “左独占 ↔ 右独占”：内容淡出 ->（无宽度动画）切布局 -> 内容淡入
    if (deferredActiveTabId === layoutTabId && visibleTabId === deferredActiveTabId) return;

    if (crossfadeTimeoutsRef.current.phase1) {
      window.clearTimeout(crossfadeTimeoutsRef.current.phase1);
      crossfadeTimeoutsRef.current.phase1 = null;
    }
    if (crossfadeTimeoutsRef.current.phase2) {
      window.clearTimeout(crossfadeTimeoutsRef.current.phase2);
      crossfadeTimeoutsRef.current.phase2 = null;
    }

    const previousMode = getPanelMode(layoutTab, {
      stackHidden: Boolean(stackHiddenByTabId[layoutTabId]),
    });
    const nextMode = getPanelMode(activeTab, {
      stackHidden: Boolean(stackHiddenByTabId[deferredActiveTabId]),
    });
    const isLeftRightOnlySwitch =
      (previousMode === "left-only" && nextMode === "right-only") ||
      (previousMode === "right-only" && nextMode === "left-only");

    if (!reduceMotion && isLeftRightOnlySwitch) {
      setIsExclusiveCrossfade(true);
      // Phase 0：先把当前内容隐藏（TabLayer 会用 opacity 过渡）
      setVisibleTabId(null);
      // 关键：接下来布局会从 0% ↔ 100% 切换，禁止 spring 动画，直接 jump。
      skipNextWidthAnimationRef.current = true;
      crossfadeTimeoutsRef.current.phase1 = window.setTimeout(() => {
        // Phase 1：隐藏完成后切换布局 tab，同时显示新内容（淡入）
        setLayoutTabId(deferredActiveTabId);
        setVisibleTabId(deferredActiveTabId);
        crossfadeTimeoutsRef.current.phase1 = null;
      }, TAB_FADE_MS);
      crossfadeTimeoutsRef.current.phase2 = window.setTimeout(() => {
        // Phase 2：动画完成后解除“特殊状态”（恢复拖拽与正常布局过渡）
        setIsExclusiveCrossfade(false);
        crossfadeTimeoutsRef.current.phase2 = null;
      }, TAB_FADE_MS * 2);
      return;
    }

    setIsExclusiveCrossfade(false);
    setLayoutTabId(deferredActiveTabId);
    setVisibleTabId(deferredActiveTabId);
  }, [
    deferredActiveTabId,
    activeTab,
    layoutTabId,
    layoutTab,
    visibleTabId,
    reduceMotion,
    stackHiddenByTabId,
  ]);

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

  const hasLeftContent =
    Boolean(layoutTab?.base) ||
    (!Boolean(stackHiddenByTabId[layoutTabId]) && (layoutTab?.stack?.length ?? 0) > 0);
  const storedLeftWidthPercent = hasLeftContent ? layoutTab?.leftWidthPercent ?? 0 : 0;
  const isRightCollapsed = Boolean(layoutTab?.base) && Boolean(layoutTab?.rightChatCollapsed);

  const effectiveMinLeft = layoutTab?.minLeftWidth ?? LEFT_DOCK_MIN_PX;

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

      // storedLeftWidthPercent is relative to left panel's max width, not the full container.
      const storedLeftPx = (storedLeftWidthPercent / 100) * maxLeft;
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
    if (reduceMotion || skipNextWidthAnimationRef.current) {
      // 对“左独占 ↔ 右独占”的切换：不要看到宽度缩放，直接切到目标宽度。
      splitPercent.jump(targetSplitPercent);
      skipNextWidthAnimationRef.current = false;
      return;
    }
    splitPercent.set(targetSplitPercent);
  }, [targetSplitPercent, isDragging, splitPercent, reduceMotion]);

  const handleDragStart = (e: React.PointerEvent) => {
    if (targetDividerWidth === 0) return;
    // crossfade 阶段禁用拖拽，避免用户输入打断动画/状态机
    if (isExclusiveCrossfade) return;
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

    const container = containerRef.current;
    if (!container || !layoutTabId) return;

    const rect = container.getBoundingClientRect();
    const minLeft = effectiveMinLeft;
    const maxLeft = Math.max(minLeft, rect.width - RIGHT_CHAT_MIN_PX - targetDividerWidth);
    const currentLeftPx = (splitPercent.get() / 100) * rect.width;
    const nextPercentOfMax = (currentLeftPx / maxLeft) * 100;
    setTabLeftWidthPercent(layoutTabId, Math.round(nextPercentOfMax * 10) / 10);
  };

  const isDividerHidden = targetDividerWidth === 0;
  // visibleTabId 为 null 表示“先隐藏再显示”的过渡中间态（左右内容都应淡出）
  const panelsVisible = visibleTabId !== null;

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
        animate={{ opacity: panelsVisible && isLeftVisible ? 1 : 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.18, ease: "easeOut" }
        }
      >
        {/* 左面板 */}
        <div className="h-full w-full relative">
          {tabs.map((tab) => (
            <TabLayer key={`left:${tab.id}`} active={tab.id === visibleTabId}>
              <div 
                className="h-full w-full min-h-0 min-w-0"
                style={{
                  // 关键：隐藏左栏时不要再强制最小宽度，避免布局被撑开。
                  minWidth: isLeftVisible
                    ? (tab.minLeftWidth ?? LEFT_DOCK_MIN_PX)
                    : 0,
                }}
              >
                <MemoLeftDock tabId={tab.id} />
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
          pointerEvents: isDividerHidden || isExclusiveCrossfade ? "none" : "auto",
        }}
        onPointerDown={handleDragStart}
      >
        <div className={cn("h-6 w-1 rounded-full bg-muted/70", isDragging && "bg-primary/70")} />
      </motion.div>

      <motion.div
        className="flex-1 min-w-0 relative z-10 flex flex-col rounded-xl bg-background overflow-hidden"
        animate={{ opacity: panelsVisible && isRightVisible ? 1 : 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.18, ease: "easeOut" }
        }
      >
        {/* 右面板 */}
        <div className="h-full w-full relative">
          {tabs.map((tab) => (
            <TabLayer key={`right:${tab.id}`} active={tab.id === visibleTabId}>
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
