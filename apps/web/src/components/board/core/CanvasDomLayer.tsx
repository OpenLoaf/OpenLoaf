import { cn } from "@udecode/cn";
import type { PointerEvent as ReactPointerEvent } from "react";
import { MoveDiagonal2 } from "lucide-react";
import {
  DEFAULT_NODE_SIZE,
  GUIDE_MARGIN,
  MIN_ZOOM,
  SNAP_PIXEL,
} from "../engine/constants";
import type { CanvasNodeElement, CanvasSnapshot } from "../engine/types";
import { CanvasEngine } from "../engine/CanvasEngine";
import { snapResizeRectSE } from "../utils/alignment-guides";

type CanvasDomLayerProps = {
  /** Engine reference used for node resolution. */
  engine: CanvasEngine;
  /** Current snapshot used for rendering nodes. */
  snapshot: CanvasSnapshot;
};

/** Render the DOM-based node layer. */
export function CanvasDomLayer({ engine, snapshot }: CanvasDomLayerProps) {
  const { zoom, offset } = snapshot.viewport;
  const selectedNodeIds = new Set(
    snapshot.selectedIds.filter(id => {
      const element = snapshot.elements.find(item => item.id === id);
      return element?.kind === "node";
    })
  );
  const draggingGroup =
    snapshot.draggingId !== null &&
    selectedNodeIds.size > 1 &&
    selectedNodeIds.has(snapshot.draggingId);
  const singleNodeSelected = selectedNodeIds.size === 1;
  const pendingInsert = snapshot.pendingInsert;
  const pendingInsertPoint = snapshot.pendingInsertPoint;
  const pendingInsertDefinition = pendingInsert
    ? engine.nodes.getDefinition(pendingInsert.type)
    : null;
  const PendingInsertView = pendingInsertDefinition?.view ?? null;
  const pendingInsertSize = pendingInsert?.size ?? DEFAULT_NODE_SIZE;
  const pendingInsertXYWH = pendingInsertPoint
    ? ([
        pendingInsertPoint[0] - pendingInsertSize[0] / 2,
        pendingInsertPoint[1] - pendingInsertSize[1] / 2,
        pendingInsertSize[0],
        pendingInsertSize[1],
      ] as [number, number, number, number])
    : null;

  return (
    <div
      className="pointer-events-none absolute inset-0 origin-top-left will-change-transform"
      style={{
        transform: `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`,
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
          const isDragging =
            snapshot.draggingId === element.id || (draggingGroup && selected);
          const canResize = definition.capabilities?.resizable !== false;
          const isLocked = element.locked === true;

          return (
            <div
              key={element.id}
              data-board-node
              data-node-type={element.type}
              data-selected={selected || undefined}
              className="pointer-events-auto absolute"
              style={{
                left,
                top,
                width,
                height,
                transform: element.rotate ? `rotate(${element.rotate}deg)` : undefined,
                transformOrigin: "center",
              }}
            >
              <div
                className={cn(
                  "h-full w-full transition-transform duration-150 ease-out",
                  isDragging && "scale-[1.02] drop-shadow-[0_18px_40px_var(--canvas-drag-shadow)]"
                )}
              >
                <View
                  element={element}
                  selected={selected}
                  onSelect={() => engine.selection.setSelection([element.id])}
                  onUpdate={patch => engine.doc.updateNodeProps(element.id, patch)}
                />
              </div>
              {selected &&
              singleNodeSelected &&
              canResize &&
              !snapshot.locked &&
              !isDragging &&
              !isLocked ? (
                <ResizeHandle
                  engine={engine}
                  element={element}
                  isDragging={isDragging}
                />
              ) : null}
            </div>
          );
        })}
      {PendingInsertView && pendingInsert && pendingInsertXYWH ? (
        <div
          data-board-node-preview
          className="pointer-events-none absolute opacity-70"
          style={{
            left: pendingInsertXYWH[0],
            top: pendingInsertXYWH[1],
            width: pendingInsertXYWH[2],
            height: pendingInsertXYWH[3],
          }}
        >
          <div className="h-full w-full">
            <PendingInsertView
              element={{
                id: "pending-insert-preview",
                kind: "node",
                type: pendingInsert.type,
                xywh: pendingInsertXYWH,
                props: pendingInsert.props,
                locked: true,
              }}
              selected={false}
              onSelect={() => {}}
              onUpdate={() => {}}
            />
          </div>
        </div>
      ) : null}
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
    const startWorld = engine.screenToWorld(startPoint);
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
      const nextWorld = engine.screenToWorld(nextPoint);
      const dx = nextWorld[0] - startWorld[0];
      const dy = nextWorld[1] - startWorld[1];
      const isImageNode = element.type === "image";
      let nextW = startW + dx;
      let nextH = startH + dy;
      if (isImageNode) {
        // 逻辑：图片缩放按统一比例，确保始终保持原始宽高比。
        const useWidth = Math.abs(dx) >= Math.abs(dy);
        const rawScale = useWidth
          ? (startW + dx) / startW
          : (startH + dy) / startH;
        const minScale = Math.max(
          minSize.w / startW,
          minSize.h / startH
        );
        const maxScale = maxSize
          ? Math.min(maxSize.w / startW, maxSize.h / startH)
          : Number.POSITIVE_INFINITY;
        const scale = Math.min(maxScale, Math.max(minScale, rawScale));
        nextW = startW * scale;
        nextH = startH * scale;
      }
      // 逻辑：保持最小尺寸，避免节点缩放到不可操作。
      const baseRect = {
        x: startX,
        y: startY,
        w: Math.max(minSize.w, nextW),
        h: Math.max(minSize.h, nextH),
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
      const threshold = SNAP_PIXEL / Math.max(zoom, MIN_ZOOM);
      const margin = GUIDE_MARGIN / Math.max(zoom, MIN_ZOOM);
      const others = engine.doc
        .getElements()
        .filter(
          current => current.kind === "node" && current.id !== element.id
        )
        .map(current => {
          const [x, y, width, height] = current.xywh;
          return { x, y, w: width, h: height };
        });

      if (isImageNode) {
        // 逻辑：图片保持比例时不参与吸附，避免吸附调整破坏比例。
        engine.doc.updateElement(element.id, {
          xywh: [clampedRect.x, clampedRect.y, clampedRect.w, clampedRect.h],
        });
        engine.setAlignmentGuides([]);
        return;
      }
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
      className={cn(
        "absolute bottom-1.5 right-1.5 h-4 w-4 bg-transparent cursor-nwse-resize origin-bottom-right",
        isDragging ? "scale-[1.02]" : "scale-100"
      )}
    >
      <MoveDiagonal2 size={14} className="pointer-events-none text-slate-400/90" />
    </button>
  );
}
