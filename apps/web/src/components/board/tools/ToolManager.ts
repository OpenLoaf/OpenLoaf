import type { CanvasTool, ToolContext } from "./ToolTypes";
import type { CanvasPoint } from "../engine/types";
import type { CanvasEngine } from "../engine/CanvasEngine";
import { DEFAULT_NODE_SIZE } from "../engine/constants";
import { isBoardUiTarget } from "../utils/dom";

export class ToolManager {
  /** Tool registry keyed by tool id. */
  private readonly tools = new Map<string, CanvasTool>();
  /** Currently active tool id. */
  private activeToolId: string | null = null;
  /** Engine reference used for dispatching. */
  private readonly engine: CanvasEngine;
  /** Whether middle-button panning is active. */
  private middlePanning = false;

  /** Create a new tool manager. */
  constructor(engine: CanvasEngine) {
    this.engine = engine;
  }

  /** Register a tool instance. */
  register(tool: CanvasTool): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool already registered: ${tool.id}`);
    }
    this.tools.set(tool.id, tool);
  }

  /** Set the current active tool. */
  setActive(toolId: string): void {
    if (!this.tools.has(toolId)) {
      throw new Error(`Unknown tool: ${toolId}`);
    }
    this.activeToolId = toolId;
  }

  /** Return the current active tool id. */
  getActiveToolId(): string | null {
    return this.activeToolId;
  }

  /** Return the current active tool. */
  getActiveTool(): CanvasTool | null {
    if (!this.activeToolId) return null;
    return this.tools.get(this.activeToolId) ?? null;
  }

  /** Handle pointer down events from the canvas container. */
  handlePointerDown(event: PointerEvent): void {
    if (isBoardUiTarget(event.target)) return;
    const ctx = this.buildContext(event);
    if (!ctx) return;

    const target = event.currentTarget;
    if (target instanceof HTMLElement) {
      target.setPointerCapture(event.pointerId);
    }

    const pendingInsert = this.engine.getPendingInsert();
    if (pendingInsert && event.button === 0) {
      if (this.engine.isLocked()) {
        return;
      }
      if (isBoardUiTarget(event.target, ["[data-board-node]"])) return;
      const [width, height] = pendingInsert.size ?? DEFAULT_NODE_SIZE;
      const [x, y] = ctx.worldPoint;
      this.engine.addNodeElement(pendingInsert.type, pendingInsert.props, [
        x - width / 2,
        y - height / 2,
        width,
        height,
      ]);
      this.engine.setPendingInsert(null);
      return;
    }

    if (event.button === 1) {
      // 逻辑：中键按下时临时进入拖拽平移模式，不改变当前工具。
      const handTool = this.tools.get("hand");
      this.middlePanning = Boolean(handTool?.onPointerDown);
      if (this.middlePanning) {
        event.preventDefault();
        handTool?.onPointerDown?.(ctx);
        return;
      }
    }

    // 将输入事件统一转换为世界坐标，再交由工具处理。
    this.getActiveTool()?.onPointerDown?.(ctx);
  }

  /** Handle pointer move events from the canvas container. */
  handlePointerMove(event: PointerEvent): void {
    const ctx = this.buildContext(event);
    if (!ctx) return;
    if (this.engine.isToolbarDragging()) {
      return;
    }
    const pendingInsert = this.engine.getPendingInsert();
    if (pendingInsert) {
      this.engine.setPendingInsertPoint(ctx.worldPoint);
    }
    if (this.middlePanning) {
      this.tools.get("hand")?.onPointerMove?.(ctx);
      return;
    }
    this.getActiveTool()?.onPointerMove?.(ctx);
  }

  /** Handle pointer up events from the canvas container. */
  handlePointerUp(event: PointerEvent): void {
    const ctx = this.buildContext(event);
    if (!ctx) return;
    if (this.engine.isToolbarDragging()) {
      return;
    }

    const target = event.currentTarget;
    if (target instanceof HTMLElement) {
      target.releasePointerCapture(event.pointerId);
    }
    if (this.middlePanning) {
      this.tools.get("hand")?.onPointerUp?.(ctx);
      this.middlePanning = false;
      return;
    }
    this.getActiveTool()?.onPointerUp?.(ctx);
  }

  /** Handle key down events from the canvas container. */
  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      if (this.engine.getPendingInsert()) {
        event.preventDefault();
        this.engine.setPendingInsert(null);
        return;
      }
    }
    this.getActiveTool()?.onKeyDown?.(event, this.engine);
  }

  /** Build tool context for pointer events. */
  private buildContext(event: PointerEvent): ToolContext | null {
    const container = this.engine.getContainer();
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    // 将浏览器事件坐标转换为画布屏幕坐标与世界坐标。
    const screenPoint: CanvasPoint = [
      event.clientX - rect.left,
      event.clientY - rect.top,
    ];
    const worldPoint = this.engine.screenToWorld(screenPoint);
    return {
      engine: this.engine,
      event,
      screenPoint,
      worldPoint,
    };
  }
}
