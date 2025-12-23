"use client";

import "reactflow/dist/style.css";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import ReactFlow, {
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type ReactFlowInstance,
  type Node as RFNode,
  MarkerType,
  useViewport,
} from "reactflow";
import getStroke from "perfect-freehand";
import { Skeleton } from "@/components/ui/skeleton";
import { useIdleMount } from "@/hooks/use-idle-mount";
import CanvasToolbar from "./toolbar/CanvasToolbar";
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
  const { resolvedTheme } = useTheme();
  // 根据当前系统主题切换 React Flow 主题
  const shouldMountCanvas = useIdleMount(isActive && !isLoading, { timeoutMs: 420 });
  const showFallback = isActive && !shouldMountCanvas;
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [isMoving, setIsMoving] = useState(false);
  const moveHideTimerRef = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
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
    | "pen"
    | "eraser"
  >("select");
  // 连线模式：记录起点节点，第二次点击节点后创建边
  const [pendingEdgeSource, setPendingEdgeSource] = useState<string | null>(null);
  // 手绘笔画集合（perfect-freehand 生成轮廓）
  type StrokePoint = { x: number; y: number; t: number; pressure: number };
  type Stroke = { id: string; points: StrokePoint[]; color: string; size: number };
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState<string>("#111827"); // 默认黑色
  const [penSize, setPenSize] = useState<number>(6);
  // rAF 批量提交绘制点，降低抖动与渲染频率
  const rafRef = useRef<number | null>(null);
  const pendingPointsRef = useRef<StrokePoint[]>([]);
  const currentStrokeIdRef = useRef<string | null>(null);

  // 画布数据：节点与边（初始化为空）
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const flowRef = useRef<ReactFlowInstance | null>(null);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    flowRef.current = instance;
    instance.fitView();
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge(connection, eds));
  }, []);

  // 节点点击：在不同模式下执行不同操作
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: RFNode) => {
      // 橡皮擦：删除节点以及相关边
      if (mode === "eraser") {
        setNodes((nds) => nds.filter((n) => n.id !== node.id));
        setEdges((eds) => eds.filter((e) => e.source !== node.id && e.target !== node.id));
        return;
      }

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

  // 测试按钮已移除：保留最小化 MVP 画布逻辑

  // 画笔：Pane 鼠标事件（将屏幕坐标转 Flow 坐标，记录折线）
  const handlePaneMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (mode !== "pen" && mode !== "eraser") return;
      if (!flowRef.current) return;
      const rect = overlayRef.current?.getBoundingClientRect();
      const localX = rect ? e.clientX - rect.left : e.clientX;
      const localY = rect ? e.clientY - rect.top : e.clientY;
      // 将屏幕坐标转为画布坐标
      const p = flowRef.current.project({ x: localX, y: localY });
      const now = performance.now();
      // React.MouseEvent 不暴露 pressure 类型，运行时支持 PointerEvent.pressure，取值 0..1
      const pressure =
        // @ts-expect-error cast pointer event
        (typeof e.pressure === "number" ? (e.pressure as number) : 0.5) || 0.5;
      if (mode === "pen") {
        const id = `stroke-${Date.now()}`;
        setStrokes((prev) => [
          ...prev,
          { id, points: [{ x: p.x, y: p.y, t: now, pressure }], color: penColor, size: penSize },
        ]);
        setIsDrawing(true);
        currentStrokeIdRef.current = id;
        pendingPointsRef.current = [];
      } else if (mode === "eraser") {
        // 橡皮：立即尝试擦除
        eraseAtPoint(p.x, p.y);
        setIsDrawing(true);
      }
      // 禁止触发底层拖拽
      e.preventDefault();
      e.stopPropagation();
    },
    [mode, penColor, penSize]
  );

  const handlePaneMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing || (mode !== "pen" && mode !== "eraser")) return;
      if (!flowRef.current) return;
      const rect = overlayRef.current?.getBoundingClientRect();
      const localX = rect ? e.clientX - rect.left : e.clientX;
      const localY = rect ? e.clientY - rect.top : e.clientY;
      const p = flowRef.current.project({ x: localX, y: localY });
      const now = performance.now();
      const pressure =
        // @ts-expect-error cast pointer event
        (typeof e.pressure === "number" ? (e.pressure as number) : 0.5) || 0.5;
      if (mode === "pen") {
        // 中文备注：最小距离阈值，过滤极短移动，降低锯齿
        const MIN_DIST = 2;
        const lastPending = pendingPointsRef.current[pendingPointsRef.current.length - 1];
        const lastCommitted = (() => {
          const lastStroke = strokes[strokes.length - 1];
          const pts = lastStroke?.points;
          return pts && pts.length ? pts[pts.length - 1] : undefined;
        })();
        const base = lastPending ?? lastCommitted;
        if (base) {
          const dx = p.x - base.x;
          const dy = p.y - base.y;
          if (dx * dx + dy * dy < MIN_DIST * MIN_DIST) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
        // 记录点（含时间与压力）；平滑交由 perfect-freehand 处理
        pendingPointsRef.current.push({ x: p.x, y: p.y, t: now, pressure });
        if (rafRef.current == null) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            if (!currentStrokeIdRef.current || pendingPointsRef.current.length === 0) return;
            const toAppend = pendingPointsRef.current;
            pendingPointsRef.current = [];
            // 批量把待提交点合并到当前笔画末尾
            setStrokes((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.id !== currentStrokeIdRef.current) return prev;
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...last,
                points: [...last.points, ...toAppend],
              };
              return updated;
            });
          });
        }
      } else if (mode === "eraser") {
        eraseAtPoint(p.x, p.y);
      }
      e.preventDefault();
      e.stopPropagation();
    },
    [isDrawing, mode, strokes, penSize]
  );

  const finishDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    // 清理 rAF 队列，提交尾部点
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (pendingPointsRef.current.length) {
      const toAppend = pendingPointsRef.current;
      pendingPointsRef.current = [];
      setStrokes((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const updated = [...prev];
        updated[updated.length - 1] = { ...last, points: [...last.points, ...toAppend] };
        return updated;
      });
    }
    currentStrokeIdRef.current = null;
  }, [isDrawing]);

  // 橡皮：按距离阈值删除笔画（简化版）
  const eraseAtPoint = useCallback(
    (x: number, y: number) => {
      const THRESHOLD = 8; // 像素阈值
      setStrokes((prev) =>
        prev.filter((s) => {
          for (let i = 0; i < s.points.length; i++) {
            const p = s.points[i];
            const dx = p.x - x;
            const dy = p.y - y;
            if (dx * dx + dy * dy <= THRESHOLD * THRESHOLD) {
              return false; // 命中则删除整条笔画
            }
          }
          return true;
        })
      );
    },
    [setStrokes]
  );

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

  return (
    <div className="h-full">
      <div className="relative h-full min-h-[480px]">
        {shouldMountCanvas ? (
          <ReactFlow
            fitView
            proOptions={{ hideAttribution: true }}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={onInit}
            onMoveStart={onMoveStart}
            onMoveEnd={onMoveEnd}
            onNodeClick={onNodeClick}
            // 手型模式：启用拖拽平移，禁用拖选
            panOnDrag={mode === "hand"}
            selectionOnDrag={mode !== "hand" && mode !== "pen"}
            nodesDraggable={mode !== "hand" && mode !== "pen"}
          >
            {/* 画笔交互层：仅在画笔/橡皮模式下接管指针事件 */}
            <div
              ref={overlayRef}
              className="absolute inset-0 z-20"
              style={{
                pointerEvents: mode === "pen" || mode === "eraser" ? "auto" : "none",
                cursor: getCursorForMode(mode, penColor, resolvedTheme),
              }}
              onPointerDown={handlePaneMouseDown}
              onPointerMove={handlePaneMouseMove}
              onPointerUp={finishDrawing}
              onPointerLeave={finishDrawing}
            />
            {/* 笔画渲染（叠加在 Pane 上方，跟随视口变换） */}
            <PenOverlay strokes={strokes} />
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
        {/* 说明：onToolChange 驱动画布模式；onInsert 用于插入简单节点；pen 样式可调 */}
        <CanvasToolbar
          onToolChange={setMode}
          onInsert={onInsert}
          penColor={penColor}
          penSize={penSize}
          onPenColorChange={setPenColor}
          onPenSizeChange={setPenSize}
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

// 根据当前模式生成光标样式（使用简化的内联 SVG 图标作为鼠标光标）
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
    | "pen"
    | "eraser",
  penColor: string,
  theme: string | undefined
) {
  // 主题色：深色背景用浅色光标，反之亦然
  const base = theme === "dark" ? "#e5e7eb" : "#111827";
  const color = mode === "pen" ? penColor : base;

  // 构造简单的 SVG 图标（16x16）
  const svgPen = `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><path fill='${color}' d='M2 11l3 3-3 .8.8-3.8ZM4.4 10.6 11.7 3.3l1.9 1.9-7.3 7.3-1.9-1.9ZM14 4.6 11.4 2l.9-.9a1 1 0 0 1 1.4 0l1.2 1.2a1 1 0 0 1 0 1.4L14 4.6Z'/></svg>`;
  const svgEraser = `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><path fill='${color}' d='M6.5 12 2 7.5a1.5 1.5 0 0 1 0-2.1l2.4-2.4a1.5 1.5 0 0 1 2.1 0L13 9.5l-2.8 2.8H6.5Zm0 0h6.2v1.5H5.8l.7-1.5Z'/></svg>`;

  const urlPen = `url("data:image/svg+xml;utf8,${encodeURIComponent(svgPen)}") 2 14, crosshair`;
  const urlEraser = `url("data:image/svg+xml;utf8,${encodeURIComponent(svgEraser)}") 2 14, default`;

  switch (mode) {
    case "pen":
      return urlPen;
    case "eraser":
      return urlEraser;
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

function PenOverlay({
  strokes,
}: {
  strokes: Array<{
    id: string;
    points: { x: number; y: number; t: number; pressure: number; w?: number }[];
    color: string;
    width: number;
  }>;
}) {
  // 读取 viewport 变换，使 SVG 与节点共享同一坐标系
  const { x, y, zoom } = useViewport();

  return (
    <div className="pointer-events-none absolute inset-0" style={{ transform: `translate(${x}px, ${y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
      <CanvasStrokeLayer strokes={strokes} zoom={zoom} />
    </div>
  );
}

function CanvasStrokeLayer({
  strokes,
  zoom,
}: {
  strokes: {
    id: string;
    points: { x: number; y: number; t: number; pressure: number }[];
    color: string;
    size: number;
  }[];
  zoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 尺寸与 DPR 适配
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const parent = el.parentElement as HTMLElement | null;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const resize = () => {
      const w = parent?.clientWidth ?? 0;
      const h = parent?.clientHeight ?? 0;
      const pixelW = Math.max(1, Math.floor(w * dpr));
      const pixelH = Math.max(1, Math.floor(h * dpr));
      if (el.width !== pixelW || el.height !== pixelH) {
        el.width = pixelW;
        el.height = pixelH;
      }
      draw();
    };
    const ro = new ResizeObserver(resize);
    if (parent) ro.observe(parent);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    resize();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // 绘制函数
  const draw = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    // 清空
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    // 将坐标系切换到 CSS 像素（避免模糊）
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 不再在 ctx 中应用 viewport 变换（父层已用 CSS transform 应用过）
    // 使用 perfect-freehand 生成轮廓并填充，保持非缩放线宽（通过传入 size，并在绘制时除以 zoom）
    for (const s of strokes) {
      const pts = s.points;
      if (pts.length < 2) continue;
      const input = pts.map((p) => [p.x, p.y, p.pressure] as [number, number, number]);
      const outline = getStroke(input, {
        size: s.size / Math.max(zoom, 0.001),
        thinning: 0.7,
        smoothing: 0.6,
        streamline: 0.5,
        simulatePressure: true,
        easing: (t) => t,
      });
      if (!outline.length) continue;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(outline[0][0], outline[0][1]);
      for (let i = 1; i < outline.length; i++) {
        ctx.lineTo(outline[i][0], outline[i][1]);
      }
      ctx.closePath();
      ctx.fill();
    }
  }, [strokes, zoom]);

  // 响应 strokes/zoom 变化重绘
  useEffect(() => {
    draw();
  }, [draw]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}
