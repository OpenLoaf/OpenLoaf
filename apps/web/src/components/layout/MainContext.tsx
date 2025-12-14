import React, { useEffect, useRef, useState, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTabs } from "@/hooks/use_tabs";
import {
  makePanelSnapshotKey,
  usePanelSnapshots,
} from "@/hooks/use_panel_snapshots";
import { cn } from "@/lib/utils";
import { PanelRenderer } from "./PanelRenderer";

export const MainContent: React.FC<{ className?: string }> = ({
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isClosingLeft, setIsClosingLeft] = useState(false);
  const [isClosingRight, setIsClosingRight] = useState(false);
  const dividerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevComputedLeftHiddenRef = useRef(false);
  const prevComputedRightHiddenRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const {
    activeTabId,
    activeLeftPanel: leftPanel,
    activeRightPanel: rightPanel,
    activeLeftWidth,
    updateCurrentTabLeftWidth,
  } = useTabs();

  const leftSnapshotKey = useMemo(
    () => (activeTabId ? makePanelSnapshotKey(activeTabId, "left") : null),
    [activeTabId]
  );
  const rightSnapshotKey = useMemo(
    () => (activeTabId ? makePanelSnapshotKey(activeTabId, "right") : null),
    [activeTabId]
  );

  const leftSnapshotState = usePanelSnapshots((state) =>
    leftSnapshotKey ? state.byKey[leftSnapshotKey] : undefined
  );
  const rightSnapshotState = usePanelSnapshots((state) =>
    rightSnapshotKey ? state.byKey[rightSnapshotKey] : undefined
  );
  const moveSnapshotUp = usePanelSnapshots((state) => state.moveSnapshotUp);
  const moveSnapshotDown = usePanelSnapshots((state) => state.moveSnapshotDown);
  const toggleSnapshotHidden = usePanelSnapshots(
    (state) => state.toggleSnapshotHidden
  );
  const setAllSnapshotsHidden = usePanelSnapshots(
    (state) => state.setAllSnapshotsHidden
  );
  const closeSnapshot = usePanelSnapshots((state) => state.closeSnapshot);
  const setHiddenAll = usePanelSnapshots((state) => state.setHiddenAll);

  const leftTopSnapshot =
    leftSnapshotState &&
    leftSnapshotState.layers.length > 0 &&
    !leftSnapshotState.hiddenAll
      ? [...leftSnapshotState.layers].reverse().find((l) => !l.hidden)
      : undefined;

  const rightTopSnapshot =
    rightSnapshotState &&
    rightSnapshotState.layers.length > 0 &&
    !rightSnapshotState.hiddenAll
      ? [...rightSnapshotState.layers].reverse().find((l) => !l.hidden)
      : undefined;

  const hasLeftPanel = Boolean(leftPanel);
  const hasRightPanel = Boolean(rightPanel);
  const leftHidden = leftPanel?.hidden ?? false;
  const rightHidden = rightPanel?.hidden ?? false;
  const computedLeftHidden = leftHidden || !hasLeftPanel;
  const computedRightHidden = rightHidden || !hasRightPanel;

  const showLeft = hasLeftPanel && !leftHidden;
  const showRight = hasRightPanel && !rightHidden;
  const showDivider =
    (hasLeftPanel || isClosingLeft) &&
    (hasRightPanel || isClosingRight) &&
    !(
      computedLeftHidden &&
      computedRightHidden &&
      !isClosingLeft &&
      !isClosingRight
    );
  const dividerInteractive = showLeft && showRight;

  const leftWidthPercent = computedLeftHidden
    ? 0
    : showRight
    ? activeLeftWidth
    : 100;
  const rightWidthPercent = computedRightHidden
    ? 0
    : showLeft
    ? 100 - leftWidthPercent
    : 100;

  const widthTransition =
    reduceMotion || isDragging
      ? { duration: 0 }
      : { type: "spring" as const, stiffness: 260, damping: 45 };

  const renderedLeftPanel = useMemo(() => {
    if (!leftPanel || computedLeftHidden) return null;
    return (
      <PanelRenderer
        basePanel={leftPanel}
        snapshotKey={leftSnapshotKey}
        snapshotLayers={leftSnapshotState?.layers}
        snapshotHiddenAll={leftSnapshotState?.hiddenAll}
        onMoveUp={moveSnapshotUp}
        onMoveDown={moveSnapshotDown}
        onToggleHidden={toggleSnapshotHidden}
        onClose={closeSnapshot}
        onSetHiddenAll={setHiddenAll}
        onSetAllSnapshotsHidden={setAllSnapshotsHidden}
      />
    );
  }, [
    leftPanel,
    leftSnapshotKey,
    computedLeftHidden,
    leftSnapshotState?.layers,
    leftSnapshotState?.hiddenAll,
    moveSnapshotUp,
    moveSnapshotDown,
    toggleSnapshotHidden,
    closeSnapshot,
    setHiddenAll,
    setAllSnapshotsHidden,
  ]);

  const renderedRightPanel = useMemo(() => {
    if (!rightPanel || computedRightHidden) return null;
    return (
      <PanelRenderer
        basePanel={rightPanel}
        snapshotKey={rightSnapshotKey}
        snapshotLayers={rightSnapshotState?.layers}
        snapshotHiddenAll={rightSnapshotState?.hiddenAll}
        onMoveUp={moveSnapshotUp}
        onMoveDown={moveSnapshotDown}
        onToggleHidden={toggleSnapshotHidden}
        onClose={closeSnapshot}
        onSetHiddenAll={setHiddenAll}
        onSetAllSnapshotsHidden={setAllSnapshotsHidden}
      />
    );
  }, [
    rightPanel,
    rightSnapshotKey,
    computedRightHidden,
    rightSnapshotState?.layers,
    rightSnapshotState?.hiddenAll,
    moveSnapshotUp,
    moveSnapshotDown,
    toggleSnapshotHidden,
    closeSnapshot,
    setHiddenAll,
    setAllSnapshotsHidden,
  ]);

  useEffect(() => {
    if (!activeTabId || !leftSnapshotKey || !leftSnapshotState) return;

    let desiredWidth: number | undefined;

    if (leftSnapshotState.layers.length === 0) {
      desiredWidth = leftSnapshotState.baseLeftWidth;
    } else if (leftSnapshotState.hiddenAll) {
      desiredWidth = leftSnapshotState.baseLeftWidth;
    } else {
      desiredWidth = leftTopSnapshot?.leftWidth;
    }

    if (typeof desiredWidth === "number" && desiredWidth !== activeLeftWidth) {
      updateCurrentTabLeftWidth(desiredWidth);
    }
  }, [
    activeTabId,
    activeLeftWidth,
    leftSnapshotKey,
    leftSnapshotState,
    leftTopSnapshot?.id,
    leftTopSnapshot?.leftWidth,
    updateCurrentTabLeftWidth,
  ]);

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!isDragging || !dividerRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const newWidth =
      ((event.clientX - containerRect.left) / containerRect.width) * 100;
    const clampedWidth = Math.max(30, Math.min(70, newWidth));
    updateCurrentTabLeftWidth(clampedWidth);

    if (activeTabId) {
      const key = makePanelSnapshotKey(activeTabId, "left");
      const store = usePanelSnapshots.getState();
      const snapshot = store.byKey[key];
      if (snapshot && snapshot.layers.length > 0 && !snapshot.hiddenAll) {
        store.setTopLeftWidth(key, clampedWidth);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (!isDragging) return;

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const prevComputedLeftHidden = prevComputedLeftHiddenRef.current;
    const prevComputedRightHidden = prevComputedRightHiddenRef.current;
    prevComputedLeftHiddenRef.current = computedLeftHidden;
    prevComputedRightHiddenRef.current = computedRightHidden;

    if (reduceMotion) {
      setIsClosingLeft(false);
      setIsClosingRight(false);
      return;
    }

    if (!prevComputedLeftHidden && computedLeftHidden) {
      setIsClosingLeft(true);
    }
    if (!prevComputedRightHidden && computedRightHidden) {
      setIsClosingRight(true);
    }
  }, [computedLeftHidden, computedRightHidden, reduceMotion]);

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full w-full overflow-hidden bg-sidebar", className)}
    >
      {hasLeftPanel || hasRightPanel ? (
        <>
          <motion.div
            className={cn(
              "flex flex-col bg-background rounded-xl max-h-screen overflow-hidden min-w-0",
              computedLeftHidden
                ? "pointer-events-none"
                : "pointer-events-auto",
              !hasLeftPanel && "p-0"
            )}
            style={{
              flexBasis: 0,
              flexShrink: 1,
              minWidth: 0,
              willChange: "flex-grow",
            }}
            initial={false}
            animate={{ flexGrow: leftWidthPercent }}
            transition={widthTransition}
            onAnimationComplete={() => {
              if (computedLeftHidden) setIsClosingLeft(false);
            }}
          >
            {leftPanel && (
              <div
                className={cn(
                  "h-full w-full relative",
                  !computedLeftHidden && "p-4 pr-2"
                )}
              >
                {renderedLeftPanel}
              </div>
            )}
          </motion.div>

          {showDivider && (
            <div
              ref={dividerRef}
              className={cn(
                "bg-sidebar rounded-4xl flex items-center justify-center w-2.5 shrink-0",
                dividerInteractive
                  ? "cursor-col-resize hover:bg-primary/20 active:bg-primary/30"
                  : "pointer-events-none opacity-60",
                isDragging && dividerInteractive && "bg-primary/10"
              )}
              onMouseDown={dividerInteractive ? handleMouseDown : undefined}
            >
              <div
                className={cn(
                  "w-1 h-6 bg-muted/70 rounded-full",
                  isDragging && dividerInteractive && "bg-primary/70"
                )}
              />
            </div>
          )}

          {rightPanel && (
            <motion.div
              className={cn(
                "bg-background rounded-xl overflow-hidden min-w-0",
                computedRightHidden
                  ? "pointer-events-none"
                  : "pointer-events-auto"
              )}
              style={{
                flexBasis: 0,
                flexShrink: 1,
                minWidth: 0,
                willChange: "flex-grow",
              }}
              initial={false}
              animate={{ flexGrow: rightWidthPercent }}
              transition={widthTransition}
              onAnimationComplete={() => {
                if (computedRightHidden) setIsClosingRight(false);
              }}
            >
              <div
                className={cn(
                  "h-full w-full relative",
                  !computedRightHidden && "p-4"
                )}
              >
                {renderedRightPanel}
              </div>
            </motion.div>
          )}

          {leftHidden && rightHidden && (
            <div className="w-full h-full flex items-center justify-center text-muted">
              All panels are hidden
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted">
          No active tab
        </div>
      )}
    </div>
  );
};
