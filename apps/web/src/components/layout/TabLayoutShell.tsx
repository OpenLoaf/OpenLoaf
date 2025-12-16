"use client";

import * as React from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Chat } from "@/components/chat/Chat";
import { useTabs, LEFT_DOCK_MIN_PX } from "@/hooks/use_tabs";
import { LeftDock } from "./LeftDock";
import { TabActiveProvider } from "./TabActiveContext";
import type { Tab } from "@teatime-ai/api/types/tabs";

const RIGHT_CHAT_MIN_PX = 360;
const DIVIDER_GAP_PX = 10;

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
        "absolute inset-0 transition-opacity duration-150",
        active ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
      )}
      aria-hidden={!active}
    >
      <TabActiveProvider active={active}>{children}</TabActiveProvider>
    </div>
  );
}

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
  const reduceMotion = useReducedMotion();
  const [containerWidthPx, setContainerWidthPx] = React.useState(0);
  const containerWidthPxRef = React.useRef(0);

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

  const instantTransition = React.useMemo(() => ({ duration: 0 }), []);
  const springTransition = React.useMemo(
    () => ({ type: "spring" as const, stiffness: 260, damping: 45 }),
    [],
  );
  const dividerTransition = reduceMotion || isDragging ? instantTransition : springTransition;

  const [rightContentFrozenWidthPx, setRightContentFrozenWidthPx] = React.useState<
    number | null
  >(null);
  const wasRightHiddenRef = React.useRef(false);

  const [leftContentFrozenWidthPx, setLeftContentFrozenWidthPx] = React.useState<
    number | null
  >(null);
  const wasLeftHiddenRef = React.useRef(false);

  const [collapseGapCanShrink, setCollapseGapCanShrink] = React.useState(false);

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

  const dividerGapTargetPx = dividerVisible
    ? DIVIDER_GAP_PX
    : !computedLeftHidden && computedRightHidden
      ? collapseGapCanShrink
        ? 0
        : DIVIDER_GAP_PX
      : 0;

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

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    return () => ro.disconnect();
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

    growAnimationRef.current.left = animate(leftGrow, layoutLeftGrow, springTransition);
    growAnimationRef.current.right = animate(rightGrow, layoutRightGrow, springTransition);

    return () => {
      growAnimationRef.current.left?.stop();
      growAnimationRef.current.right?.stop();
      growAnimationRef.current.left = null;
      growAnimationRef.current.right = null;
    };
  }, [
    animate,
    isDragging,
    layoutLeftGrow,
    layoutRightGrow,
    leftGrow,
    reduceMotion,
    rightGrow,
    springTransition,
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

    const onPointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;
      if (event.pointerId !== session.pointerId) return;

      const raw = Math.round(event.clientX - session.containerLeft);
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
          willChange: "flex-grow",
        }}
        initial={false}
      >
        <div className={cn("h-full w-full relative", computedLeftHidden ? "p-0" : "p-2")}>
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
          willChange: "flex-grow",
        }}
        initial={false}
      >
        <div className={cn("h-full w-full relative", computedRightHidden ? "p-0" : "p-2")}>
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
                    <Chat
                      panelKey={`chat:${tab.id}`}
                      sessionId={tab.chatSessionId}
                      loadHistory={tab.chatLoadHistory}
                      tabId={tab.id}
                      {...(tab.chatParams ?? {})}
                      onSessionChange={(nextSessionId, options) => {
                        setTabChatSession(tab.id, nextSessionId, options);
                      }}
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
