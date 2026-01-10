import type {
  CanvasAnchorHit,
  CanvasNodeElement,
  CanvasPoint,
  CanvasRect,
} from "../engine/types";
import type { CanvasEngine } from "../engine/CanvasEngine";
import {
  DRAG_ACTIVATION_DISTANCE,
  GUIDE_MARGIN,
  MIN_ZOOM,
  SELECTION_BOX_THRESHOLD,
  SNAP_PIXEL,
} from "../engine/constants";
import { sortElementsByZIndex } from "../engine/element-order";
import {
  expandSelectionWithGroupChildren,
  resolveGroupSelectionId,
} from "../engine/grouping";
import { snapMoveRect } from "../utils/alignment-guides";
import type { CanvasTool, ToolContext } from "./ToolTypes";

// 逻辑：悬停判定比节点实际范围更大，延迟清理锚点避免闪烁。
const IMAGE_HOVER_PADDING = 36;
const HOVER_ANCHOR_CLEAR_DELAY = 200;

export class SelectTool implements CanvasTool {
  /** Tool identifier. */
  readonly id = "select";
  /** Dragging element id. */
  private draggingId: string | null = null;
  /** Draft connector source anchor. */
  private connectorSource: CanvasAnchorHit | null = null;
  /** Whether a new connector is being dragged. */
  private connectorDrafting = false;
  /** Dragging start point in world coordinates. */
  private dragStart: CanvasPoint | null = null;
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
  private readonly selectionThreshold = SELECTION_BOX_THRESHOLD;
  /** Snap pixel threshold in screen space. */
  private readonly snapPixel = SNAP_PIXEL;
  /** Guide margin in screen space. */
  private readonly guideMargin = GUIDE_MARGIN;
  /** Hover clear timeout id. */
  private hoverClearTimeout: number | null = null;

  /** Handle pointer down to perform hit testing and selection. */
  onPointerDown(ctx: ToolContext): void {
    if (ctx.event.button !== 0) return;
    if (ctx.engine.isToolbarDragging()) {
      ctx.event.preventDefault();
      return;
    }
    if (ctx.engine.getPendingInsert()) {
      ctx.event.preventDefault();
      return;
    }
    if (ctx.event.target instanceof Element) {
      // 逻辑：点击工具条或详情面板时不触发画布选择逻辑。
      if (
        ctx.event.target.closest("[data-canvas-toolbar]") ||
        ctx.event.target.closest("[data-board-controls]") ||
        ctx.event.target.closest("[data-node-toolbar]") ||
        ctx.event.target.closest("[data-node-inspector]") ||
        ctx.event.target.closest("[data-connector-action]") ||
        ctx.event.target.closest("[data-multi-resize-handle]")
      ) {
        return;
      }
    }
    const resolveNodeTarget = (target: EventTarget | null) => {
      const element =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null;
      return element?.closest("[data-board-node]") ?? null;
    };
    const isNodeTarget = Boolean(resolveNodeTarget(ctx.event.target));
    if (!isNodeTarget) {
      // 逻辑：非节点区域才阻止默认事件，避免干扰节点自身双击等交互。
      ctx.event.preventDefault();
    }
    const selectedIds = ctx.engine.selection.getSelectedIds();
    if (!ctx.engine.isLocked()) {
      if (ctx.event.target instanceof Element) {
        // 逻辑：命中缩放手柄时不触发连线。
        if (ctx.event.target.closest("[data-resize-handle]")) {
          return;
        }
      }
      const hoverAnchor = ctx.engine.getConnectorHover();
      const hoverAnchorId = hoverAnchor?.elementId;
      const anchorScope =
        hoverAnchorId && !selectedIds.includes(hoverAnchorId)
          ? [...selectedIds, hoverAnchorId]
          : selectedIds;
      // 逻辑：只有在锚点已显示并命中时才开始连线，避免误触。
      if (hoverAnchor) {
        const edgeHit = ctx.engine.findEdgeAnchorHit(
          ctx.worldPoint,
          undefined,
          anchorScope
        );
        if (
          edgeHit &&
          edgeHit.elementId === hoverAnchor.elementId &&
          edgeHit.anchorId === hoverAnchor.anchorId
        ) {
          this.connectorSource = edgeHit;
          this.connectorDrafting = true;
          ctx.engine.selection.setSelection([edgeHit.elementId]);
          ctx.engine.setConnectorDraft({
            source: { elementId: edgeHit.elementId, anchorId: edgeHit.anchorId },
            target: { point: ctx.worldPoint },
            style: ctx.engine.getConnectorStyle(),
          });
          ctx.engine.setConnectorHover(edgeHit);
          return;
        }
      }
    }

    const hit = ctx.engine.pickElementAt(ctx.worldPoint);
    if (!hit) {
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
    const isLockedNode = hit.locked === true;
    const elements = ctx.engine.doc.getElements();
    const selectionId = resolveGroupSelectionId(elements, hit);
    if (ctx.event.shiftKey) {
      if (isLockedNode) return;
      ctx.engine.selection.toggle(selectionId);
      return;
    }

    if (isLockedNode) {
      // 逻辑：锁定节点只能单选，禁止进入多选/拖拽。
      ctx.engine.selection.setSelection([hit.id]);
      return;
    }

    if (!ctx.engine.selection.isSelected(selectionId)) {
      ctx.engine.selection.setSelection([selectionId]);
    }
    if (ctx.engine.isLocked()) return;
    const nextSelected = ctx.engine.selection.getSelectedIds();
    const expandedSelected = expandSelectionWithGroupChildren(elements, nextSelected);
    const nodeIds = expandedSelected.filter(id => {
      const element = ctx.engine.doc.getElementById(id);
      return element?.kind === "node";
    });
    const effectiveIds =
      nodeIds.length > 0
        ? nodeIds
        : [selectionId];
    this.draggingId = selectionId;
    this.draggingIds = effectiveIds;
    this.dragStart = ctx.worldPoint;
    this.dragActivated = false;
    this.dragStartRects.clear();
    effectiveIds.forEach(id => {
      const element = ctx.engine.doc.getElementById(id);
      if (!element) return;
      if (element.kind === "node") {
        this.dragStartRects.set(id, [...element.xywh]);
        return;
      }
    });
    this.selectionStartWorld = null;
    this.selectionStartScreen = null;
    this.selectionBoxActive = false;
    ctx.engine.setSelectionBox(null);
  }

  /** Handle pointer move to drag selected nodes. */
  onPointerMove(ctx: ToolContext): void {
    const selectedIds = ctx.engine.selection.getSelectedIds();
    const hoverAnchor = ctx.engine.getConnectorHover();
    const hoverAnchorId = hoverAnchor?.elementId;
    const anchorScope =
      hoverAnchorId && !selectedIds.includes(hoverAnchorId)
        ? [...selectedIds, hoverAnchorId]
        : selectedIds;
    if (this.connectorDrafting && this.connectorSource) {
      this.cancelHoverClear();
      const targetNode = ctx.engine.findNodeAt(ctx.worldPoint);
      if (targetNode && targetNode.id !== this.connectorSource.elementId) {
        // 逻辑：拖拽过程中只要进入节点即可吸附，不要求命中边缘锚点。
        const hover = ctx.engine.getNearestEdgeAnchorHit(
          targetNode.id,
          this.connectorSource.point
        );
        if (hover) {
          ctx.engine.setConnectorHover(hover);
          ctx.engine.setConnectorDraft({
            source: {
              elementId: this.connectorSource.elementId,
              anchorId: this.connectorSource.anchorId,
            },
            target: { elementId: targetNode.id },
            style: ctx.engine.getConnectorStyle(),
          });
          return;
        }
      }

      const edgeHover = ctx.engine.findEdgeAnchorHit(
        ctx.worldPoint,
        {
          elementId: this.connectorSource.elementId,
          anchorId: this.connectorSource.anchorId,
        },
        anchorScope
      );
      ctx.engine.setConnectorHover(edgeHover);
      ctx.engine.setConnectorDraft({
        source: {
          elementId: this.connectorSource.elementId,
          anchorId: this.connectorSource.anchorId,
        },
        target: { point: ctx.worldPoint },
        style: ctx.engine.getConnectorStyle(),
      });
      return;
    }
    if (this.connectorDragId && this.connectorDragRole) {
      this.cancelHoverClear();
      if (ctx.engine.isLocked()) return;
      const hit = ctx.engine.findNodeAt(ctx.worldPoint);
      const hover = hit
        ? ctx.engine.getNearestEdgeAnchorHit(hit.id, ctx.worldPoint)
        : null;
      const end = hover ? { elementId: hit!.id } : { point: ctx.worldPoint };
      ctx.engine.updateConnectorEndpoint(
        this.connectorDragId,
        this.connectorDragRole,
        end
      );
      ctx.engine.setConnectorHover(hover);
      return;
    }
    if (this.selectionStartWorld || this.draggingId) {
      ctx.engine.setConnectorHoverId(null);
    }
    if (!this.selectionStartWorld && !this.draggingId) {
      const hoverNode = this.getHoverImageNode(ctx.engine, ctx.worldPoint, selectedIds);
      if (hoverNode) {
        const hover = this.getImageSideAnchorHit(hoverNode, ctx.worldPoint);
        ctx.engine.setConnectorHover(hover);
        this.cancelHoverClear();
      } else {
        const hover = ctx.engine.findEdgeAnchorHit(
          ctx.worldPoint,
          undefined,
          anchorScope
        );
        if (hover) {
          ctx.engine.setConnectorHover(hover);
          this.cancelHoverClear();
        } else {
          this.scheduleHoverClear(ctx.engine);
        }
      }
      const connectorHit = ctx.engine.pickElementAt(ctx.worldPoint);
      ctx.engine.setConnectorHoverId(
        connectorHit?.kind === "connector" ? connectorHit.id : null
      );
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
    if (!this.draggingId || !this.dragStart) return;
    if (ctx.engine.isLocked()) return;

    const dx = ctx.worldPoint[0] - this.dragStart[0];
    const dy = ctx.worldPoint[1] - this.dragStart[1];
    if (!this.dragActivated) {
      // 逻辑：设置最小拖拽阈值，避免轻触导致节点抖动。
      const distance = Math.hypot(dx, dy);
      if (distance < DRAG_ACTIVATION_DISTANCE) return;
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
    const draggingSet = new Set(this.draggingIds);
    const { zoom } = ctx.engine.viewport.getState();
    // 逻辑：阈值与边距随缩放换算，保证屏幕体验一致。
    const threshold = this.snapPixel / Math.max(zoom, MIN_ZOOM);
    const margin = this.guideMargin / Math.max(zoom, MIN_ZOOM);
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
        const element = ctx.engine.doc.getElementById(id);
        if (!element) return;
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
    if (this.connectorDrafting && this.connectorSource) {
      const draft = ctx.engine.getConnectorDraft();
      let keepDraft = false;
      if (draft) {
        const isSameElement =
          "elementId" in draft.target &&
          draft.target.elementId === this.connectorSource.elementId;
        if ("point" in draft.target) {
          // 逻辑：拖到空白处触发组件选择面板。
          ctx.engine.setConnectorDrop({
            source: draft.source,
            point: draft.target.point,
          });
          keepDraft = true;
        } else if (!isSameElement) {
          ctx.engine.addConnectorElement(draft);
        }
      }

      if (!keepDraft) {
        // 逻辑：只有显示插入面板时才保留草稿连线。
        ctx.engine.setConnectorDraft(null);
      }
      ctx.engine.setConnectorHover(null);
      this.connectorSource = null;
      this.connectorDrafting = false;
      return;
    }
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
    this.dragActivated = false;
    this.cancelHoverClear();
  }

  /** Handle keyboard shortcuts for selection. */
  onKeyDown(event: KeyboardEvent, engine: CanvasEngine): void {
    if (isEditableTarget(event.target)) return;
    const isMeta = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (isMeta) {
      if (key === "z") {
        event.preventDefault();
        // 逻辑：画布锁定时禁用撤销/重做快捷键。
        if (engine.isLocked()) return;
        if (event.shiftKey) {
          engine.redo();
          return;
        }
        engine.undo();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        // 逻辑：画布锁定时禁用撤销/重做快捷键。
        if (engine.isLocked()) return;
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

  /** Resolve the nearest side anchor for a hovered image node. */
  private getImageSideAnchorHit(
    element: CanvasNodeElement,
    point: CanvasPoint
  ): CanvasAnchorHit | null {
    const [x, y, w, h] = element.xywh;
    const centerX = x + w / 2;
    const anchorId = point[0] <= centerX ? "left" : "right";
    // 逻辑：悬停时仅返回左右锚点，保持与选中态一致。
    const anchorPoint: CanvasPoint =
      anchorId === "left" ? [x, y + h / 2] : [x + w, y + h / 2];
    return {
      elementId: element.id,
      anchorId,
      point: anchorPoint,
    };
  }

  /** Find the top-most hovered image node with expanded hit area. */
  private getHoverImageNode(
    engine: CanvasEngine,
    point: CanvasPoint,
    selectedIds: string[]
  ): CanvasNodeElement | null {
    const { zoom } = engine.viewport.getState();
    // 逻辑：悬停范围比节点大一圈，便于拖出锚点。
    const padding = IMAGE_HOVER_PADDING / Math.max(zoom, MIN_ZOOM);
    const elements = sortElementsByZIndex(engine.doc.getElements());
    for (let i = elements.length - 1; i >= 0; i -= 1) {
      const element = elements[i];
      if (!element || element.kind !== "node") continue;
      if (element.type !== "image") continue;
      if (element.locked) continue;
      if (selectedIds.includes(element.id)) continue;
      const [x, y, w, h] = element.xywh;
      const within =
        point[0] >= x - padding &&
        point[0] <= x + w + padding &&
        point[1] >= y - padding &&
        point[1] <= y + h + padding;
      if (within) return element;
    }
    return null;
  }

  /** Schedule clearing the hover anchor with a short delay. */
  private scheduleHoverClear(engine: CanvasEngine): void {
    if (this.hoverClearTimeout) return;
    this.hoverClearTimeout = window.setTimeout(() => {
      engine.setConnectorHover(null);
      this.hoverClearTimeout = null;
    }, HOVER_ANCHOR_CLEAR_DELAY);
  }

  /** Cancel any pending hover clear. */
  private cancelHoverClear(): void {
    if (!this.hoverClearTimeout) return;
    window.clearTimeout(this.hoverClearTimeout);
    this.hoverClearTimeout = null;
  }

  /** Check elements intersecting with the selection rectangle. */
  private pickNodesInRect(rect: CanvasRect, engine: CanvasEngine): string[] {
    const elements = engine.doc.getElements();
    const hits = elements
      .filter(element => element.kind === "node")
      .filter(element => !element.locked)
      .filter(element => this.rectsIntersect(rect, element));
    const selectionIds = new Set<string>();
    hits.forEach(element => {
      selectionIds.add(resolveGroupSelectionId(elements, element));
    });
    return Array.from(selectionIds);
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
