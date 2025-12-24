"use client";

import "reactflow/dist/style.css";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import ReactFlow, {
  MiniMap,
  addEdge,
  type Connection,
  type ReactFlowInstance,
  PanOnScrollMode,
} from "reactflow";
import { useIdleMount } from "@/hooks/use-idle-mount";
import CanvasControls from "./controls/CanvasControls";
import CanvasAlignmentGuides from "./components/CanvasAlignmentGuides";
import CanvasGroupDuplicateGhost from "./components/CanvasGroupDuplicateGhost";
import CanvasMultiSelectionToolbar from "./components/CanvasMultiSelectionToolbar";
import { useCanvasState } from "./CanvasProvider";
import ImageNode from "./nodes/ImageNode";
import GroupNode, {
  adjustGroupBounds,
  buildNodeMap,
  createAbsolutePositionGetter,
  duplicateGroupAtPosition,
  resolveNodeSize,
} from "./nodes/GroupNode";
import CanvasToolbar from "./toolbar/CanvasToolbar";
import ProjectCanvasFallback from "./ProjectCanvasFallback";
import { useCanvasAlignment } from "./hooks/use-canvas-alignment";
import { useCanvasEdgeCreation } from "./hooks/use-canvas-edge-creation";
import { useCanvasImages } from "./hooks/use-canvas-images";
import { useCanvasMovement } from "./hooks/use-canvas-movement";
import { useCanvasSelection } from "./hooks/use-canvas-selection";
import { useCanvasWheelZoom } from "./hooks/use-canvas-wheel-zoom";
import { getCursorForMode } from "./utils/canvas-cursor";

export interface ProjectCanvasProps {
  isLoading: boolean;
  isActive: boolean;
  pageId?: string;
  pageTitle: string;
}

const NODE_TYPES = {
  image: ImageNode,
  group: GroupNode,
};

/** Render the project drawing canvas. */
const ProjectCanvasBody = memo(function ProjectCanvasBody({
  isLoading,
  isActive,
  pageId,
  pageTitle,
}: ProjectCanvasProps) {
  const shouldMountCanvas = useIdleMount(isActive && !isLoading, { timeoutMs: 420 });
  const isCanvasActive = isActive && !isLoading;
  const {
    edges,
    isLocked,
    isMoving,
    mode,
    nodes,
    onEdgesChange,
    pendingEdgeSource,
    pendingGroupDuplicateId,
    setEdges,
    setIsMoving,
    setMode,
    setNodes,
    setPendingEdgeSource,
    setPendingGroupDuplicateId,
    setSuppressSingleNodeToolbar,
    showMiniMap,
  } = useCanvasState();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const [duplicatePointer, setDuplicatePointer] = useState<{ x: number; y: number } | null>(
    null,
  );

  /** Capture the React Flow instance for later use. */
  const handleInit = useCallback((instance: ReactFlowInstance) => {
    flowRef.current = instance;
    instance.fitView();
  }, []);

  /** Connect nodes via the built-in connection drag. */
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (isLocked) return;
      setEdges((eds) => addEdge(connection, eds));
    },
    [isLocked, setEdges],
  );

  const {
    handleCanvasPointerMove: handleCanvasImagePointerMove,
    handleCanvasDragOver,
    handleCanvasDrop,
  } = useCanvasImages({
    isCanvasActive,
    isLocked,
    canvasRef,
    flowRef,
    setNodes,
  });

  const { alignmentGuides, clearAlignmentGuides, handleNodesChange } = useCanvasAlignment({
    isLocked,
    nodes,
    flowRef,
    setEdges,
    setNodes,
  });

  const { onNodeClick } = useCanvasEdgeCreation({
    isLocked,
    mode,
    pendingEdgeSource,
    setEdges,
    setPendingEdgeSource,
    setSuppressSingleNodeToolbar,
  });

  const { handleSelectionStart, handleSelectionEnd } = useCanvasSelection({
    flowRef,
    nodes,
    setSuppressSingleNodeToolbar,
  });

  const { onMoveStart, onMoveEnd } = useCanvasMovement({ setIsMoving });

  useCanvasWheelZoom({ canvasRef, flowRef, isCanvasActive });

  useEffect(() => {
    if (!pendingGroupDuplicateId || duplicatePointer) return;
    const groupNode = nodes.find((node) => node.id === pendingGroupDuplicateId);
    const size = groupNode ? resolveNodeSize(groupNode) : null;
    if (!groupNode || !size) return;
    const nodeMap = buildNodeMap(nodes);
    const getAbsolutePosition = createAbsolutePositionGetter(nodeMap);
    const abs = getAbsolutePosition(groupNode);
    // 逻辑：首次进入复制模式时，默认将虚影放在原节点中心
    setDuplicatePointer({ x: abs.x + size.width / 2, y: abs.y + size.height / 2 });
  }, [duplicatePointer, nodes, pendingGroupDuplicateId, setDuplicatePointer]);

  useEffect(() => {
    if (pendingGroupDuplicateId) return;
    if (!duplicatePointer) return;
    // 逻辑：退出复制模式时清理虚影指针状态
    setDuplicatePointer(null);
  }, [duplicatePointer, pendingGroupDuplicateId, setDuplicatePointer]);

  /** Track pointer position for group duplication previews. */
  const handleCanvasPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      handleCanvasImagePointerMove(event);
      if (!pendingGroupDuplicateId) return;
      const inst = flowRef.current;
      if (!inst) return;
      const nextPointer = inst.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setDuplicatePointer(nextPointer);
    },
    [handleCanvasImagePointerMove, pendingGroupDuplicateId, setDuplicatePointer],
  );

  /** Place the duplicated group on pointer down. */
  const handleCanvasPointerDownCapture = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (isLocked || !pendingGroupDuplicateId) return;
      if (event.button !== 0) return;
      const inst = flowRef.current;
      if (!inst) return;
      const groupNode = nodes.find((node) => node.id === pendingGroupDuplicateId);
      const size = groupNode ? resolveNodeSize(groupNode) : null;
      if (!size) return;
      const pointer = inst.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const targetAbs = {
        x: pointer.x - size.width / 2,
        y: pointer.y - size.height / 2,
      };
      const result = duplicateGroupAtPosition({
        nodes,
        edges,
        groupId: pendingGroupDuplicateId,
        targetAbs,
      });
      if (!result) return;
      // 逻辑：放置副本后清理状态，避免继续生成
      setNodes(adjustGroupBounds(result.nodes));
      setEdges(result.edges);
      setPendingGroupDuplicateId(null);
      setDuplicatePointer(null);
      event.preventDefault();
      event.stopPropagation();
    },
    [
      edges,
      isLocked,
      nodes,
      pendingGroupDuplicateId,
      setDuplicatePointer,
      setEdges,
      setNodes,
      setPendingGroupDuplicateId,
    ],
  );

  /** Insert a basic note/text node. */
  const onInsert = useCallback(
    (type: "note" | "text") => {
      if (isLocked) return;
      const id = `n-${nodes.length + 1}`;
      const x = 120 + nodes.length * 36;
      const y = 120 + nodes.length * 20;
      const label = type === "note" ? "便签" : "文字";
      // 逻辑：基于当前节点数量生成轻微错位的初始位置
      setNodes((nds) => [
        ...nds,
        {
          id,
          position: { x, y },
          data: { label },
          type: "default",
        },
      ]);
    },
    [isLocked, nodes.length, setNodes],
  );

  if (isLoading) {
    return null;
  }

  const canvasCursor = isCanvasActive ? getCursorForMode(mode) : "default";
  const canvasDraggingCursor = mode === "hand" ? "grabbing" : canvasCursor;

  return (
    <div className="h-full">
      <div
        ref={canvasRef}
        className="relative h-full min-h-[480px]"
        onPointerMove={handleCanvasPointerMove}
        onPointerDownCapture={handleCanvasPointerDownCapture}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >
        {shouldMountCanvas ? (
          <ReactFlow
            fitView
            proOptions={{ hideAttribution: true }}
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onInit={handleInit}
            onMoveStart={onMoveStart}
            onMoveEnd={onMoveEnd}
            onNodeClick={onNodeClick}
            onSelectionStart={handleSelectionStart}
            onSelectionEnd={handleSelectionEnd}
            onNodeDragStop={clearAlignmentGuides}
            nodesDraggable={mode !== "hand" && !isLocked}
            nodesConnectable={!isLocked}
            elementsSelectable={!isLocked}
            edgesUpdatable={!isLocked}
            // 手型模式：启用拖拽平移，禁用拖选
            // 支持触控板双指平移 + 鼠标中键拖动
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Free}
            zoomOnScroll={false}
            zoomOnPinch
            panOnDrag={[1]}
            selectionOnDrag={mode !== "hand" && !isLocked}
            className="canvas-flow"
            style={
              {
                "--canvas-cursor": canvasCursor,
                "--canvas-cursor-dragging": canvasDraggingCursor,
              } as React.CSSProperties
            }
          >
            {showMiniMap ? (
              <div
                className="transition-opacity duration-200 ease-out"
                style={{
                  opacity: isMoving ? 1 : 0,
                  pointerEvents: isMoving ? "auto" : "none",
                }}
              >
                <MiniMap
                  pannable
                  zoomable
                  position="top-left"
                  style={{
                    width: 140,
                    height: 100,
                    backgroundColor: "var(--canvas-minimap-bg)",
                    borderRadius: 12,
                  }}
                  nodeColor="var(--canvas-minimap-node)"
                  nodeStrokeColor="var(--canvas-minimap-node-stroke)"
                  maskColor="var(--canvas-minimap-mask)"
                  maskStrokeColor="var(--canvas-minimap-mask-stroke)"
                  maskStrokeWidth={1}
                />
              </div>
            ) : null}
            <CanvasAlignmentGuides guides={alignmentGuides} />
            <CanvasMultiSelectionToolbar />
            <CanvasGroupDuplicateGhost
              groupId={pendingGroupDuplicateId}
              pointer={duplicatePointer}
            />
            <CanvasControls />
          </ReactFlow>
        ) : isActive ? (
          <ProjectCanvasFallback />
        ) : null}
        {/* 底部工具栏（仅 UI）：玻璃风格、宽松间距、hover 展开 */}
        {/* 说明：onToolChange 驱动画布模式；onInsert 用于插入简单节点 */}
        <CanvasToolbar onToolChange={setMode} onInsert={onInsert} />
        <div className="sr-only">
          {pageTitle} {pageId ?? "-"}
        </div>
      </div>
    </div>
  );
});

export default ProjectCanvasBody;
