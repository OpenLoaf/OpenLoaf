"use client";

import * as React from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Chat } from "@/components/chat/Chat";
import { useTabs, LEFT_DOCK_MIN_PX } from "@/hooks/use_tabs";
import { LeftDock } from "./LeftDock";
import { TabActiveProvider } from "./TabActiveContext";

const RIGHT_CHAT_MIN_PX = 360;

export function TabScene({ tabId, active }: { tabId: string; active: boolean }) {
  const tab = useTabs((s) => s.tabs.find((t) => t.id === tabId));
  const setTabLeftWidthPx = useTabs((s) => s.setTabLeftWidthPx);
  const setTabChatSession = useTabs((s) => s.setTabChatSession);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [containerWidthPx, setContainerWidthPx] = React.useState(0);
  const containerWidthPxRef = React.useRef(0);

  const hasLeftContent = Boolean(tab?.base) || (tab?.stack?.length ?? 0) > 0;
  const chatCollapsed = Boolean(tab?.base) && Boolean(tab?.rightChatCollapsed);
  const storedLeftWidthPx = hasLeftContent ? tab?.leftWidthPx ?? 0 : 0;
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

  React.useEffect(() => {
    if (!active) return;
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
  }, [active]);

  React.useEffect(() => {
    if (!active) return;
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
    active,
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

      setIsDragging(false);
      dragSessionRef.current = null;

      if (cursorRestoreRef.current) {
        document.body.style.cursor = cursorRestoreRef.current.cursor;
        document.body.style.userSelect = cursorRestoreRef.current.userSelect;
        cursorRestoreRef.current = null;
      }

      if (commit) {
        setTabLeftWidthPx(tabId, dragLeftPxRef.current);
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
      const denominator = Math.max(1, w || fallbackWidthPx);
      const nextLeftGrow = Math.max(0, Math.min(100, (next / denominator) * 100));
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
  }, [
    active,
    fallbackWidthPx,
    isDragging,
    leftGrow,
    rightGrow,
    setTabLeftWidthPx,
    tabId,
  ]);

  React.useEffect(() => {
    if (active) return;
    if (!isDragging) return;
    cancelDrag();
  }, [active, cancelDrag, isDragging]);

  if (!tab) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 transition-opacity duration-150",
        active ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
      )}
      aria-hidden={!active}
    >
      <TabActiveProvider active={active}>
        <div ref={containerRef} className="flex h-full w-full overflow-hidden bg-sidebar p-2">
          <motion.div
            className={cn(
              "relative z-10 flex min-h-0 min-w-0 flex-col rounded-xl bg-background overflow-hidden",
              computedLeftHidden ? "pointer-events-none" : "pointer-events-auto",
            )}
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
              <LeftDock tabId={tabId} />
            </div>
          </motion.div>

          <motion.div
            className={cn(
              "relative z-20 flex shrink-0 items-center justify-center rounded-4xl bg-sidebar pointer-events-auto touch-none",
              dividerVisible
                ? "cursor-col-resize hover:bg-primary/20 active:bg-primary/30"
                : "pointer-events-none",
            )}
            initial={false}
            animate={{
              width: dividerVisible ? 10 : 0,
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
              };

              const initialLeftPx = storedLeftWidthPx || LEFT_DOCK_MIN_PX;
              dragLeftPxRef.current = initialLeftPx;

              const denominator = Math.max(1, rect.width || fallbackWidthPx);
              const nextLeftGrow = Math.max(0, Math.min(100, (initialLeftPx / denominator) * 100));
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
              <Chat
                panelKey={`chat:${tabId}`}
                sessionId={tab.chatSessionId}
                loadHistory={tab.chatLoadHistory}
                tabId={tabId}
                {...(tab.chatParams ?? {})}
                onSessionChange={(nextSessionId, options) => {
                  setTabChatSession(tabId, nextSessionId, options);
                }}
              />
            </div>
          </motion.div>
        </div>
      </TabActiveProvider>
    </div>
  );
}
