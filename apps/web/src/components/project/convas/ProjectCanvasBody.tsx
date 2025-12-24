"use client";

import "reactflow/dist/style.css";
import { memo, useCallback, useEffect, useRef } from "react";
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
import CanvasMultiSelectionToolbar from "./components/CanvasMultiSelectionToolbar";
import { useCanvasState } from "./CanvasProvider";
import ImageNode from "./nodes/ImageNode";
import GroupNode from "./nodes/GroupNode";
import { adjustGroupBounds, buildNodeMap, getNodeParentId } from "./utils/group-node";
import {
  collectSelectedSubgraph,
  collectSubgraphByIds,
  pasteSubgraph,
} from "./utils/node-copy-paste";
import {
  buildImageClipboardItem,
  parseCanvasClipboard,
  serializeCanvasClipboard,
  serializeCanvasClipboardIds,
} from "./utils/node-clipboard";
import { buildCanvasStorageKey, readCanvasStorage } from "./utils/canvas-storage";
import CanvasToolbar from "./toolbar/CanvasToolbar";
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
    setIsSelecting,
    setEdges,
    setIsMoving,
    setMode,
    setNodes,
    setPendingEdgeSource,
    setSuppressSingleNodeToolbar,
    showMiniMap,
    undo,
    redo,
    beginNodeDrag,
    endNodeDrag,
  } = useCanvasState();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const pasteOffsetRef = useRef(0);

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

  /** Begin tracking node drag for history coalescing. */
  const handleNodeDragStart = useCallback(() => {
    beginNodeDrag();
  }, [beginNodeDrag]);

  /** End node drag tracking and clear guides. */
  const handleNodeDragStop = useCallback(() => {
    endNodeDrag();
    clearAlignmentGuides();
  }, [clearAlignmentGuides, endNodeDrag]);

  /** Check whether a node is inside any selected group. */
  const isDescendantOfSelectedGroup = useCallback(
    (node: { id: string }, nodeMap: Map<string, { id: string }>, selectedGroups: Set<string>) => {
      let parentId = getNodeParentId(node);
      // 流程：沿父链向上查找，命中任一选中 group 即视为后代
      while (parentId) {
        if (selectedGroups.has(parentId)) return true;
        const parent = nodeMap.get(parentId);
        if (!parent) break;
        parentId = getNodeParentId(parent);
      }
      return false;
    },
    [],
  );

  const { handleSelectionStart, handleSelectionEnd } = useCanvasSelection({
    flowRef,
    nodes,
    setNodes,
    setIsSelecting,
    setSuppressSingleNodeToolbar,
  });

  const { onMoveStart, onMoveEnd } = useCanvasMovement({ setIsMoving });

  useCanvasWheelZoom({ canvasRef, flowRef, isCanvasActive });

  /** Refresh the React Flow viewport when the canvas becomes active. */
  useEffect(() => {
    if (!isCanvasActive) return;
    const inst = flowRef.current;
    if (!inst) return;
    // 逻辑：Tab 切换后刷新视口，避免 React Flow 交互层失活
    const rafId = window.requestAnimationFrame(() => {
      const viewport = inst.getViewport();
      inst.setViewport(viewport, { duration: 0 });
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isCanvasActive]);

  /** Track pointer position for clipboard paste. */
  const handleCanvasPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      handleCanvasImagePointerMove(event);
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    },
    [handleCanvasImagePointerMove],
  );

  useEffect(() => {
    if (!isCanvasActive) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isCanvasActive || isLocked) return;
      const target = event.target as HTMLElement | null;
      const isEditingTarget =
        target?.closest("input, textarea, [contenteditable='true']") !== null;
      if (isEditingTarget) return;
      const isUndo = (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z";
      const isRedo =
        (event.metaKey || event.ctrlKey) &&
        (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"));
      if (isUndo) {
        undo();
        event.preventDefault();
        return;
      }
      if (isRedo) {
        redo();
        event.preventDefault();
        return;
      }
      const isCopy = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c";
      const isSelectAll = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a";
      if (isSelectAll) {
        const nodeMap = buildNodeMap(nodes);
        const selectedGroups = new Set(
          nodes.filter((node) => node.type === "group").map((node) => node.id),
        );
        // 流程：选中全部 -> group 子节点取消选中 -> 刷新工具栏抑制状态
        const selectedCount = nodes.reduce((count, node) => {
          if (node.type === "group") return count + 1;
          if (
            selectedGroups.size > 0 &&
            isDescendantOfSelectedGroup(node, nodeMap, selectedGroups)
          ) {
            return count;
          }
          return count + 1;
        }, 0);
        setNodes((prevNodes) =>
          prevNodes.map((node) => {
            if (node.type === "group") {
              return { ...node, selected: true };
            }
            if (
              selectedGroups.size > 0 &&
              isDescendantOfSelectedGroup(node, nodeMap, selectedGroups)
            ) {
              return { ...node, selected: false };
            }
            return { ...node, selected: true };
          }),
        );
        setSuppressSingleNodeToolbar(selectedCount > 1);
        event.preventDefault();
        return;
      }
      if (isCopy) {
        const payload = collectSelectedSubgraph(nodes, edges);
        if (payload) {
          // 逻辑：同步写入系统剪贴板，支持跨应用粘贴
          void (async () => {
            try {
              const selectedRoots = nodes.filter((node) => node.selected).map((node) => node.id);
              const hasIdsCopyMode = nodes.some(
                (node) =>
                  node.selected &&
                  (node.data as { copyMode?: string } | undefined)?.copyMode === "ids",
              );
              if (hasIdsCopyMode) {
                await navigator.clipboard.writeText(
                  serializeCanvasClipboardIds(selectedRoots, pageId),
                );
                return;
              }
              const imageItem = await buildImageClipboardItem(payload);
              if (imageItem) {
                await navigator.clipboard.write([imageItem]);
                return;
              }
              await navigator.clipboard.writeText(serializeCanvasClipboard(payload, pageId));
            } catch {
              // ignore
            }
          })();
          event.preventDefault();
        }
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    edges,
    isCanvasActive,
    isDescendantOfSelectedGroup,
    isLocked,
    nodes,
    redo,
    setEdges,
    setNodes,
    setSuppressSingleNodeToolbar,
    undo,
  ]);

  useEffect(() => {
    if (!isCanvasActive) return;
    const handlePaste = (event: ClipboardEvent) => {
      if (!isCanvasActive || isLocked) return;
      const target = event.target as Node | null;
      const canvasEl = canvasRef.current;
      if (
        canvasEl &&
        target &&
        !canvasEl.contains(target) &&
        document.activeElement !== document.body
      ) {
        return;
      }
      const items = event.clipboardData?.items ?? [];
      const hasImage = Array.from(items).some((item) => item.type.startsWith("image/"));
      const text = event.clipboardData?.getData("text/plain") ?? "";
      const parsedPayload = parseCanvasClipboard(text);
      let payload = parsedPayload?.kind === "payload" ? parsedPayload.payload : null;
      if (parsedPayload?.kind === "ids") {
        if (parsedPayload.pageId && parsedPayload.pageId !== pageId) {
          const stored = readCanvasStorage(buildCanvasStorageKey(parsedPayload.pageId));
          payload = stored
            ? collectSubgraphByIds(stored.nodes, stored.edges, parsedPayload.ids)
            : null;
        } else {
          payload = collectSubgraphByIds(nodes, edges, parsedPayload.ids);
        }
      }
      if (!payload) {
        if (hasImage) return;
        return;
      }
      const inst = flowRef.current;
      const pointer = lastPointerRef.current;
      const targetCenter =
        inst && pointer
          ? inst.screenToFlowPosition({ x: pointer.x, y: pointer.y })
          : {
              x: payload.bounds.centerX + pasteOffsetRef.current,
              y: payload.bounds.centerY + pasteOffsetRef.current,
            };
      if (!inst || !pointer) {
        pasteOffsetRef.current = (pasteOffsetRef.current + 24) % 120;
      }
      const result = pasteSubgraph({
        nodes,
        edges,
        payload,
        targetCenter,
      });
      if (!result) return;
      // 逻辑：粘贴后刷新 group 边界并写入新节点/连线
      setNodes(adjustGroupBounds(result.nodes));
      setEdges(result.edges);
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("paste", handlePaste, true);
    return () => window.removeEventListener("paste", handlePaste, true);
  }, [edges, isCanvasActive, isLocked, nodes, setEdges, setNodes]);

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
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
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
            <CanvasControls />
          </ReactFlow>
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
