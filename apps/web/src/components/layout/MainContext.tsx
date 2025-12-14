/**
 * 应用主布局组件，负责管理左右面板的显示、宽度调整和快照功能
 */
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
  // 拖拽状态管理
  const [isDragging, setIsDragging] = useState(false);
  // 面板关闭动画状态
  const [isClosingLeft, setIsClosingLeft] = useState(false);
  const [isClosingRight, setIsClosingRight] = useState(false);
  // 拖拽分隔线引用
  const dividerRef = useRef<HTMLDivElement>(null);
  // 容器引用，用于计算宽度比例
  const containerRef = useRef<HTMLDivElement>(null);
  // 记录上一次面板隐藏状态，用于判断是否需要播放关闭动画
  const prevComputedLeftHiddenRef = useRef(false);
  const prevComputedRightHiddenRef = useRef(false);
  // 检查用户是否偏好减少动画
  const reduceMotion = useReducedMotion();
  
  // 从useTabs钩子获取当前激活的标签页和面板信息
  const {
    activeTabId,
    activeLeftPanel: leftPanel,
    activeRightPanel: rightPanel,
    activeLeftWidth,
    updateCurrentTabLeftWidth,
  } = useTabs();

  // 生成左侧面板快照的唯一key
  const leftSnapshotKey = useMemo(
    () => (activeTabId ? makePanelSnapshotKey(activeTabId, "left") : null),
    [activeTabId]
  );
  // 生成右侧面板快照的唯一key
  const rightSnapshotKey = useMemo(
    () => (activeTabId ? makePanelSnapshotKey(activeTabId, "right") : null),
    [activeTabId]
  );

  // 获取左侧面板快照状态
  const leftSnapshotState = usePanelSnapshots((state) =>
    leftSnapshotKey ? state.byKey[leftSnapshotKey] : undefined
  );
  // 获取右侧面板快照状态
  const rightSnapshotState = usePanelSnapshots((state) =>
    rightSnapshotKey ? state.byKey[rightSnapshotKey] : undefined
  );
  // 面板快照操作函数
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

  // 获取左侧面板最上层可见快照
  const leftTopSnapshot =
    leftSnapshotState &&
    leftSnapshotState.layers.length > 0 &&
    !leftSnapshotState.hiddenAll
      ? [...leftSnapshotState.layers].reverse().find((l) => !l.hidden)
      : undefined;

  // 获取右侧面板最上层可见快照
  const rightTopSnapshot =
    rightSnapshotState &&
    rightSnapshotState.layers.length > 0 &&
    !rightSnapshotState.hiddenAll
      ? [...rightSnapshotState.layers].reverse().find((l) => !l.hidden)
      : undefined;

  // 计算面板显示状态
  const hasLeftPanel = Boolean(leftPanel);
  const hasRightPanel = Boolean(rightPanel);
  const leftHidden = leftPanel?.hidden ?? false;
  const rightHidden = rightPanel?.hidden ?? false;
  const computedLeftHidden = leftHidden || !hasLeftPanel;
  const computedRightHidden = rightHidden || !hasRightPanel;

  // 计算是否显示面板和分隔线
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

  // 计算左右面板的宽度比例
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

  // 定义宽度变化的过渡动画
  const widthTransition =
    reduceMotion || isDragging
      ? { duration: 0 } // 减少动画或拖拽时，无过渡效果
      : { type: "spring" as const, stiffness: 260, damping: 45 };

  // 渲染左侧面板，包含快照功能
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

  // 渲染右侧面板，包含快照功能
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

  // 根据快照状态更新左侧面板宽度
  useEffect(() => {
    if (!activeTabId || !leftSnapshotKey || !leftSnapshotState) return;

    let desiredWidth: number | undefined;

    // 根据不同情况计算期望的宽度
    if (leftSnapshotState.layers.length === 0) {
      desiredWidth = leftSnapshotState.baseLeftWidth;
    } else if (leftSnapshotState.hiddenAll) {
      desiredWidth = leftSnapshotState.baseLeftWidth;
    } else {
      desiredWidth = leftTopSnapshot?.leftWidth;
    }

    // 如果宽度不同，更新当前标签页的左侧宽度
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

  // 开始拖拽分隔线
  const handleMouseDown = () => {
    setIsDragging(true);
  };

  // 拖拽分隔线时更新宽度
  const handleMouseMove = (event: MouseEvent) => {
    if (!isDragging || !dividerRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    // 计算新的宽度比例
    const containerRect = container.getBoundingClientRect();
    const newWidth = ((event.clientX - containerRect.left) / containerRect.width) * 100;
    // 限制宽度在30%-70%之间
    const clampedWidth = Math.max(30, Math.min(70, newWidth));
    // 更新当前标签页的左侧宽度
    updateCurrentTabLeftWidth(clampedWidth);

    // 如果有激活的标签页，同时更新快照的宽度
    if (activeTabId) {
      const key = makePanelSnapshotKey(activeTabId, "left");
      const store = usePanelSnapshots.getState();
      const snapshot = store.byKey[key];
      if (snapshot && snapshot.layers.length > 0 && !snapshot.hiddenAll) {
        store.setTopLeftWidth(key, clampedWidth);
      }
    }
  };

  // 结束拖拽分隔线
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 拖拽事件监听
  useEffect(() => {
    if (!isDragging) return;

    // 添加全局鼠标移动和释放事件监听
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // 清理事件监听
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // 监听面板隐藏状态变化，控制关闭动画
  useEffect(() => {
    const prevComputedLeftHidden = prevComputedLeftHiddenRef.current;
    const prevComputedRightHidden = prevComputedRightHiddenRef.current;
    // 更新当前隐藏状态
    prevComputedLeftHiddenRef.current = computedLeftHidden;
    prevComputedRightHiddenRef.current = computedRightHidden;

    // 如果用户偏好减少动画，直接关闭动画状态
    if (reduceMotion) {
      setIsClosingLeft(false);
      setIsClosingRight(false);
      return;
    }

    // 如果面板从显示变为隐藏，播放关闭动画
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
