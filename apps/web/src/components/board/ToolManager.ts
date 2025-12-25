import type { CanvasAnchorHit, CanvasPoint, CanvasRect } from "./CanvasTypes";
import type { CanvasEngine } from "./CanvasEngine";
import { snapMoveRect } from "./utils/alignment-guides";

/** Tool context passed to tool handlers. */
export type ToolContext = {
  /** Engine instance for querying and updates. */
  engine: CanvasEngine;
  /** Raw pointer event from the browser. */
  event: PointerEvent;
  /** Pointer position in screen space. */
  screenPoint: CanvasPoint;
  /** Pointer position in world space. */
  worldPoint: CanvasPoint;
};

/** Contract for canvas tools. */
export type CanvasTool = {
  /** Tool identifier. */
  id: string;
  /** Pointer down handler. */
  onPointerDown?: (ctx: ToolContext) => void;
  /** Pointer move handler. */
  onPointerMove?: (ctx: ToolContext) => void;
  /** Pointer up handler. */
  onPointerUp?: (ctx: ToolContext) => void;
  /** Keyboard handler. */
  onKeyDown?: (event: KeyboardEvent, engine: CanvasEngine) => void;
};

export class ToolManager {
  /** Tool registry keyed by tool id. */
  private readonly tools = new Map<string, CanvasTool>();
  /** Currently active tool id. */
  private activeToolId: string | null = null;
  /** Engine reference used for dispatching. */
  private readonly engine: CanvasEngine;

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
    const ctx = this.buildContext(event);
    if (!ctx) return;

    const target = event.currentTarget;
    if (target instanceof HTMLElement) {
      target.setPointerCapture(event.pointerId);
    }

    // 将输入事件统一转换为世界坐标，再交由工具处理。
    this.getActiveTool()?.onPointerDown?.(ctx);
  }

  /** Handle pointer move events from the canvas container. */
  handlePointerMove(event: PointerEvent): void {
    const ctx = this.buildContext(event);
    if (!ctx) return;
    this.getActiveTool()?.onPointerMove?.(ctx);
  }

  /** Handle pointer up events from the canvas container. */
  handlePointerUp(event: PointerEvent): void {
    const ctx = this.buildContext(event);
    if (!ctx) return;

    const target = event.currentTarget;
    if (target instanceof HTMLElement) {
      target.releasePointerCapture(event.pointerId);
    }
    this.getActiveTool()?.onPointerUp?.(ctx);
  }

  /** Handle key down events from the canvas container. */
  handleKeyDown(event: KeyboardEvent): void {
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
    const worldPoint = this.engine.viewport.toWorld(screenPoint);
    return {
      engine: this.engine,
      event,
      screenPoint,
      worldPoint,
    };
  }
}

export class SelectTool implements CanvasTool {
  /** Tool identifier. */
  readonly id = "select";
  /** Dragging element id. */
  private draggingId: string | null = null;
  /** Dragging start point in world coordinates. */
  private dragStart: CanvasPoint | null = null;
  /** Dragging start bounds for the element. */
  private dragStartXYWH: [number, number, number, number] | null = null;
  /** Whether the drag threshold has been passed. */
  private dragActivated = false;
  /** Connector endpoint dragging id. */
  private connectorDragId: string | null = null;
  /** Connector endpoint role being dragged. */
  private connectorDragRole: "source" | "target" | null = null;
  /** Selected node ids involved in dragging. */
  private draggingIds: string[] = [];
  /** Drag start rectangles for selected nodes. */
  private dragStartRects = new Map<string, [number, number, number, number]>();
  /** Selection box start point in world coordinates. */
  private selectionStartWorld: CanvasPoint | null = null;
  /** Selection box start point in screen coordinates. */
  private selectionStartScreen: CanvasPoint | null = null;
  /** Whether rectangle selection is active. */
  private selectionBoxActive = false;
  /** Selection ids before rectangle selection. */
  private selectionBaseIds: string[] = [];
  /** Whether rectangle selection is additive. */
  private selectionAdditive = false;
  /** Selection drag threshold in screen pixels. */
  private readonly selectionThreshold = 4;
  /** Snap pixel threshold in screen space. */
  private readonly snapPixel = 8;
  /** Guide margin in screen space. */
  private readonly guideMargin = 16;

  /** Handle pointer down to perform hit testing and selection. */
  onPointerDown(ctx: ToolContext): void {
    if (ctx.event.button !== 0) return;
    ctx.event.preventDefault();
    const hit = ctx.engine.pickElementAt(ctx.worldPoint);
    if (!hit) {
      const selectedIds = ctx.engine.selection.getSelectedIds();
      // 逻辑：空白点击时优先命中已选连线端点，便于快速重连。
      if (!ctx.event.shiftKey && selectedIds.length > 0 && !ctx.engine.isLocked()) {
        const endpointHit = ctx.engine.findConnectorEndpointHit(
          ctx.worldPoint,
          selectedIds
        );
        if (endpointHit) {
          this.connectorDragId = endpointHit.connectorId;
          this.connectorDragRole = endpointHit.role;
          ctx.engine.setDraggingElementId(endpointHit.connectorId);
          return;
        }
      }

      // 逻辑：空白拖拽进入框选，按住 Shift 保留原选区。
      this.selectionAdditive = ctx.event.shiftKey;
      this.selectionBaseIds = this.selectionAdditive ? selectedIds : [];
      this.selectionStartWorld = ctx.worldPoint;
      this.selectionStartScreen = ctx.screenPoint;
      this.selectionBoxActive = false;
      this.draggingId = null;
      this.draggingIds = [];
      this.dragStartRects.clear();
      if (!this.selectionAdditive) {
        ctx.engine.selection.clear();
      }
      ctx.engine.setAlignmentGuides([]);
      ctx.engine.setSelectionBox(null);
      return;
    }

    ctx.engine.setAlignmentGuides([]);
    ctx.engine.setSelectionBox(null);
    this.selectionStartWorld = null;
    this.selectionStartScreen = null;
    this.selectionBoxActive = false;

    if (hit.kind === "connector") {
      ctx.engine.selection.setSelection([hit.id]);
      ctx.engine.setConnectorStyle(hit.style ?? ctx.engine.getConnectorStyle(), {
        applyToSelection: false,
      });
      if (ctx.engine.isLocked()) return;
      const endpointHit = ctx.engine.findConnectorEndpointHit(ctx.worldPoint, [
        hit.id,
      ]);
      if (endpointHit) {
        this.connectorDragId = endpointHit.connectorId;
        this.connectorDragRole = endpointHit.role;
        ctx.engine.setDraggingElementId(endpointHit.connectorId);
      }
      return;
    }
    if (hit.kind !== "node") return;
    if (ctx.event.shiftKey) {
      ctx.engine.selection.toggle(hit.id);
      return;
    }

    const groupId = (hit.meta as Record<string, unknown> | undefined)?.groupId;
    if (typeof groupId === "string") {
      ctx.engine.selection.setSelection(ctx.engine.getGroupMemberIds(groupId));
    } else if (!ctx.engine.selection.isSelected(hit.id)) {
      ctx.engine.selection.setSelection([hit.id]);
    }
    if (ctx.engine.isLocked()) return;
    const nextSelected = ctx.engine.selection.getSelectedIds();
    const nodeIds = nextSelected.filter(id => {
      const element = ctx.engine.doc.getElementById(id);
      return element?.kind === "node";
    });
    const effectiveIds = nodeIds.length > 0 ? nodeIds : [hit.id];
    this.draggingId = hit.id;
    this.draggingIds = effectiveIds;
    this.dragStart = ctx.worldPoint;
    this.dragStartXYWH = [...hit.xywh];
    this.dragActivated = false;
    this.dragStartRects.clear();
    effectiveIds.forEach(id => {
      const element = ctx.engine.doc.getElementById(id);
      if (element && element.kind === "node") {
        this.dragStartRects.set(id, [...element.xywh]);
      }
    });
    this.selectionStartWorld = null;
    this.selectionStartScreen = null;
    this.selectionBoxActive = false;
    ctx.engine.setSelectionBox(null);
  }

  /** Handle pointer move to drag selected nodes. */
  onPointerMove(ctx: ToolContext): void {
    if (this.connectorDragId && this.connectorDragRole) {
      if (ctx.engine.isLocked()) return;
      const hit = ctx.engine.findAnchorHit(ctx.worldPoint);
      const end = hit
        ? { elementId: hit.elementId, anchorId: hit.anchorId }
        : { point: ctx.worldPoint };
      ctx.engine.updateConnectorEndpoint(
        this.connectorDragId,
        this.connectorDragRole,
        end
      );
      ctx.engine.setConnectorHover(hit);
      return;
    }
    if (this.selectionStartWorld && this.selectionStartScreen) {
      const dx = ctx.screenPoint[0] - this.selectionStartScreen[0];
      const dy = ctx.screenPoint[1] - this.selectionStartScreen[1];
      const distance = Math.hypot(dx, dy);
      if (!this.selectionBoxActive && distance < this.selectionThreshold) return;
      this.selectionBoxActive = true;
      const rect = this.buildSelectionRect(this.selectionStartWorld, ctx.worldPoint);
      ctx.engine.setSelectionBox(rect);
      const hits = this.pickNodesInRect(rect, ctx.engine);
      if (this.selectionAdditive) {
        const merged = new Set([...this.selectionBaseIds, ...hits]);
        ctx.engine.selection.setSelection(Array.from(merged));
      } else {
        ctx.engine.selection.setSelection(hits);
      }
      return;
    }
    if (!this.draggingId || !this.dragStart || !this.dragStartXYWH) return;
    if (ctx.engine.isLocked()) return;

    const dx = ctx.worldPoint[0] - this.dragStart[0];
    const dy = ctx.worldPoint[1] - this.dragStart[1];
    if (!this.dragActivated) {
      // 逻辑：设置最小拖拽阈值，避免轻触导致节点抖动。
      const distance = Math.hypot(dx, dy);
      if (distance < 2) return;
      this.dragActivated = true;
      ctx.engine.setDraggingElementId(this.draggingId);
    }

    const group = this.getDragGroupBounds();
    if (!group) return;
    const nextRect: CanvasRect = {
      x: group.x + dx,
      y: group.y + dy,
      w: group.w,
      h: group.h,
    };
    const { zoom } = ctx.engine.viewport.getState();
    // 逻辑：阈值与边距随缩放换算，保证屏幕体验一致。
    const threshold = this.snapPixel / Math.max(zoom, 0.1);
    const margin = this.guideMargin / Math.max(zoom, 0.1);
    const draggingSet = new Set(this.draggingIds);
    const others = ctx.engine.doc
      .getElements()
      .filter(
        element => element.kind === "node" && !draggingSet.has(element.id)
      )
      .map(element => {
        const [x, y, width, height] = element.xywh;
        return { x, y, w: width, h: height };
      });

    const snapped = snapMoveRect(nextRect, others, threshold, margin);
    const snappedDx = snapped.rect.x - group.x;
    const snappedDy = snapped.rect.y - group.y;
    ctx.engine.doc.transact(() => {
      this.draggingIds.forEach(id => {
        const startRect = this.dragStartRects.get(id);
        if (!startRect) return;
        ctx.engine.doc.updateElement(id, {
          xywh: [
            startRect[0] + snappedDx,
            startRect[1] + snappedDy,
            startRect[2],
            startRect[3],
          ],
        });
      });
    });
    ctx.engine.setAlignmentGuides(snapped.guides);
  }

  /** Handle pointer up to stop dragging. */
  onPointerUp(ctx: ToolContext): void {
    if (this.connectorDragId) {
      ctx.engine.setDraggingElementId(null);
      ctx.engine.setConnectorHover(null);
      ctx.engine.commitHistory();
      this.connectorDragId = null;
      this.connectorDragRole = null;
      return;
    }
    if (this.selectionStartWorld) {
      ctx.engine.setSelectionBox(null);
      this.selectionStartWorld = null;
      this.selectionStartScreen = null;
      this.selectionBoxActive = false;
      this.selectionBaseIds = [];
      this.selectionAdditive = false;
    }
    if (this.draggingId) {
      ctx.engine.setDraggingElementId(null);
    }
    ctx.engine.setAlignmentGuides([]);
    if (this.dragActivated && this.draggingIds.length > 0) {
      ctx.engine.commitHistory();
    }
    this.draggingId = null;
    this.draggingIds = [];
    this.dragStartRects.clear();
    this.dragStart = null;
    this.dragStartXYWH = null;
    this.dragActivated = false;
  }

  /** Handle keyboard shortcuts for selection. */
  onKeyDown(event: KeyboardEvent, engine: CanvasEngine): void {
    if (isEditableTarget(event.target)) return;
    const isMeta = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (isMeta) {
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          engine.redo();
          return;
        }
        engine.undo();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        engine.redo();
        return;
      }
      if (key === "c") {
        event.preventDefault();
        engine.copySelection();
        return;
      }
      if (key === "x") {
        event.preventDefault();
        engine.cutSelection();
        return;
      }
      if (key === "v") {
        event.preventDefault();
        engine.pasteClipboard();
        return;
      }
      if (key === "g") {
        event.preventDefault();
        if (event.shiftKey) {
          engine.ungroupSelection();
        } else {
          engine.groupSelection();
        }
        return;
      }
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      engine.deleteSelection();
      return;
    }

    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      switch (event.key) {
        case "ArrowUp":
          engine.nudgeSelection(0, -step);
          break;
        case "ArrowDown":
          engine.nudgeSelection(0, step);
          break;
        case "ArrowLeft":
          engine.nudgeSelection(-step, 0);
          break;
        case "ArrowRight":
          engine.nudgeSelection(step, 0);
          break;
        default:
          break;
      }
    }
  }

  /** Compute selection rectangle from start/end world points. */
  private buildSelectionRect(start: CanvasPoint, end: CanvasPoint): CanvasRect {
    const x = Math.min(start[0], end[0]);
    const y = Math.min(start[1], end[1]);
    const w = Math.abs(end[0] - start[0]);
    const h = Math.abs(end[1] - start[1]);
    return { x, y, w, h };
  }

  /** Check nodes intersecting with the selection rectangle. */
  private pickNodesInRect(rect: CanvasRect, engine: CanvasEngine): string[] {
    return engine.doc
      .getElements()
      .filter(element => element.kind === "node")
      .filter(element => this.rectsIntersect(rect, element))
      .map(element => element.id);
  }

  /** Check whether two rectangles intersect. */
  private rectsIntersect(a: CanvasRect, b: { xywh: [number, number, number, number] }): boolean {
    const [bx, by, bw, bh] = b.xywh;
    const aRight = a.x + a.w;
    const aBottom = a.y + a.h;
    const bRight = bx + bw;
    const bBottom = by + bh;
    return a.x <= bRight && aRight >= bx && a.y <= bBottom && aBottom >= by;
  }

  /** Compute the bounding rect for the current drag group. */
  private getDragGroupBounds(): CanvasRect | null {
    if (this.dragStartRects.size === 0) return null;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    this.dragStartRects.forEach(rect => {
      const [x, y, w, h] = rect;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
}

/** Check if the event target is an editable element. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export class HandTool implements CanvasTool {
  /** Tool identifier. */
  readonly id = "hand";
  /** Panning start point in screen coordinates. */
  private panStart: CanvasPoint | null = null;
  /** Panning start offset. */
  private panOffset: CanvasPoint | null = null;

  /** Begin viewport panning. */
  onPointerDown(ctx: ToolContext): void {
    ctx.event.preventDefault();
    const { offset } = ctx.engine.viewport.getState();
    this.panStart = ctx.screenPoint;
    this.panOffset = offset;
    ctx.engine.setPanning(true);
  }

  /** Update viewport panning position. */
  onPointerMove(ctx: ToolContext): void {
    if (!this.panStart || !this.panOffset) return;

    const dx = ctx.screenPoint[0] - this.panStart[0];
    const dy = ctx.screenPoint[1] - this.panStart[1];
    ctx.engine.viewport.setOffset([this.panOffset[0] + dx, this.panOffset[1] + dy]);
  }

  /** Stop viewport panning. */
  onPointerUp(ctx: ToolContext): void {
    ctx.engine.setPanning(false);
    this.panStart = null;
    this.panOffset = null;
  }
}

export class ConnectorTool implements CanvasTool {
  /** Tool identifier. */
  readonly id = "connector";
  /** Source anchor for the draft connector. */
  private source: CanvasAnchorHit | null = null;
  /** Whether the connector tool is dragging. */
  private dragging = false;

  /** Begin creating a connector from an anchor. */
  onPointerDown(ctx: ToolContext): void {
    if (ctx.event.button !== 0) return;
    ctx.event.preventDefault();
    if (ctx.engine.isLocked()) return;

    const hit = ctx.engine.findAnchorHit(ctx.worldPoint);
    if (!hit) {
      ctx.engine.selection.clear();
      ctx.engine.setConnectorHover(null);
      return;
    }

    this.source = hit;
    this.dragging = true;
    ctx.engine.selection.setSelection([hit.elementId]);
    ctx.engine.setConnectorDraft({
      source: { elementId: hit.elementId, anchorId: hit.anchorId },
      target: { point: ctx.worldPoint },
      style: ctx.engine.getConnectorStyle(),
    });
    ctx.engine.setConnectorHover(hit);
  }

  /** Update connector draft while dragging. */
  onPointerMove(ctx: ToolContext): void {
    if (!this.dragging || !this.source) {
      const hover = ctx.engine.findAnchorHit(ctx.worldPoint);
      ctx.engine.setConnectorHover(hover);
      return;
    }

    const hit = ctx.engine.findAnchorHit(ctx.worldPoint, {
      elementId: this.source.elementId,
      anchorId: this.source.anchorId,
    });

    if (hit) {
      ctx.engine.setConnectorHover(hit);
      ctx.engine.setConnectorDraft({
        source: {
          elementId: this.source.elementId,
          anchorId: this.source.anchorId,
        },
        target: { elementId: hit.elementId, anchorId: hit.anchorId },
        style: ctx.engine.getConnectorStyle(),
      });
      return;
    }

    ctx.engine.setConnectorHover(null);
    ctx.engine.setConnectorDraft({
      source: {
        elementId: this.source.elementId,
        anchorId: this.source.anchorId,
      },
      target: { point: ctx.worldPoint },
      style: ctx.engine.getConnectorStyle(),
    });
  }

  /** Finish creating the connector. */
  onPointerUp(ctx: ToolContext): void {
    if (!this.dragging || !this.source) {
      ctx.engine.setConnectorHover(null);
      return;
    }

    const draft = ctx.engine.getConnectorDraft();
    if (draft) {
      const isSameAnchor =
        "elementId" in draft.target &&
        draft.target.elementId === this.source.elementId &&
        draft.target.anchorId === this.source.anchorId;
      if (!isSameAnchor) {
        ctx.engine.addConnectorElement(draft);
      }
    }

    ctx.engine.setConnectorDraft(null);
    ctx.engine.setConnectorHover(null);
    this.source = null;
    this.dragging = false;
  }
}
