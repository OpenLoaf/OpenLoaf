import type { CanvasPoint, CanvasViewportState } from "./CanvasTypes";

/** Clamp a value between a min and max bound. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class ViewportController {
  /** Current zoom level. */
  private zoom = 1;
  /** Viewport translation in screen coordinates. */
  private offset: CanvasPoint = [0, 0];
  /** Viewport size in screen pixels. */
  private size: CanvasPoint = [0, 0];
  /** Change emitter used to notify subscribers. */
  private readonly emitChange: () => void;

  /** Create a new viewport controller. */
  constructor(emitChange: () => void) {
    this.emitChange = emitChange;
  }

  /** Update viewport size based on container layout. */
  setSize(width: number, height: number): void {
    this.size = [width, height];
    this.emitChange();
  }

  /** Set viewport offset directly. */
  setOffset(offset: CanvasPoint): void {
    this.offset = offset;
    this.emitChange();
  }

  /** Pan the viewport by a screen delta. */
  panBy(dx: number, dy: number): void {
    this.offset = [this.offset[0] + dx, this.offset[1] + dy];
    this.emitChange();
  }

  /** Set both zoom and offset at once. */
  setViewport(zoom: number, offset: CanvasPoint): void {
    this.zoom = clamp(zoom, 0.1, 8);
    this.offset = offset;
    this.emitChange();
  }

  /** Set the zoom level with an optional screen anchor. */
  setZoom(nextZoom: number, anchor?: CanvasPoint): void {
    const clamped = clamp(nextZoom, 0.1, 8);
    if (!anchor) {
      this.zoom = clamped;
      this.emitChange();
      return;
    }

    // 以屏幕锚点为中心缩放，保持锚点对应的世界坐标不漂移。
    const before = this.toWorld(anchor);
    this.zoom = clamped;
    const after = this.toScreen(before);
    this.offset = [
      this.offset[0] + (anchor[0] - after[0]),
      this.offset[1] + (anchor[1] - after[1]),
    ];
    this.emitChange();
  }

  /** Convert a screen point into world coordinates. */
  toWorld(point: CanvasPoint): CanvasPoint {
    return [
      (point[0] - this.offset[0]) / this.zoom,
      (point[1] - this.offset[1]) / this.zoom,
    ];
  }

  /** Convert a world point into screen coordinates. */
  toScreen(point: CanvasPoint): CanvasPoint {
    return [
      point[0] * this.zoom + this.offset[0],
      point[1] * this.zoom + this.offset[1],
    ];
  }

  /** Return a snapshot of the current viewport state. */
  getState(): CanvasViewportState {
    return {
      zoom: this.zoom,
      offset: this.offset,
      size: this.size,
    };
  }
}
