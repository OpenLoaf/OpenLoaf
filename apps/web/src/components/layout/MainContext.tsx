import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTabs } from "@/hooks/use_tabs";
import PlantPage from "@/components/plant/Plant";
import { Chat } from "../chat/Chat";
import { cn } from "@/lib/utils";

export const MainContent: React.FC<{ className?: string }> = ({
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dividerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const {
    activeLeftPanel: leftPanel,
    activeRightPanel: rightPanel,
    activeLeftWidth,
    updateCurrentTabLeftWidth,
  } = useTabs();

  const hasLeftPanel = Boolean(leftPanel);
  const hasRightPanel = Boolean(rightPanel);
  const leftHidden = leftPanel?.hidden ?? false;
  const rightHidden = rightPanel?.hidden ?? false;
  const computedLeftHidden = leftHidden || !hasLeftPanel;
  const computedRightHidden = rightHidden || !hasRightPanel;

  const showLeft = hasLeftPanel && !leftHidden;
  const showRight = hasRightPanel && !rightHidden;
  const showDivider = showLeft && showRight;

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

  const ComponentMap: Record<string, React.ComponentType<any>> = {
    "ai-chat": Chat,
    "plant-page": PlantPage,
  };

  const renderPanel = (
    panel: { component: string; params: Record<string, any>; panelKey: string },
  ) => {
    const { component: componentName, params, panelKey } = panel;
    const Component = ComponentMap[componentName];
    if (!Component) {
      return (
        <div className="h-full flex items-center justify-center text-muted">
          Component not found: {componentName}
        </div>
      );
    }
    return <Component key={panelKey} panelKey={panelKey} {...params} />;
  };

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
              flex: "0 0 auto",
              minWidth: 0,
              contain: "layout paint",
              willChange: "width",
            }}
            initial={false}
            animate={{ width: `${leftWidthPercent}%` }}
            transition={widthTransition}
          >
            {leftPanel && (
              <div
                className={cn(
                  "h-full w-full",
                  !computedLeftHidden && "p-4 pr-2"
                )}
              >
                {!computedLeftHidden &&
                  renderPanel(leftPanel)}
              </div>
            )}
          </motion.div>

          {showDivider && (
            <div
              ref={dividerRef}
              className={cn(
                "bg-sidebar rounded-4xl cursor-col-resize hover:bg-primary/20 active:bg-primary/30 flex items-center justify-center w-2.5",
                isDragging && "bg-primary/10"
              )}
              onMouseDown={handleMouseDown}
            >
              <div
                className={cn(
                  "w-1 h-6 bg-muted/70 rounded-full",
                  isDragging && "bg-primary/70"
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
                flex: "0 0 auto",
                minWidth: 0,
                contain: "layout paint",
                willChange: "width",
              }}
              initial={false}
              animate={{ width: `${rightWidthPercent}%` }}
              transition={widthTransition}
            >
              <div
                className={cn("h-full w-full", !computedRightHidden && "p-4")}
              >
                {!computedRightHidden &&
                  renderPanel(rightPanel)}
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
