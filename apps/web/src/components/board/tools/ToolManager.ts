import type { CanvasTool, ToolContext } from "./ToolTypes";
import type { CanvasPoint } from "../engine/types";
import type { CanvasEngine } from "../engine/CanvasEngine";
import { DEFAULT_NODE_SIZE } from "../engine/constants";
import { isBoardUiTarget } from "../utils/dom";

/** Tool switch shortcuts keyed by lowercase key. */
const TOOL_SHORTCUTS: Record<string, string> = {
  a: "select",
  w: "hand",
  p: "pen",
  k: "highlighter",
  e: "eraser",
};

export class ToolManager {
  /** Tool registry keyed by tool id. */
  private readonly tools = new Map<string, CanvasTool>();
  /** Currently active tool id. */
  private activeToolId: string | null = null;
  /** Engine reference used for dispatching. */
  private readonly engine: CanvasEngine;
  /** Whether middle-button panning is active. */
  private middlePanning = false;
  /** Pointer capture target for the active interaction. */
  private pointerCaptureTarget: Element | null = null;

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

    const captureTarget = this.resolvePointerCaptureTarget(event.target, event.currentTarget);
    if (captureTarget) {
      captureTarget.setPointerCapture(event.pointerId);
      this.pointerCaptureTarget = captureTarget;
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

    if (this.pointerCaptureTarget) {
      this.pointerCaptureTarget.releasePointerCapture(event.pointerId);
      this.pointerCaptureTarget = null;
    } else {
      const target = event.currentTarget;
      if (target instanceof Element) {
        target.releasePointerCapture(event.pointerId);
      }
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
    if (this.handleToolShortcut(event)) {
      return;
    }
    if (this.handleViewShortcut(event)) {
      return;
    }
    if (this.handleLockShortcut(event)) {
      return;
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

  /** Resolve the element that should receive pointer capture. */
  private resolvePointerCaptureTarget(
    target: EventTarget | null,
    fallback: EventTarget | null
  ): Element | null {
    const element =
      target instanceof Element
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
    if (element?.closest("[data-board-node]")) {
      return element;
    }
    return fallback instanceof Element ? fallback : null;
  }

  /** Handle tool switch shortcuts before routing to the active tool. */
  private handleToolShortcut(event: KeyboardEvent): boolean {
    // 逻辑：输入控件与组合键场景下不响应工具快捷键，避免误触。
    if (this.isEditableTarget(event.target)) return false;
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    const key = event.key.toLowerCase();
    const toolId = TOOL_SHORTCUTS[key];
    if (!toolId) return false;
    const isLockedTool = toolId === "pen" || toolId === "highlighter" || toolId === "eraser";
    if (this.engine.isLocked() && isLockedTool) {
      event.preventDefault();
      return true;
    }
    event.preventDefault();
    this.engine.setActiveTool(toolId);
    return true;
  }

  /** Handle view shortcuts that are not tied to a tool. */
  private handleViewShortcut(event: KeyboardEvent): boolean {
    // 逻辑：输入控件与组合键场景下不响应视图快捷键，避免误触。
    if (this.isEditableTarget(event.target)) return false;
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    const key = event.key.toLowerCase();
    if (key !== "f") return false;
    event.preventDefault();
    this.engine.fitToElements();
    return true;
  }

  /** Handle lock toggle shortcut (L). */
  private handleLockShortcut(event: KeyboardEvent): boolean {
    // 逻辑：输入控件内不响应锁定快捷键，避免误触。
    if (this.isEditableTarget(event.target)) return false;
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    const key = event.key.toLowerCase();
    if (key !== "l") return false;
    event.preventDefault();
    this.engine.setLocked(!this.engine.isLocked());
    return true;
  }

  /** Check if the key event target is an editable element. */
  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
  }
}
