"use client";

import { memo, useCallback } from "react";
import { Lock, Maximize2, Unlock, ZoomIn, ZoomOut } from "lucide-react";
import { Panel, useReactFlow, useStore, type ReactFlowState } from "reactflow";
import { shallow } from "zustand/shallow";
import { useCanvasState } from "../CanvasProvider";
import { IconBtn } from "../toolbar/ToolbarParts";

const iconSize = 16;

/** Select zoom bounds from the React Flow store. */
function selectZoomState(state: ReactFlowState) {
  return {
    minZoomReached: state.transform[2] <= state.minZoom,
    maxZoomReached: state.transform[2] >= state.maxZoom,
  };
}

/** Render custom canvas controls for zoom, fit view, and lock. */
const CanvasControls = memo(function CanvasControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { isLocked, setIsLocked } = useCanvasState();
  const { minZoomReached, maxZoomReached } = useStore(selectZoomState, shallow);

  const handleZoomIn = useCallback(() => {
    zoomIn();
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut();
  }, [zoomOut]);

  const handleFitView = useCallback(() => {
    // 流程：按内容计算视图边界 -> 加入留白 -> 视图居中显示
    fitView({ padding: 0.15 });
  }, [fitView]);

  const toggleLock = useCallback(() => {
    setIsLocked((prev) => !prev);
  }, [setIsLocked]);

  return (
    <Panel
      position="top-left"
      style={{ top: "50%", left: "1rem", transform: "translateY(-50%)", margin: 0 }}
    >
      <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-2xl bg-background/70 px-1.5 py-1 ring-1 ring-border backdrop-blur-md">
        <IconBtn
          title="放大"
          onClick={handleZoomIn}
          disabled={maxZoomReached}
          className="h-8 w-8"
        >
          <ZoomIn size={iconSize} />
        </IconBtn>
        <IconBtn
          title="缩小"
          onClick={handleZoomOut}
          disabled={minZoomReached}
          className="h-8 w-8"
        >
          <ZoomOut size={iconSize} />
        </IconBtn>
        <IconBtn title="全屏" onClick={handleFitView} className="h-8 w-8">
          <Maximize2 size={iconSize} />
        </IconBtn>
        <IconBtn
          title={isLocked ? "解锁" : "锁定"}
          onClick={toggleLock}
          active={isLocked}
          className="h-8 w-8"
        >
          {isLocked ? <Lock size={iconSize} /> : <Unlock size={iconSize} />}
        </IconBtn>
      </div>
    </Panel>
  );
});

export default CanvasControls;
