"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import { BoardProvider } from "./BoardProvider";
import { CanvasEngine } from "./CanvasEngine";
import { CanvasRenderer } from "./CanvasRenderer";
import BoardControls from "./controls/BoardControls";
import BoardToolbar from "./toolbar/BoardToolbar";
import { snapResizeRectSE } from "./utils/alignment-guides";
import type {
  CanvasElement,
  CanvasNodeDefinition,
  CanvasSnapshot,
  CanvasNodeElement,
} from "./CanvasTypes";

export type BoardCanvasProps = {
  /** External engine instance, optional for integration scenarios. */
  engine?: CanvasEngine;
  /** Node definitions to register on first mount. */
  nodes?: CanvasNodeDefinition<unknown>[];
  /** Initial elements inserted once when mounted. */
  initialElements?: CanvasElement[];
  /** Optional container class name. */
  className?: string;
  /** Optional container style overrides. */
  style?: CSSProperties;
};

/** Render the new board canvas surface and DOM layers. */
export function BoardCanvas({
  engine: externalEngine,
  nodes,
  initialElements,
  className,
  style,
}: BoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engine = useMemo(
    () => externalEngine ?? new CanvasEngine(),
    [externalEngine]
  );
  const snapshot = useBoardSnapshot(engine);
  const nodesRegisteredRef = useRef(false);
  const initialElementsRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    engine.attach(containerRef.current);
    return () => {
      engine.detach();
    };
  }, [engine]);

  useEffect(() => {
    if (nodesRegisteredRef.current) return;
    if (!nodes || nodes.length === 0) return;
    // 只在首次挂载时注册节点定义，避免重复注册报错。
    engine.registerNodes(nodes);
    nodesRegisteredRef.current = true;
  }, [engine, nodes]);

  useEffect(() => {
    if (initialElementsRef.current) return;
    if (!initialElements || initialElements.length === 0) return;
    // 初始化元素一次性写入文档，保证首屏内容可复现。
    engine.setInitialElements(initialElements);
    initialElementsRef.current = true;
  }, [engine, initialElements]);

  const cursor =
    snapshot.activeToolId === "hand"
      ? snapshot.panning
        ? "grabbing"
        : "grab"
      : snapshot.activeToolId === "connector"
        ? "crosshair"
        : snapshot.draggingId
          ? "grabbing"
          : "default";

  return (
    <BoardProvider engine={engine}>
      <div
        ref={containerRef}
        className={className}
        tabIndex={0}
        onPointerDown={event => {
          // 逻辑：确保画布获取焦点，保证快捷键可用。
          containerRef.current?.focus();
          const target = event.target as HTMLElement | null;
          if (
            snapshot.activeToolId === "select" &&
            !event.shiftKey &&
            target &&
            !target.closest("[data-board-node]") &&
            !target.closest("[data-canvas-toolbar]") &&
            !target.closest("[data-board-controls]")
          ) {
            // 逻辑：空白点击时清空选区，避免残留高亮。
            engine.selection.clear();
          }
        }}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          outline: "none",
          cursor,
          ...style,
        }}
      >
        <CanvasSurface snapshot={snapshot} />
        <CanvasDomLayer engine={engine} snapshot={snapshot} />
        <BoardControls engine={engine} snapshot={snapshot} />
        <BoardToolbar engine={engine} snapshot={snapshot} />
      </div>
    </BoardProvider>
  );
}

type CanvasSurfaceProps = {
  /** Current snapshot for rendering. */
  snapshot: CanvasSnapshot;
};

/** Render the canvas surface layer. */
function CanvasSurface({ snapshot }: CanvasSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    rendererRef.current = new CanvasRenderer(canvasRef.current);
    return () => {
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.render(snapshot);
  }, [snapshot]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    />
  );
}

type CanvasDomLayerProps = {
  /** Engine reference used for node resolution. */
  engine: CanvasEngine;
  /** Current snapshot used for rendering nodes. */
  snapshot: CanvasSnapshot;
};

/** Render the DOM-based node layer. */
function CanvasDomLayer({ engine, snapshot }: CanvasDomLayerProps) {
  const { zoom, offset } = snapshot.viewport;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {snapshot.elements
        .filter((element): element is CanvasNodeElement => element.kind === "node")
        .map(element => {
          const definition = engine.nodes.getDefinition(element.type);
          if (!definition) return null;
          const View = definition.view;
          const [x, y, w, h] = element.xywh;
          const left = x * zoom + offset[0];
          const top = y * zoom + offset[1];
          const width = w * zoom;
          const height = h * zoom;
          const selected = snapshot.selectedIds.includes(element.id);
          const isDragging = snapshot.draggingId === element.id;
          const canResize = definition.capabilities?.resizable !== false;

          return (
            <div
              key={element.id}
              data-board-node
              data-node-type={element.type}
              data-selected={selected || undefined}
              data-dragging={isDragging || undefined}
              style={{
                position: "absolute",
                left,
                top,
                width,
                height,
                transform: element.rotate ? `rotate(${element.rotate}deg)` : undefined,
                transformOrigin: "center",
                pointerEvents: "auto",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  transform: isDragging ? "scale(1.02)" : "scale(1)",
                  transition: "transform 140ms ease, box-shadow 140ms ease",
                  boxShadow: isDragging
                    ? "0 18px 40px rgba(15, 23, 42, 0.18)"
                    : undefined,
                }}
              >
                <View
                  element={element}
                  selected={selected}
                  onSelect={() => engine.selection.setSelection([element.id])}
                  onUpdate={patch => engine.doc.updateNodeProps(element.id, patch)}
                />
              </div>
              {selected && canResize && !snapshot.locked ? (
                <ResizeHandle engine={engine} element={element} />
              ) : null}
            </div>
          );
        })}
    </div>
  );
}

type ResizeHandleProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Target node element. */
  element: CanvasNodeElement;
};

/** Render a resize handle for the bottom-right corner. */
function ResizeHandle({ engine, element }: ResizeHandleProps) {
  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (engine.isLocked()) return;
    event.stopPropagation();
    event.preventDefault();

    const container = engine.getContainer();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startPoint: [number, number] = [
      event.clientX - rect.left,
      event.clientY - rect.top,
    ];
    const startWorld = engine.viewport.toWorld(startPoint);
    const [startX, startY, startW, startH] = element.xywh;

    engine.setDraggingElementId(element.id);
    engine.setAlignmentGuides([]);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextPoint: [number, number] = [
        moveEvent.clientX - rect.left,
        moveEvent.clientY - rect.top,
      ];
      const nextWorld = engine.viewport.toWorld(nextPoint);
      const dx = nextWorld[0] - startWorld[0];
      const dy = nextWorld[1] - startWorld[1];
      // 逻辑：保持最小尺寸，避免节点缩放到不可操作。
      const minSize = { w: 80, h: 60 };
      const baseRect = {
        x: startX,
        y: startY,
        w: Math.max(minSize.w, startW + dx),
        h: Math.max(minSize.h, startH + dy),
      };
      const { zoom } = engine.viewport.getState();
      // 逻辑：缩放下按屏幕像素换算吸附阈值。
      const threshold = 8 / Math.max(zoom, 0.1);
      const margin = 16 / Math.max(zoom, 0.1);
      const others = engine.doc
        .getElements()
        .filter(
          current => current.kind === "node" && current.id !== element.id
        )
        .map(current => {
          const [x, y, width, height] = current.xywh;
          return { x, y, w: width, h: height };
        });

      const snapped = snapResizeRectSE(baseRect, others, threshold, margin, minSize);
      engine.doc.updateElement(element.id, {
        xywh: [snapped.rect.x, snapped.rect.y, snapped.rect.w, snapped.rect.h],
      });
      engine.setAlignmentGuides(snapped.guides);
    };

    const handlePointerUp = () => {
      engine.setDraggingElementId(null);
      engine.setAlignmentGuides([]);
      engine.commitHistory();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <button
      type="button"
      aria-label="Resize"
      onPointerDown={handlePointerDown}
      style={{
        position: "absolute",
        right: 6,
        bottom: 6,
        width: 12,
        height: 12,
        borderRadius: 4,
        border: "1px solid rgba(15, 23, 42, 0.4)",
        background: "rgba(248, 250, 252, 0.9)",
        cursor: "nwse-resize",
      }}
    />
  );
}

/** Subscribe to engine updates and return the latest snapshot. */
function useBoardSnapshot(engine: CanvasEngine): CanvasSnapshot {
  const [snapshot, setSnapshot] = useState(() => engine.getSnapshot());

  useEffect(() => {
    // 订阅引擎变更，确保 UI 与模型保持同步。
    const unsubscribe = engine.subscribe(() => {
      setSnapshot(engine.getSnapshot());
    });
    return () => {
      unsubscribe();
    };
  }, [engine]);

  return snapshot;
}
