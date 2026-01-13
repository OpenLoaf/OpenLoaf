import { cn } from "@udecode/cn";
import { useEffect, useRef, useState } from "react";
import type { CanvasNodeElement, CanvasSnapshot } from "../engine/types";
import { CanvasEngine } from "../engine/CanvasEngine";

type CanvasDomLayerProps = {
  /** Engine reference used for node resolution. */
  engine: CanvasEngine;
  /** Current snapshot used for rendering nodes. */
  snapshot: CanvasSnapshot;
};

/** Render the DOM-based node layer. */
export function CanvasDomLayer({ engine, snapshot }: CanvasDomLayerProps) {
  const { zoom, offset } = snapshot.viewport;
  const [isZooming, setIsZooming] = useState(false);
  const lastZoomRef = useRef(zoom);
  const zoomTimeoutRef = useRef<number | null>(null);
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

  useEffect(() => {
    if (lastZoomRef.current === zoom) return;
    // 逻辑：缩放期间启用 will-change，结束后移除以触发清晰重绘。
    lastZoomRef.current = zoom;
    setIsZooming(true);
    if (zoomTimeoutRef.current) {
      window.clearTimeout(zoomTimeoutRef.current);
    }
    zoomTimeoutRef.current = window.setTimeout(() => {
      setIsZooming(false);
      zoomTimeoutRef.current = null;
    }, 160);
  }, [zoom]);

  useEffect(() => {
    return () => {
      if (zoomTimeoutRef.current) {
        window.clearTimeout(zoomTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 origin-top-left",
        (snapshot.panning || isZooming) && "will-change-transform"
      )}
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
          const selected = snapshot.selectedIds.includes(element.id);
          const isDragging =
            snapshot.draggingId === element.id || (draggingGroup && selected);
          const isEditing = element.id === snapshot.editingNodeId;

          return (
            <div
              key={element.id}
              data-board-node
              data-board-editor={isEditing || undefined}
              data-node-type={element.type}
              data-selected={selected || undefined}
              className="pointer-events-auto absolute select-none"
              style={{
                left: x,
                top: y,
                width: w,
                height: h,
                transform: element.rotate ? `rotate(${element.rotate}deg)` : undefined,
                transformOrigin: "center",
              }}
            >
              <div
                className={cn(
                  "h-full w-full transition-transform duration-150 ease-out",
                  isDragging &&
                    "scale-[1.02] drop-shadow-[0_18px_40px_var(--canvas-drag-shadow)]"
                )}
              >
                <View
                  element={element}
                  selected={selected}
                  editing={isEditing}
                  onSelect={() => engine.selection.setSelection([element.id])}
                  onUpdate={patch => engine.doc.updateNodeProps(element.id, patch)}
                />
              </div>
            </div>
          );
        })}
    </div>
  );
}
