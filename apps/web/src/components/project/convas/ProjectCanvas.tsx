"use client";

import "reactflow/dist/style.css";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  type Connection,
  type ReactFlowInstance,
  type Node as RFNode,
  type NodeChange,
  PanOnScrollMode,
  MarkerType,
} from "reactflow";
import { Skeleton } from "@/components/ui/skeleton";
import { useIdleMount } from "@/hooks/use-idle-mount";
import CanvasToolbar from "./toolbar/CanvasToolbar";
import ImageNode, { type ImageNodeData } from "./nodes/ImageNode";
// 保留必要图标（顶部简易工具条）

interface ProjectCanvasProps {
  isLoading: boolean;
  isActive: boolean;
  pageId?: string;
  pageTitle: string;
}

interface ProjectCanvasHeaderProps {
  isLoading: boolean;
  pageTitle: string;
}

/** Fallback content while the canvas bundle loads. */
function ProjectCanvasFallback() {
  return <Skeleton className="h-full w-full min-h-[480px]" />;
}

/** Project canvas header. */
const ProjectCanvasHeader = memo(function ProjectCanvasHeader({
  isLoading,
  pageTitle,
}: ProjectCanvasHeaderProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base font-semibold">画布</span>
      <span className="text-xs text-muted-foreground truncate">{pageTitle}</span>
    </div>
  );
});

/** Render the project drawing canvas. */
const ProjectCanvas = memo(function ProjectCanvas({
  isLoading,
  isActive,
  pageId,
  pageTitle,
}: ProjectCanvasProps) {
  const shouldMountCanvas = useIdleMount(isActive && !isLoading, { timeoutMs: 420 });
  const showFallback = isActive && !shouldMountCanvas;
  const isCanvasActive = isActive && !isLoading;
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [isMoving, setIsMoving] = useState(false);
  const moveHideTimerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const pasteOffsetRef = useRef(0);
  // 当前工具模式（由底部工具栏驱动）
  const [mode, setMode] = useState<
    | "select"
    | "hand"
    | "marked"
    | "frame"
    | "group"
    | "arrow-straight"
    | "arrow-curve"
    | "resource"
  >("select");
  // 连线模式：记录起点节点，第二次点击节点后创建边
  const [pendingEdgeSource, setPendingEdgeSource] = useState<string | null>(null);

  // 画布数据：节点与边（初始化为空）
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  /** Build the node types map for the canvas. */
  // 画布节点类型映射（图片节点支持拖拽调整大小）
  const nodeTypes = useMemo(() => ({ image: ImageNode }), []);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    flowRef.current = instance;
    instance.fitView();
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge(connection, eds));
  }, []);

  /** Filter node changes to avoid ResizeObserver loops for image nodes. */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const nodeMap = new Map(nds.map((node) => [node.id, node]));
        // 忽略图片节点的非 resize 维度变化，避免 ResizeObserver -> setState 回路
        const filteredChanges = changes.filter((change) => {
          if (change.type !== "dimensions") return true;
          if (typeof change.resizing === "boolean") return true;
          const node = nodeMap.get(change.id);
          return !node || node.type !== "image";
        });
        if (filteredChanges.length === 0) {
          return nds;
        }
        return applyNodeChanges(filteredChanges, nds);
      });
    },
    [setNodes],
  );

  // 节点点击：在不同模式下执行不同操作
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: RFNode) => {
      // 连线模式：第一次点击记录 source，第二次点击创建 edge
      if (mode === "arrow-straight" || mode === "arrow-curve") {
        if (!pendingEdgeSource) {
          setPendingEdgeSource(node.id);
        } else if (pendingEdgeSource !== node.id) {
          const id = `e-${pendingEdgeSource}-${node.id}-${Date.now()}`;
          setEdges((eds) =>
            eds.concat({
              id,
              source: pendingEdgeSource,
              target: node.id,
              type: mode === "arrow-curve" ? "smoothstep" : "straight",
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 18,
                height: 18,
              },
            }),
          );
          setPendingEdgeSource(null);
        }
      }
    },
    [mode, pendingEdgeSource, setEdges, setNodes],
  );

  const onMoveStart = useCallback(() => {
    if (moveHideTimerRef.current) {
      clearTimeout(moveHideTimerRef.current);
      moveHideTimerRef.current = null;
    }
    setIsMoving(true);
  }, []);

  const onMoveEnd = useCallback(() => {
    // 延时隐藏，避免抖动
    moveHideTimerRef.current = window.setTimeout(() => {
      setIsMoving(false);
    }, 240);
  }, []);

  /** Handle middle-wheel zoom on the canvas. */
  // 画布滚轮：仅中键滚轮缩放（触控板捏合交给 React Flow）
  const handleCanvasWheel = useCallback((e: WheelEvent) => {
    const inst = flowRef.current;
    if (!inst) return;
    const viewport =
      typeof inst.getViewport === "function" ? inst.getViewport() : { x: 0, y: 0, zoom: 1 };
    const buttons = typeof e.buttons === "number" ? e.buttons : 0;
    const isMiddleWheel = (buttons & 4) === 4;
    if (!isMiddleWheel) return;
    const delta = -e.deltaY * 0.002;
    const nextZoom = Math.min(4, Math.max(0.1, viewport.zoom + delta));
    if (typeof inst.zoomTo === "function") {
      inst.zoomTo(nextZoom);
    } else if (typeof inst.setViewport === "function") {
      inst.setViewport({ x: viewport.x, y: viewport.y, zoom: nextZoom });
    }
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // 使用原生 wheel 监听（non-passive），避免 React 合成事件默认被动
  useEffect(() => {
    if (!isCanvasActive) return;
    const el = canvasRef.current;
    if (!el) return;
    const listener = (ev: WheelEvent) => handleCanvasWheel(ev);
    el.addEventListener("wheel", listener, { passive: false });
    return () => {
      el.removeEventListener("wheel", listener);
    };
  }, [handleCanvasWheel, isCanvasActive]);

  /** Track pointer position for paste placement. */
  const handleCanvasPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  /** Resolve the flow position for pasted content. */
  const getPastePosition = useCallback(() => {
    const inst = flowRef.current;
    const el = canvasRef.current;
    if (!inst || !el) {
      return { x: 0, y: 0 };
    }
    const rect = el.getBoundingClientRect();
    const pointer = lastPointerRef.current;
    const clientX = pointer?.x ?? rect.left + rect.width / 2;
    const clientY = pointer?.y ?? rect.top + rect.height / 2;
    if (typeof inst.screenToFlowPosition === "function") {
      return inst.screenToFlowPosition({ x: clientX, y: clientY });
    }
    if (typeof inst.project === "function") {
      return inst.project({ x: clientX - rect.left, y: clientY - rect.top });
    }
    return { x: 0, y: 0 };
  }, []);

  /** Insert an image node from clipboard file. */
  const insertImageNode = useCallback(
    async (file: File) => {
      // 流程：读取剪贴板图片 -> 获取尺寸 -> 计算缩放 -> 插入节点
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Failed to read image from clipboard."));
        reader.readAsDataURL(file);
      });

      const imageSize = await new Promise<{ width: number; height: number }>((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.width, height: image.height });
        image.src = dataUrl;
      });

      const maxWidth = 320;
      const maxHeight = 240;
      const scale = Math.min(1, maxWidth / imageSize.width, maxHeight / imageSize.height);
      const width = Math.max(80, Math.round(imageSize.width * scale));
      const height = Math.max(60, Math.round(imageSize.height * scale));
      const basePosition = getPastePosition();
      // 连续粘贴时做轻微偏移，避免节点完全重叠
      const offset = pasteOffsetRef.current;
      pasteOffsetRef.current = (offset + 24) % 120;

      setNodes((nds) =>
        nds.concat({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          position: { x: basePosition.x + offset, y: basePosition.y + offset },
          data: { src: dataUrl, alt: "剪贴板图片" } satisfies ImageNodeData,
          width,
          height,
          style: {
            width,
            height,
            padding: 0,
            borderWidth: 0,
          },
          type: "image",
        }),
      );
    },
    [getPastePosition, setNodes],
  );

  /** Handle clipboard paste for images on the canvas. */
  const handlePasteImage = useCallback(
    (event: ClipboardEvent) => {
      if (!isCanvasActive) return;
      const target = event.target as Node | null;
      const canvasEl = canvasRef.current;
      // 仅在画布区域或无输入焦点时处理，避免影响表单粘贴
      if (canvasEl && target && !canvasEl.contains(target) && document.activeElement !== document.body) {
        return;
      }
      const items = event.clipboardData?.items;
      if (!items || items.length === 0) return;
      const imageItems = Array.from(items).filter((item) => item.type.startsWith("image/"));
      if (imageItems.length === 0) return;
      event.preventDefault();
      imageItems.forEach((item) => {
        const file = item.getAsFile();
        if (file) {
          void insertImageNode(file);
        }
      });
    },
    [insertImageNode, isCanvasActive],
  );

  // 使用原生 paste 监听，避免合成事件遗漏剪贴板图片
  useEffect(() => {
    if (!isCanvasActive) return;
    const handler = (event: ClipboardEvent) => handlePasteImage(event);
    window.addEventListener("paste", handler);
    return () => {
      window.removeEventListener("paste", handler);
    };
  }, [handlePasteImage, isCanvasActive]);

  // 测试按钮已移除：保留最小化 MVP 画布逻辑

  /** Convert client coordinates to flow coordinates. */
  // 画布内坐标转换
  // 插入便签/文字（MVP：简单节点）
  const onInsert = useCallback(
    (type: "note" | "text") => {
      const id = `n-${nodes.length + 1}`;
      const x = 120 + nodes.length * 36;
      const y = 120 + nodes.length * 20;
      const label = type === "note" ? "便签" : "文字";
      setNodes((nds) => [
        ...nds,
        {
          id,
          position: { x, y },
          // 备注：MVP 先用默认节点展示，后续可扩展自定义节点类型
          data: { label },
          type: "default",
        },
      ]);
    },
    [nodes.length, setNodes]
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
      >
        {shouldMountCanvas ? (
          <ReactFlow
            fitView
            proOptions={{ hideAttribution: true }}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={onInit}
            onMoveStart={onMoveStart}
            onMoveEnd={onMoveEnd}
            onNodeClick={onNodeClick}
            // 手型模式：启用拖拽平移，禁用拖选
            // 支持触控板双指平移 + 鼠标中键拖动
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Free}
            zoomOnScroll={false}
            zoomOnPinch
            panOnDrag={[1]}
            selectionOnDrag={mode !== "hand"}
            nodesDraggable={mode !== "hand"}
            className="canvas-flow"
            style={
              {
                "--canvas-cursor": canvasCursor,
                "--canvas-cursor-dragging": canvasDraggingCursor,
              } as React.CSSProperties
            }
          >
            {/* MiniMap：仅移动时显示，使用淡入淡出动画（避免频繁挂载卸载造成抖动） */}
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
                  style={{ width: 140, height: 100 }}
                />
              </div>
            ) : null}
            <Controls />
          </ReactFlow>
        ) : showFallback ? (
          <ProjectCanvasFallback />
        ) : null}
        {/* 底部工具栏（仅 UI）：玻璃风格、宽松间距、hover 展开 */}
        {/* 说明：onToolChange 驱动画布模式；onInsert 用于插入简单节点 */}
        <CanvasToolbar
          onToolChange={setMode}
          onInsert={onInsert}
        />
        <div className="sr-only">
          {pageTitle} {pageId ?? "-"}
        </div>
      </div>
    </div>
  );
});

export { ProjectCanvasHeader };
export default ProjectCanvas;

/** 使用视口变换在 Pane 坐标系中渲染笔画 */

// 根据当前模式生成光标样式（使用静态 SVG 资源）
function getCursorForMode(
  mode:
    | "select"
    | "hand"
    | "marked"
    | "frame"
    | "group"
    | "arrow-straight"
    | "arrow-curve"
    | "resource"
) {
  switch (mode) {
    case "hand":
      return "grab";
    case "arrow-straight":
    case "arrow-curve":
    case "marked":
    case "frame":
    case "group":
      return "crosshair";
    default:
      return "default";
  }
}
