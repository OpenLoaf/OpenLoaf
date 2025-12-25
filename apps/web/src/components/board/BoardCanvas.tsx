"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import { BoardProvider } from "./BoardProvider";
import { CanvasEngine } from "./CanvasEngine";
import { CanvasRenderer } from "./CanvasRenderer";
import BoardControls from "./controls/BoardControls";
import BoardToolbar from "./toolbar/BoardToolbar";
import { snapResizeRectSE } from "./utils/alignment-guides";
import type {
  CanvasAnchorHit,
  CanvasConnectorDraft,
  CanvasElement,
  CanvasNodeDefinition,
  CanvasSnapshot,
  CanvasNodeElement,
  CanvasPoint,
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
  /** Panel ref used for outside-click detection. */
  const connectorDropRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    engine.attach(containerRef.current);
    return () => {
      engine.detach();
    };
  }, [engine]);

  useEffect(() => {
    // 逻辑：主题切换时强制刷新画布渲染，确保连线颜色同步更新。
    const root = document.documentElement;
    const refresh = () => engine.refreshView();
    const observer = new MutationObserver(() => refresh());
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (media) {
      const handler = () => refresh();
      media.addEventListener?.("change", handler);
      return () => {
        observer.disconnect();
        media.removeEventListener?.("change", handler);
      };
    }
    return () => {
      observer.disconnect();
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
      : snapshot.draggingId
        ? "grabbing"
        : "default";

  const connectorDrop = snapshot.connectorDrop;
  const connectorDropScreen = connectorDrop
    ? toScreenPoint(connectorDrop.point, snapshot)
    : null;

  useEffect(() => {
    if (!connectorDrop) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const panel = connectorDropRef.current;
      if (!panel || !target) return;
      if (panel.contains(target)) return;
      // 逻辑：点击面板外部时关闭，不创建节点。
      engine.setConnectorDrop(null);
    };
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, {
        capture: true,
      });
    };
  }, [connectorDrop, engine]);

  /** Create a node and connector from a drop panel selection. */
  const handleConnectorDropSelect = (item: ConnectorDropItem) => {
    if (!connectorDrop) return;
    const [width, height] = item.size;
    const xywh: [number, number, number, number] = [
      connectorDrop.point[0] - width / 2,
      connectorDrop.point[1] - height / 2,
      width,
      height,
    ];
    const id = engine.addNodeElement(item.type, item.props, xywh);
    if (id) {
      engine.addConnectorElement({
        source: connectorDrop.source,
        target: { elementId: id },
        style: engine.getConnectorStyle(),
      });
    }
    engine.setConnectorDrop(null);
  };

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
            !target.closest("[data-connector-drop-panel]") &&
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
        <AnchorOverlay snapshot={snapshot} />
        <BoardControls engine={engine} snapshot={snapshot} />
        <BoardToolbar engine={engine} snapshot={snapshot} />
        {connectorDrop && connectorDropScreen ? (
          <ConnectorDropPanel
            ref={connectorDropRef}
            position={connectorDropScreen}
            onSelect={handleConnectorDropSelect}
          />
        ) : null}
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
        transform: `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`,
        transformOrigin: "top left",
        willChange: "transform",
      }}
    >
      {snapshot.elements
        .filter((element): element is CanvasNodeElement => element.kind === "node")
        .map(element => {
          const definition = engine.nodes.getDefinition(element.type);
          if (!definition) return null;
          const View = definition.view;
          const [x, y, w, h] = element.xywh;
          const left = x;
          const top = y;
          const width = w;
          const height = h;
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
                  // 逻辑：使用 drop-shadow 保持圆角组件的拖拽阴影一致。
                  filter: isDragging
                    ? "drop-shadow(0 18px 40px var(--canvas-drag-shadow))"
                    : "none",
                }}
              >
                <View
                  element={element}
                  selected={selected}
                  onSelect={() => engine.selection.setSelection([element.id])}
                  onUpdate={patch => engine.doc.updateNodeProps(element.id, patch)}
                />
              </div>
              {selected && canResize && !snapshot.locked && !isDragging ? (
                <ResizeHandle
                  engine={engine}
                  element={element}
                  isDragging={isDragging}
                />
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
  /** Whether the node is being dragged. */
  isDragging: boolean;
};

/** Render a resize handle for the bottom-right corner. */
function ResizeHandle({ engine, element, isDragging }: ResizeHandleProps) {
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
    const definition = engine.nodes.getDefinition(element.type);
    const minSize = definition?.capabilities?.minSize ?? { w: 80, h: 60 };
    const maxSize = definition?.capabilities?.maxSize;

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
      const baseRect = {
        x: startX,
        y: startY,
        w: Math.max(minSize.w, startW + dx),
        h: Math.max(minSize.h, startH + dy),
      };
      const clampedRect = maxSize
        ? {
            x: baseRect.x,
            y: baseRect.y,
            w: Math.min(maxSize.w, baseRect.w),
            h: Math.min(maxSize.h, baseRect.h),
          }
        : baseRect;
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

      const snapped = snapResizeRectSE(clampedRect, others, threshold, margin, minSize);
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
      data-resize-handle
      onPointerDown={handlePointerDown}
      style={{
        position: "absolute",
        right: 6,
        bottom: 6,
        width: 16,
        height: 16,
        background: "transparent",
        transform: isDragging ? "scale(1.02)" : "scale(1)",
        transformOrigin: "bottom right",
        cursor: "nwse-resize",
      }}
    >
      <span
        style={{
          position: "absolute",
          right: 2,
          bottom: 2,
          width: 10,
          height: 2,
          background: "rgba(148, 163, 184, 0.9)",
          borderRadius: 2,
          transform: "rotate(-45deg)",
          transformOrigin: "right bottom",
        }}
      />
      <span
        style={{
          position: "absolute",
          right: 2,
          bottom: 6,
          width: 6,
          height: 2,
          background: "rgba(148, 163, 184, 0.9)",
          borderRadius: 2,
          transform: "rotate(-45deg)",
          transformOrigin: "right bottom",
        }}
      />
    </button>
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

type AnchorOverlayProps = {
  /** Current snapshot for anchor rendering. */
  snapshot: CanvasSnapshot;
};

/** Render anchor handles above nodes for linking. */
function AnchorOverlay({ snapshot }: AnchorOverlayProps) {
  const sourceAnchor = getDraftAnchor(snapshot.connectorDraft);
  const hoverAnchor = snapshot.connectorHover;
  if (!sourceAnchor && !hoverAnchor) return null;

  const anchors: CanvasAnchorHit[] = [];
  if (sourceAnchor) {
    // 逻辑：补齐草稿源锚点的坐标，用于正确定位圆点。
    const resolved = resolveAnchorHit(sourceAnchor, snapshot);
    if (resolved) anchors.push(resolved);
  }
  if (hoverAnchor) anchors.push(hoverAnchor);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 12,
      }}
    >
      {anchors.map(anchor => {
        const screen = toScreenPoint(anchor.point, snapshot);
        const isHover =
          hoverAnchor?.elementId === anchor.elementId &&
          hoverAnchor.anchorId === anchor.anchorId;
        const size = isHover ? 11 : 7;
        return (
          <div
            key={`${anchor.elementId}-${anchor.anchorId}`}
            style={{
              position: "absolute",
              left: screen[0],
              top: screen[1],
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              borderRadius: 999,
              background: isHover
                ? "var(--canvas-connector-anchor-hover, #0f172a)"
                : "var(--canvas-connector-anchor, #1d4ed8)",
              border: "1px solid var(--canvas-connector-handle-fill, #ffffff)",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.12)",
            }}
          />
        );
      })}
    </div>
  );
}

type ConnectorDropItem = {
  /** Label shown in the panel. */
  label: string;
  /** Node type to insert. */
  type: string;
  /** Node props for insertion. */
  props: Record<string, string>;
  /** Default size for the node. */
  size: [number, number];
};

/** Available placeholder items for connector drop creation. */
const connectorDropItems: ConnectorDropItem[] = [
  {
    label: "图片",
    type: "placeholder",
    props: { title: "Image", description: "Image placeholder card." },
    size: [320, 180],
  },
  {
    label: "便签",
    type: "placeholder",
    props: { title: "Note", description: "Quick note placeholder card." },
    size: [320, 180],
  },
  {
    label: "文字",
    type: "placeholder",
    props: { title: "Text", description: "Simple text placeholder node." },
    size: [320, 180],
  },
];

type ConnectorDropPanelProps = {
  /** Panel anchor position in screen space. */
  position: [number, number];
  /** Selection callback for the item. */
  onSelect: (item: ConnectorDropItem) => void;
};

/** Render the connector drop selection panel. */
const ConnectorDropPanel = forwardRef<HTMLDivElement, ConnectorDropPanelProps>(
  function ConnectorDropPanel({ position, onSelect }, ref) {
    return (
      <div
        ref={ref}
        data-connector-drop-panel
        onPointerDown={event => {
          // 逻辑：阻止点击穿透触发画布选择。
          event.stopPropagation();
        }}
        style={{
          position: "absolute",
          left: position[0],
          top: position[1],
          transform: "translate(-50%, -12px)",
          pointerEvents: "auto",
          zIndex: 30,
          background: "rgba(15, 23, 42, 0.88)",
          color: "#f8fafc",
          borderRadius: 12,
          padding: "10px 12px",
          boxShadow: "0 18px 36px rgba(15, 23, 42, 0.35)",
          minWidth: 180,
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          选择要插入的组件
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {connectorDropItems.map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => onSelect(item)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: 10,
                background: "rgba(148, 163, 184, 0.18)",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                color: "inherit",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {item.label}
              <span style={{ fontSize: 11, opacity: 0.65 }}>占位</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
);

ConnectorDropPanel.displayName = "ConnectorDropPanel";

/** Convert a world point to screen coordinates. */
function toScreenPoint(point: [number, number], snapshot: CanvasSnapshot): [number, number] {
  const { zoom, offset } = snapshot.viewport;
  return [point[0] * zoom + offset[0], point[1] * zoom + offset[1]];
}

/** Extract draft source anchor for overlay rendering. */
function getDraftAnchor(draft: CanvasConnectorDraft | null): CanvasAnchorHit | null {
  if (!draft) return null;
  if ("elementId" in draft.source && draft.source.anchorId) {
    return {
      elementId: draft.source.elementId,
      anchorId: draft.source.anchorId,
      point: [0, 0],
    };
  }
  return null;
}

/** Resolve anchor hit with the latest anchor coordinates. */
function resolveAnchorHit(
  anchor: CanvasAnchorHit,
  snapshot: CanvasSnapshot
): CanvasAnchorHit | null {
  const list = snapshot.anchors[anchor.elementId];
  if (!list) return null;
  const match = list.find(item => item.id === anchor.anchorId);
  if (!match) return null;
  return { ...anchor, point: match.point as CanvasPoint };
}
