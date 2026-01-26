import type { CanvasPoint, CanvasStrokePoint, CanvasStrokeTool } from "../engine/types";
import type { CanvasTool, ToolContext } from "./ToolTypes";

/** Minimum mouse movement in screen pixels before recording a stroke point. */
const MOUSE_MOVE_THRESHOLD_PX = 1.2;

class StrokeToolBase implements CanvasTool {
  /** Tool identifier. */
  readonly id: CanvasStrokeTool;
  /** Active stroke node id. */
  private draggingId: string | null = null;
  /** Collected stroke points in world space. */
  private draggingPoints: CanvasPoint[] | null = null;
  /** Collected pressure values for the stroke. */
  private draggingPressures: number[] | null = null;
  /** Last pointer position in world space. */
  private lastPoint: CanvasPoint | null = null;
  /** Pointer ids that report pressure changes. */
  private readonly pressureSupportedPointerIds = new Set<number>();
  /** Current straight line mode. */
  private straightLineType: "horizontal" | "vertical" | null = null;

  /** Create a stroke tool for pen/highlighter. */
  constructor(toolId: CanvasStrokeTool) {
    this.id = toolId;
  }

  /** Start a new stroke node on pointer down. */
  onPointerDown(ctx: ToolContext): void {
    if (ctx.event.button !== 0) return;
    if (ctx.engine.isLocked()) return;
    ctx.event.preventDefault();

    // 逻辑：进入绘制模式时清空选择，避免干扰。
    ctx.engine.selection.clear();

    const settings = ctx.engine.getStrokeSettings(this.id);
    const point: CanvasPoint = [ctx.worldPoint[0], ctx.worldPoint[1]];
    const pressure = ctx.event.pressure;
    const strokePoint: CanvasStrokePoint = [point[0], point[1]];
    const id = ctx.engine.addStrokeElement(this.id, settings, strokePoint);

    this.draggingId = id;
    this.draggingPoints = [point];
    this.draggingPressures = [pressure];
    this.lastPoint = point;
    this.straightLineType = null;
  }

  /** Continue the stroke node on pointer move. */
  onPointerMove(ctx: ToolContext): void {
    if (!this.draggingId || !this.draggingPoints || !this.draggingPressures) return;

    let nextPoint: CanvasPoint = [ctx.worldPoint[0], ctx.worldPoint[1]];
    if (ctx.event.shiftKey) {
      // 逻辑：按住 Shift 时锁定水平或垂直方向绘制。
      if (!this.straightLineType) {
        this.straightLineType = this.getStraightLineType(nextPoint);
      }
      if (this.straightLineType === "horizontal") {
        nextPoint = [nextPoint[0], this.lastPoint?.[1] ?? nextPoint[1]];
      } else if (this.straightLineType === "vertical") {
        nextPoint = [this.lastPoint?.[0] ?? nextPoint[0], nextPoint[1]];
      }
    } else if (this.straightLineType) {
      this.straightLineType = null;
    }

    if (ctx.event.pointerType === "mouse" && this.lastPoint) {
      const zoom = ctx.engine.getViewState().viewport.zoom;
      const dx = (nextPoint[0] - this.lastPoint[0]) * zoom;
      const dy = (nextPoint[1] - this.lastPoint[1]) * zoom;
      // 逻辑：鼠标抖动时忽略极小位移，减少锯齿感。
      if (dx * dx + dy * dy < MOUSE_MOVE_THRESHOLD_PX * MOUSE_MOVE_THRESHOLD_PX) {
        return;
      }
    }

    const points = [...this.draggingPoints, nextPoint];
    const pressures = [...this.draggingPressures, ctx.event.pressure];
    this.draggingPoints = points;
    this.draggingPressures = pressures;
    this.lastPoint = nextPoint;

    const pointerId = ctx.event.pointerId;
    const pressureChanged = pressures.some(value => value !== pressures[0]);
    if (pressureChanged) {
      this.pressureSupportedPointerIds.add(pointerId);
    }

    const strokePoints: CanvasStrokePoint[] = this.pressureSupportedPointerIds.has(pointerId)
      ? points.map(([x, y], index) => [x, y, pressures[index]])
      : points.map(([x, y]) => [x, y]);

    const settings = ctx.engine.getStrokeSettings(this.id);
    ctx.engine.updateStrokeElement(this.draggingId, strokePoints, this.id, settings);
  }

  /** Finish the stroke node on pointer up. */
  onPointerUp(ctx: ToolContext): void {
    if (!this.draggingId) return;
    ctx.engine.commitHistory();
    this.draggingId = null;
    this.draggingPoints = null;
    this.draggingPressures = null;
    this.lastPoint = null;
    this.straightLineType = null;
  }

  /** Resolve straight line mode based on movement angle. */
  private getStraightLineType(currentPoint: CanvasPoint): "horizontal" | "vertical" | null {
    const lastPoint = this.lastPoint;
    if (!lastPoint) return null;
    const dx = currentPoint[0] - lastPoint[0];
    const dy = currentPoint[1] - lastPoint[1];
    const absAngleRadius = Math.abs(Math.atan2(dy, dx));
    return absAngleRadius < Math.PI / 4 || absAngleRadius > (3 * Math.PI) / 4
      ? "horizontal"
      : "vertical";
  }
}

export class PenTool extends StrokeToolBase {
  /** Create a pen tool. */
  constructor() {
    super("pen");
  }
}

export class HighlighterTool extends StrokeToolBase {
  /** Create a highlighter tool. */
  constructor() {
    super("highlighter");
  }
}
