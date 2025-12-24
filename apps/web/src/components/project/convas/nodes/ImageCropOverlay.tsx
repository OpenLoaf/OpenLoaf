"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageSize {
  width: number;
  height: number;
}

interface ImageCropOverlayProps {
  containerRef: RefObject<HTMLDivElement | null>;
  imageSize: ImageSize | null;
  cropRect: CropRect;
  onCropRectChange: (rect: CropRect) => void;
  rotation: number;
}

type DragHandle = "move" | "nw" | "ne" | "sw" | "se";

interface DragState {
  handle: DragHandle;
  startX: number;
  startY: number;
  startRect: CropRect;
}

const MIN_CROP_SIZE = 0.08;

/** Clamp a value within the provided bounds. */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Compute the object-contain box for the image inside the container. */
function getContainBox(containerSize: { width: number; height: number }, imageSize: ImageSize) {
  const containerRatio = containerSize.width / containerSize.height;
  const imageRatio = imageSize.width / imageSize.height;

  if (containerRatio > imageRatio) {
    const height = containerSize.height;
    const width = height * imageRatio;
    return {
      x: (containerSize.width - width) / 2,
      y: 0,
      width,
      height,
    };
  }

  const width = containerSize.width;
  const height = width / imageRatio;
  return {
    x: 0,
    y: (containerSize.height - height) / 2,
    width,
    height,
  };
}

/** Render an interactive crop overlay for the image node. */
const ImageCropOverlay = memo(function ImageCropOverlay({
  containerRef,
  imageSize,
  cropRect,
  onCropRectChange,
  rotation,
}: ImageCropOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [imageBox, setImageBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  /** Refresh the image box size based on the container rect. */
  const updateImageBox = useCallback(() => {
    const container = containerRef.current;
    if (!container || !imageSize) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    const box = getContainBox({ width, height }, imageSize);
    setImageBox(box);
  }, [containerRef, imageSize]);

  useEffect(() => {
    updateImageBox();
    const container = containerRef.current;
    if (!container) return;
    if (typeof ResizeObserver === "undefined") {
      const handleResize = () => updateImageBox();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
    const observer = new ResizeObserver(() => updateImageBox());
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, updateImageBox]);

  /** Get pointer coordinates normalized to the image box. */
  const getPointer = useCallback((event: PointerEvent | ReactPointerEvent) => {
    const overlay = overlayRef.current;
    if (!overlay || !imageBox) return null;
    const rect = overlay.getBoundingClientRect();
    if (!rect.width || !rect.height || !imageBox.width || !imageBox.height) return null;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const radians = (-rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const localX = dx * cos - dy * sin + imageBox.width / 2;
    const localY = dx * sin + dy * cos + imageBox.height / 2;
    const x = clamp(localX / imageBox.width, 0, 1);
    const y = clamp(localY / imageBox.height, 0, 1);
    return { x, y };
  }, [imageBox, rotation]);

  /** Begin dragging or resizing the crop box. */
  const startDrag = useCallback(
    (event: ReactPointerEvent, handle: DragHandle) => {
      const pointer = getPointer(event);
      if (!pointer) return;
      event.preventDefault();
      event.stopPropagation();
      dragStateRef.current = {
        handle,
        startX: pointer.x,
        startY: pointer.y,
        startRect: cropRect,
      };
    },
    [cropRect, getPointer],
  );

  useEffect(() => {
    /** Update the crop rect while dragging. */
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStateRef.current) return;
      const pointer = getPointer(event);
      if (!pointer) return;
      const { handle, startX, startY, startRect } = dragStateRef.current;
      const dx = pointer.x - startX;
      const dy = pointer.y - startY;
      let next = { ...startRect };

      // 流程：根据拖拽类型计算新矩形 -> 边界约束 -> 写回裁剪框
      if (handle === "move") {
        next.x = clamp(startRect.x + dx, 0, 1 - startRect.width);
        next.y = clamp(startRect.y + dy, 0, 1 - startRect.height);
      } else {
        if (handle === "nw" || handle === "sw") {
          const nextX = clamp(startRect.x + dx, 0, startRect.x + startRect.width - MIN_CROP_SIZE);
          next.width = startRect.width + (startRect.x - nextX);
          next.x = nextX;
        }
        if (handle === "ne" || handle === "se") {
          next.width = clamp(startRect.width + dx, MIN_CROP_SIZE, 1 - startRect.x);
        }
        if (handle === "nw" || handle === "ne") {
          const nextY = clamp(startRect.y + dy, 0, startRect.y + startRect.height - MIN_CROP_SIZE);
          next.height = startRect.height + (startRect.y - nextY);
          next.y = nextY;
        }
        if (handle === "sw" || handle === "se") {
          next.height = clamp(startRect.height + dy, MIN_CROP_SIZE, 1 - startRect.y);
        }
      }

      onCropRectChange(next);
    };

    /** Finish dragging the crop box. */
    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [getPointer, onCropRectChange]);

  if (!imageBox) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        ref={overlayRef}
        className="pointer-events-auto absolute"
        style={{
          left: `${imageBox.x}px`,
          top: `${imageBox.y}px`,
          width: `${imageBox.width}px`,
          height: `${imageBox.height}px`,
        }}
      >
        <div className="absolute inset-0 nodrag">
          <div
            className="absolute border border-primary/80 cursor-move"
            style={{
              left: `${cropRect.x * 100}%`,
              top: `${cropRect.y * 100}%`,
              width: `${cropRect.width * 100}%`,
              height: `${cropRect.height * 100}%`,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
            }}
            onPointerDown={(event) => startDrag(event, "move")}
          >
            <span className="pointer-events-none absolute inset-0" />
            <div
              className="absolute left-0 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background ring-1 ring-border"
              onPointerDown={(event) => startDrag(event, "nw")}
              style={{ cursor: "nwse-resize" }}
            />
            <div
              className="absolute right-0 top-0 h-2 w-2 translate-x-1/2 -translate-y-1/2 rounded-full bg-background ring-1 ring-border"
              onPointerDown={(event) => startDrag(event, "ne")}
              style={{ cursor: "nesw-resize" }}
            />
            <div
              className="absolute left-0 bottom-0 h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-background ring-1 ring-border"
              onPointerDown={(event) => startDrag(event, "sw")}
              style={{ cursor: "nesw-resize" }}
            />
            <div
              className="absolute right-0 bottom-0 h-2 w-2 translate-x-1/2 translate-y-1/2 rounded-full bg-background ring-1 ring-border"
              onPointerDown={(event) => startDrag(event, "se")}
              style={{ cursor: "nwse-resize" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

export default ImageCropOverlay;
