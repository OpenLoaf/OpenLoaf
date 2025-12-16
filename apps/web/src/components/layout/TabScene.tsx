"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
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

  const [isDragging, setIsDragging] = React.useState(false);
  const dragLeftPxRef = React.useRef(LEFT_DOCK_MIN_PX);
  const dragRafRef = React.useRef<number | null>(null);
  const [dragLeftPx, setDragLeftPx] = React.useState<number | null>(null);

  const hasLeftContent = Boolean(tab?.base) || (tab?.stack?.length ?? 0) > 0;
  const chatCollapsed = Boolean(tab?.base) && Boolean(tab?.rightChatCollapsed);

  const storedLeftWidthPx = hasLeftContent ? tab?.leftWidthPx ?? 0 : 0;
  const effectiveLeftWidthPx =
    isDragging && dragLeftPx != null ? dragLeftPx : storedLeftWidthPx;

  const computedLeftHidden = effectiveLeftWidthPx <= 0;
  const computedRightHidden = chatCollapsed;

  const widthTransition =
    reduceMotion || isDragging
      ? { duration: 0 }
      : { type: "spring" as const, stiffness: 260, damping: 45 };

  const leftGrow = React.useMemo(() => {
    if (computedLeftHidden) return 0;
    if (computedRightHidden) return 100;
    const w = containerWidthPx > 0 ? containerWidthPx : 1;
    const raw = (effectiveLeftWidthPx / w) * 100;
    return Math.max(0, Math.min(100, raw));
  }, [
    computedLeftHidden,
    computedRightHidden,
    containerWidthPx,
    effectiveLeftWidthPx,
  ]);

  const rightGrow = computedRightHidden
    ? 0
    : computedLeftHidden
      ? 100
      : Math.max(0, 100 - leftGrow);
  const dividerVisible = leftGrow > 0 && rightGrow > 0;

  React.useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const rect = container.getBoundingClientRect();
      setContainerWidthPx(Math.max(0, Math.round(rect.width)));
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
    if (!isDragging) return;

    const onMove = (event: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const raw = Math.round(event.clientX - rect.left);
      const maxLeft = Math.max(
        LEFT_DOCK_MIN_PX,
        Math.round(rect.width - RIGHT_CHAT_MIN_PX),
      );
      const next = Math.max(LEFT_DOCK_MIN_PX, Math.min(maxLeft, raw));
      dragLeftPxRef.current = next;

      if (dragRafRef.current != null) return;
      dragRafRef.current = window.requestAnimationFrame(() => {
        dragRafRef.current = null;
        setDragLeftPx(dragLeftPxRef.current);
      });
    };

    const onUp = () => {
      setIsDragging(false);
      if (dragRafRef.current != null) {
        window.cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      setDragLeftPx(null);
      setTabLeftWidthPx(tabId, dragLeftPxRef.current);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, setTabLeftWidthPx, tabId]);

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
              flexShrink: 1,
              minWidth: 0,
              willChange: "flex-grow",
            }}
            initial={false}
            animate={{ flexGrow: leftGrow }}
            transition={widthTransition}
          >
            <div className={cn("h-full w-full relative", computedLeftHidden ? "p-0" : "p-2")}>
              <LeftDock tabId={tabId} />
            </div>
          </motion.div>

          <motion.div
            className={cn(
              "relative z-0 flex shrink-0 items-center justify-center rounded-4xl bg-sidebar",
              dividerVisible
                ? "cursor-col-resize hover:bg-primary/20 active:bg-primary/30"
                : "pointer-events-none",
            )}
            initial={false}
            animate={{
              width: dividerVisible ? 10 : 0,
              opacity: dividerVisible ? 1 : 0,
            }}
            transition={widthTransition}
            onMouseDown={() => {
              if (!dividerVisible) return;
              dragLeftPxRef.current = storedLeftWidthPx || LEFT_DOCK_MIN_PX;
              setDragLeftPx(dragLeftPxRef.current);
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
              flexShrink: 1,
              minWidth: 0,
              willChange: "flex-grow",
            }}
            initial={false}
            animate={{ flexGrow: rightGrow }}
            transition={widthTransition}
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
