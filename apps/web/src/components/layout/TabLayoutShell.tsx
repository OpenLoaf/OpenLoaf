"use client";

import * as React from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/utils";
import { Chat } from "@/components/chat/Chat";
import { useTabs, LEFT_DOCK_MIN_PX } from "@/hooks/use_tabs";
import { LeftDock } from "./LeftDock";
import { TabActiveProvider } from "./TabActiveContext";
import type { Tab } from "@teatime-ai/api/types/tabs";

const RIGHT_CHAT_MIN_PX = 360;
const DIVIDER_GAP_PX = 10;
const INSTANT_TRANSITION = { duration: 0 } as const;
const SPRING_TRANSITION = { type: "spring" as const, stiffness: 260, damping: 45 };
const RESIZE_BLUR_PX = 6;
const RESIZE_CLEAR_DURATION_S = 0.45;

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

export function TabLayoutShell({
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
  const setTabLeftWidthPx = useTabs((s) => s.setTabLeftWidthPx);
  const setTabChatSession = useTabs((s) => s.setTabChatSession);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const leftPanelRef = React.useRef<HTMLDivElement>(null);
  const rightPanelRef = React.useRef<HTMLDivElement>(null);
  const chatSessionChangeHandlersRef = React.useRef<
    Map<string, (sessionId: string, options?: { loadHistory?: boolean }) => void>
  >(new Map());
  const reduceMotion = useReducedMotion();
  const [containerWidthPx, setContainerWidthPx] = React.useState(0);
  const containerWidthPxRef = React.useRef(0);
  const containerMeasureRafRef = React.useRef<number | null>(null);

  const hasLeftContent = Boolean(activeTab?.base) || (activeTab?.stack?.length ?? 0) > 0;
  const chatCollapsed = Boolean(activeTab?.base) && Boolean(activeTab?.rightChatCollapsed);
  const storedLeftWidthPx = hasLeftContent ? activeTab?.leftWidthPx ?? 0 : 0;
  const computedLeftHidden = storedLeftWidthPx <= 0;
  const computedRightHidden = chatCollapsed;
  const dividerVisible = !computedLeftHidden && !computedRightHidden;

  const [isDragging, setIsDragging] = React.useState(false);
  const dragLeftPxRef = React.useRef(LEFT_DOCK_MIN_PX);
  const dragSessionRef = React.useRef<{
    pointerId: number;
    containerLeft: number;
    containerWidth: number;
    captureTarget: HTMLDivElement | null;
    tabId: string;
  } | null>(null);
  const cursorRestoreRef = React.useRef<{ cursor: string; userSelect: string } | null>(
    null,
  );

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
    // 清理已关闭 tab 的 handler，避免 Map 长期增长
    const present = new Set(tabs.map((tab) => tab.id));
    const map = chatSessionChangeHandlersRef.current;
    for (const tabId of map.keys()) {
      if (!present.has(tabId)) map.delete(tabId);
    }
  }, [tabs]);

  const cancelDrag = React.useCallback(() => {
    const session = dragSessionRef.current;
    if (!session) return;
    if (session.captureTarget) {
      try {
        session.captureTarget.releasePointerCapture(session.pointerId);
      } catch {
        // ignore
      }
    }

    dragSessionRef.current = null;
    setIsDragging(false);

    if (cursorRestoreRef.current) {
      document.body.style.cursor = cursorRestoreRef.current.cursor;
      document.body.style.userSelect = cursorRestoreRef.current.userSelect;
      cursorRestoreRef.current = null;
    }
  }, []);

  const fallbackWidthPx =
    storedLeftWidthPx > 0 ? storedLeftWidthPx + RIGHT_CHAT_MIN_PX : RIGHT_CHAT_MIN_PX;
  const denominator = containerWidthPx > 0 ? containerWidthPx : fallbackWidthPx;
  const layoutLeftGrow = computedRightHidden
    ? 100
    : computedLeftHidden
      ? 0
      : Math.max(0, Math.min(100, (storedLeftWidthPx / Math.max(1, denominator)) * 100));
  const layoutRightGrow = computedRightHidden
    ? 0
    : computedLeftHidden
      ? 100
      : Math.max(0, 100 - layoutLeftGrow);

  const leftGrow = useMotionValue(layoutLeftGrow);
  const rightGrow = useMotionValue(layoutRightGrow);
  const growAnimationRef = React.useRef<{
    left: ReturnType<typeof animate> | null;
    right: ReturnType<typeof animate> | null;
  }>({ left: null, right: null });

  const leftBlur = useMotionValue(0);
  const rightBlur = useMotionValue(0);
  const leftFilter = useTransform(leftBlur, (value) => `blur(${value}px)`);
  const rightFilter = useTransform(rightBlur, (value) => `blur(${value}px)`);
  const blurAnimationRef = React.useRef<{
    left: ReturnType<typeof animate> | null;
    right: ReturnType<typeof animate> | null;
  }>({ left: null, right: null });
  const prevComputedLeftHiddenRef = React.useRef(computedLeftHidden);
  const prevComputedRightHiddenRef = React.useRef(computedRightHidden);

  const dividerTransition =
    reduceMotion || isDragging ? INSTANT_TRANSITION : SPRING_TRANSITION;

  const [rightContentFrozenWidthPx, setRightContentFrozenWidthPx] = React.useState<
    number | null
  >(null);
  const wasRightHiddenRef = React.useRef(false);

  const [leftContentFrozenWidthPx, setLeftContentFrozenWidthPx] = React.useState<
    number | null
  >(null);
  const wasLeftHiddenRef = React.useRef(false);

  const [collapseGapCanShrink, setCollapseGapCanShrink] = React.useState(false);
  const [collapseGapCanShrinkLeft, setCollapseGapCanShrinkLeft] = React.useState(false);

  React.useEffect(() => {
    if (!computedRightHidden || computedLeftHidden) {
      setCollapseGapCanShrink(false);
      return;
    }

    setCollapseGapCanShrink(false);
    const unsubscribe = rightGrow.on("change", (value) => {
      if (value <= 0.01) {
        setCollapseGapCanShrink(true);
        unsubscribe();
      }
    });
    return () => unsubscribe();
  }, [computedLeftHidden, computedRightHidden, rightGrow]);

  React.useEffect(() => {
    if (!computedLeftHidden || computedRightHidden) {
      setCollapseGapCanShrinkLeft(false);
      return;
    }

    setCollapseGapCanShrinkLeft(false);
    const unsubscribe = leftGrow.on("change", (value) => {
      if (value <= 0.01) {
        setCollapseGapCanShrinkLeft(true);
        unsubscribe();
      }
    });
    return () => unsubscribe();
  }, [computedLeftHidden, computedRightHidden, leftGrow]);

  const dividerGapTargetPx = dividerVisible
    ? DIVIDER_GAP_PX
    : computedLeftHidden && !computedRightHidden
      ? collapseGapCanShrinkLeft
        ? 0
        : DIVIDER_GAP_PX
      : !computedLeftHidden && computedRightHidden
      ? collapseGapCanShrink
        ? 0
        : DIVIDER_GAP_PX
      : 0;

  const leftPanelPaddingClass = computedLeftHidden
    ? collapseGapCanShrinkLeft
      ? "p-0"
      : "p-2"
    : "p-2";
  const rightPanelPaddingClass = computedRightHidden
    ? collapseGapCanShrink
      ? "p-0"
      : "p-2"
    : "p-2";

  React.useEffect(() => {
    const wasRightHidden = wasRightHiddenRef.current;
    wasRightHiddenRef.current = computedRightHidden;

    if (!wasRightHidden && computedRightHidden) {
      const measured = rightPanelRef.current?.getBoundingClientRect().width ?? 0;
      setRightContentFrozenWidthPx(measured > 0 ? Math.round(measured) : null);

      const unsubscribe = rightGrow.on("change", (value) => {
        if (value <= 0.5) {
          setRightContentFrozenWidthPx(null);
          unsubscribe();
        }
      });
      return () => unsubscribe();
    }

    if (!computedRightHidden) {
      setRightContentFrozenWidthPx(null);
    }
  }, [computedRightHidden, rightGrow]);

  React.useEffect(() => {
    const wasLeftHidden = wasLeftHiddenRef.current;
    wasLeftHiddenRef.current = computedLeftHidden;

    if (!wasLeftHidden && computedLeftHidden) {
      const measured = leftPanelRef.current?.getBoundingClientRect().width ?? 0;
      setLeftContentFrozenWidthPx(measured > 0 ? Math.round(measured) : null);

      const unsubscribe = leftGrow.on("change", (value) => {
        if (value <= 0.5) {
          setLeftContentFrozenWidthPx(null);
          unsubscribe();
        }
      });
      return () => unsubscribe();
    }

    if (!computedLeftHidden) {
      setLeftContentFrozenWidthPx(null);
    }
  }, [computedLeftHidden, leftGrow]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const rect = container.getBoundingClientRect();
      const next = Math.max(0, Math.round(rect.width));
      containerWidthPxRef.current = next;
      setContainerWidthPx(next);
    };

    const scheduleMeasure = () => {
      if (containerMeasureRafRef.current != null) {
        cancelAnimationFrame(containerMeasureRafRef.current);
      }
      containerMeasureRafRef.current = requestAnimationFrame(() => {
        containerMeasureRafRef.current = null;
        measure();
      });
    };

    scheduleMeasure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleMeasure);
      return () => {
        window.removeEventListener("resize", scheduleMeasure);
        if (containerMeasureRafRef.current != null) {
          cancelAnimationFrame(containerMeasureRafRef.current);
          containerMeasureRafRef.current = null;
        }
      };
    }

    const ro = new ResizeObserver(() => scheduleMeasure());
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (containerMeasureRafRef.current != null) {
        cancelAnimationFrame(containerMeasureRafRef.current);
        containerMeasureRafRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (isDragging) return;

    growAnimationRef.current.left?.stop();
    growAnimationRef.current.right?.stop();
    growAnimationRef.current.left = null;
    growAnimationRef.current.right = null;

    if (reduceMotion) {
      leftGrow.set(layoutLeftGrow);
      rightGrow.set(layoutRightGrow);
      return;
    }

    growAnimationRef.current.left = animate(leftGrow, layoutLeftGrow, SPRING_TRANSITION);
    growAnimationRef.current.right = animate(rightGrow, layoutRightGrow, SPRING_TRANSITION);

    return () => {
      growAnimationRef.current.left?.stop();
      growAnimationRef.current.right?.stop();
      growAnimationRef.current.left = null;
      growAnimationRef.current.right = null;
    };
  }, [
    isDragging,
    layoutLeftGrow,
    layoutRightGrow,
    leftGrow,
    reduceMotion,
    rightGrow,
  ]);

  React.useEffect(() => {
    if (reduceMotion || isDragging) {
      blurAnimationRef.current.left?.stop();
      blurAnimationRef.current.right?.stop();
      blurAnimationRef.current.left = null;
      blurAnimationRef.current.right = null;
      leftBlur.set(0);
      rightBlur.set(0);
      prevComputedLeftHiddenRef.current = computedLeftHidden;
      prevComputedRightHiddenRef.current = computedRightHidden;
      return;
    }

    const prevLeftHidden = prevComputedLeftHiddenRef.current;
    const prevRightHidden = prevComputedRightHiddenRef.current;
    prevComputedLeftHiddenRef.current = computedLeftHidden;
    prevComputedRightHiddenRef.current = computedRightHidden;

    const leftBecameHidden = !prevLeftHidden && computedLeftHidden;
    const rightBecameHidden = !prevRightHidden && computedRightHidden;
    const leftBecameVisible = prevLeftHidden && !computedLeftHidden;
    const rightBecameVisible = prevRightHidden && !computedRightHidden;

    const leftDelta = Math.abs(layoutLeftGrow - leftGrow.get());
    const rightDelta = Math.abs(layoutRightGrow - rightGrow.get());

    const shouldBlurLeft = leftDelta >= 0.5 || leftBecameHidden || leftBecameVisible;
    const shouldBlurRight = rightDelta >= 0.5 || rightBecameHidden || rightBecameVisible;
    if (!shouldBlurLeft && !shouldBlurRight) return;

    const startAndClear = (which: "left" | "right") => {
      const motionValue = which === "left" ? leftBlur : rightBlur;
      const existing =
        which === "left" ? blurAnimationRef.current.left : blurAnimationRef.current.right;

      existing?.stop();
      motionValue.set(RESIZE_BLUR_PX);
      const animation = animate(motionValue, 0, {
        duration: RESIZE_CLEAR_DURATION_S,
        ease: "easeOut",
      });

      if (which === "left") blurAnimationRef.current.left = animation;
      else blurAnimationRef.current.right = animation;
    };

    const startAndHold = (which: "left" | "right") => {
      const motionValue = which === "left" ? leftBlur : rightBlur;
      const existing =
        which === "left" ? blurAnimationRef.current.left : blurAnimationRef.current.right;

      existing?.stop();
      motionValue.set(RESIZE_BLUR_PX);
      if (which === "left") blurAnimationRef.current.left = null;
      else blurAnimationRef.current.right = null;
    };

    if (leftBecameHidden) startAndHold("left");
    else if (shouldBlurLeft) startAndClear("left");

    if (rightBecameHidden) startAndHold("right");
    else if (shouldBlurRight) startAndClear("right");

    return () => {
      blurAnimationRef.current.left?.stop();
      blurAnimationRef.current.right?.stop();
      blurAnimationRef.current.left = null;
      blurAnimationRef.current.right = null;
    };
  }, [
    computedLeftHidden,
    computedRightHidden,
    isDragging,
    layoutLeftGrow,
    layoutRightGrow,
    leftBlur,
    leftGrow,
    reduceMotion,
    rightBlur,
    rightGrow,
  ]);

  React.useEffect(() => {
    if (!isDragging) return;

    const endDrag = (commit: boolean) => {
      if (!dragSessionRef.current) return;
      if (dragSessionRef.current.captureTarget) {
        try {
          dragSessionRef.current.captureTarget.releasePointerCapture(
            dragSessionRef.current.pointerId,
          );
        } catch {
          // ignore
        }
      }

      const sessionTabId = dragSessionRef.current.tabId;
      setIsDragging(false);
      dragSessionRef.current = null;

      if (cursorRestoreRef.current) {
        document.body.style.cursor = cursorRestoreRef.current.cursor;
        document.body.style.userSelect = cursorRestoreRef.current.userSelect;
        cursorRestoreRef.current = null;
      }

      if (commit) {
        setTabLeftWidthPx(sessionTabId, dragLeftPxRef.current);
      }
    };

    let moveRaf: number | null = null;
    let pendingClientX: number | null = null;
    const applyClientX = (clientX: number) => {
      const session = dragSessionRef.current;
      if (!session) return;
      const raw = Math.round(clientX - session.containerLeft);
      const maxLeft = Math.max(
        LEFT_DOCK_MIN_PX,
        Math.round(session.containerWidth - RIGHT_CHAT_MIN_PX),
      );
      const next = Math.max(LEFT_DOCK_MIN_PX, Math.min(maxLeft, raw));
      dragLeftPxRef.current = next;

      const w = session.containerWidth > 0 ? session.containerWidth : containerWidthPxRef.current;
      const d = Math.max(1, w || fallbackWidthPx);
      const nextLeftGrow = Math.max(0, Math.min(100, (next / d) * 100));
      leftGrow.set(nextLeftGrow);
      rightGrow.set(Math.max(0, 100 - nextLeftGrow));
    };

    const onPointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;
      if (event.pointerId !== session.pointerId) return;
      pendingClientX = event.clientX;
      if (moveRaf != null) return;
      moveRaf = requestAnimationFrame(() => {
        moveRaf = null;
        if (pendingClientX == null) return;
        applyClientX(pendingClientX);
      });
    };

    const onPointerUpOrCancel = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;
      if (event.pointerId !== session.pointerId) return;
      endDrag(true);
    };

    const onWindowBlur = () => endDrag(true);

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUpOrCancel);
    window.addEventListener("pointercancel", onPointerUpOrCancel);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      if (moveRaf != null) cancelAnimationFrame(moveRaf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUpOrCancel);
      window.removeEventListener("pointercancel", onPointerUpOrCancel);
      window.removeEventListener("blur", onWindowBlur);
      endDrag(false);
    };
  }, [fallbackWidthPx, isDragging, leftGrow, rightGrow, setTabLeftWidthPx]);

  React.useEffect(() => {
    const session = dragSessionRef.current;
    if (!isDragging || !session) return;
    if (session.tabId !== activeTabId) cancelDrag();
  }, [activeTabId, cancelDrag, isDragging]);

  if (!activeTab) return null;

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden bg-sidebar pr-2">
      <motion.div
        className={cn(
          "relative z-10 flex min-h-0 min-w-0 flex-col rounded-xl bg-background overflow-hidden",
          computedLeftHidden ? "pointer-events-none" : "pointer-events-auto",
        )}
        ref={leftPanelRef}
        style={{
          flexBasis: 0,
          flexGrow: leftGrow,
          flexShrink: 1,
          minWidth: 0,
          filter: leftFilter,
          willChange: "flex-grow, filter",
        }}
        initial={false}
      >
        <div className={cn("h-full w-full relative", leftPanelPaddingClass)}>
          <div
            className="relative h-full w-full min-h-0 min-w-0"
            style={{
              width: leftContentFrozenWidthPx ? `${leftContentFrozenWidthPx}px` : "100%",
            }}
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <TabLayer key={`left:${tab.id}`} active={isActive}>
                  <div className="h-full w-full min-h-0 min-w-0">
                    <LeftDock tabId={tab.id} />
                  </div>
                </TabLayer>
              );
            })}
          </div>
        </div>
      </motion.div>

      <motion.div
        className={cn(
          "relative z-20 flex shrink-0 items-center justify-center rounded-4xl bg-sidebar pointer-events-auto touch-none",
          dividerVisible ? "cursor-col-resize hover:bg-primary/20 active:bg-primary/30" : "",
          dividerVisible ? "" : "pointer-events-none",
        )}
        initial={false}
        animate={{
          width: dividerGapTargetPx,
          opacity: dividerVisible ? 1 : 0,
        }}
        transition={dividerTransition}
        onPointerDown={(event) => {
          if (!dividerVisible) return;
          if (event.button !== 0) return;
          const container = containerRef.current;
          if (!container) return;

          const rect = container.getBoundingClientRect();
          dragSessionRef.current = {
            pointerId: event.pointerId,
            containerLeft: rect.left,
            containerWidth: rect.width,
            captureTarget: event.currentTarget,
            tabId: activeTabId,
          };

          const initialLeftPx = storedLeftWidthPx || LEFT_DOCK_MIN_PX;
          dragLeftPxRef.current = initialLeftPx;

          const d = Math.max(1, rect.width || fallbackWidthPx);
          const nextLeftGrow = Math.max(0, Math.min(100, (initialLeftPx / d) * 100));
          growAnimationRef.current.left?.stop();
          growAnimationRef.current.right?.stop();
          growAnimationRef.current.left = null;
          growAnimationRef.current.right = null;
          leftGrow.set(nextLeftGrow);
          rightGrow.set(Math.max(0, 100 - nextLeftGrow));

          cursorRestoreRef.current = {
            cursor: document.body.style.cursor,
            userSelect: document.body.style.userSelect,
          };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";

          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setIsDragging(true);
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
      >
        <div
          className={cn(
            "h-6 w-1 rounded-full bg-muted/70",
            isDragging && dividerVisible && "bg-primary/70",
          )}
        />
      </motion.div>

      <motion.div
        className={cn(
          "relative z-10 flex min-h-0 min-w-0 flex-col rounded-xl bg-background overflow-hidden",
          computedRightHidden ? "pointer-events-none" : "pointer-events-auto",
        )}
        ref={rightPanelRef}
        style={{
          flexBasis: 0,
          flexGrow: rightGrow,
          flexShrink: 1,
          minWidth: 0,
          filter: rightFilter,
          willChange: "flex-grow, filter",
        }}
        initial={false}
      >
        <div className={cn("h-full w-full relative", rightPanelPaddingClass)}>
          <div
            className="relative h-full"
            style={{
              width: rightContentFrozenWidthPx ? `${rightContentFrozenWidthPx}px` : "100%",
            }}
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <TabLayer key={`right:${tab.id}`} active={isActive}>
                  <div className="h-full w-full min-h-0 min-w-0">
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
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
