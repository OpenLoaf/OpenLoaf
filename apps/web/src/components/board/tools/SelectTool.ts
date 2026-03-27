/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type {
  CanvasAnchorHit,
  CanvasNodeElement,
  CanvasPoint,
  CanvasRect,
  ConnectorDragDirection,
} from "../engine/types";
import {
  DRAG_ACTIVATION_DISTANCE,
  GRID_SIZE,
  MIN_ZOOM,
  SELECTION_BOX_THRESHOLD,
} from "../engine/constants";
import { MINDMAP_META } from "../engine/mindmap-layout";
import { sortElementsByZIndex } from "../engine/element-order";
import {
  expandSelectionWithGroupChildren,
  getGroupOutlinePadding,
  getNodeGroupId,
  isGroupNodeType,
  resolveGroupSelectionId,
} from "../engine/grouping";
import { LARGE_ANCHOR_NODE_TYPES } from "../engine/anchorTypes";
import { getAnchorDirection } from "../engine/anchor-direction";
import { validateConnection } from "../engine/connection-validator";
import type { CanvasTool, CanvasToolHost, ToolContext } from "./ToolTypes";

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
  /** Direction of the connector drag: forward (right→downstream) or backward (left→upstream). */
  private connectorDirection: ConnectorDragDirection = 'forward';
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
  /** Pending selection id — set on pointerDown, applied on pointerUp if no drag occurred. */
  private pendingSelectionId: string | null = null;
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
  /** Pending selection box end point. */
  private selectionPendingWorld: CanvasPoint | null = null;
  /** Selection update animation frame id. */
  private selectionFrameId: number | null = null;
  /** Selection update throttle timeout id. */
  private selectionThrottleTimeout: number | null = null;
  /** Last selection update timestamp. */
  private selectionLastUpdateTime = 0;
  /** Minimum interval for selection update. */
  private readonly selectionThrottleMs = 1000 / 30;
  /** Selection drag threshold in screen pixels. */
  private readonly selectionThreshold = SELECTION_BOX_THRESHOLD;
  /** Hover clear timeout id. */
  private hoverClearTimeout: number | null = null;
  /** Cached drag group bounds (computed once at drag activation). */
  private cachedDragGroupBounds: CanvasRect | null = null;
  /** Cached set of dragging ids. */
  private cachedDraggingSet: Set<string> | null = null;
  /** Last pointer position for frame-to-frame velocity calculation. */
  private lastMovePoint: CanvasPoint | null = null;
  /** Tilt auto-reset debounce timer id. */
  private tiltResetTimer: number | null = null;

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
        ctx.event.target.closest("[data-multi-resize-handle]") ||
        ctx.event.target.closest('[data-slot="checkbox"]')
      ) {
        return;
      }
    }
    const isNodeTarget = ctx.engine.pickElementAt(ctx.worldPoint)?.kind === "node";
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
          // 逻辑：左锚点（input）拖出 → backward（向上游连接），其余 → forward（向下游连接）。
          this.connectorDirection =
            getAnchorDirection(edgeHit.anchorId) === 'input' ? 'backward' : 'forward';
          // 逻辑：拖线期间清空选区，避免源节点保持选中高亮干扰视觉。
          ctx.engine.selection.clear();
          ctx.engine.setConnectorDraft({
            source: { elementId: edgeHit.elementId, anchorId: edgeHit.anchorId },
            target: { point: ctx.worldPoint },
            style: ctx.engine.getConnectorStyle(),
            dashed: ctx.engine.getConnectorDashed(),
          });
          ctx.engine.setConnectorHover(edgeHit);
          return;
        }
      }
    }

    const hit = ctx.engine.pickElementAt(ctx.worldPoint);
    if (!hit) {
      // 逻辑：单选模式下禁止框选，直接清空选区返回。
      if (ctx.engine.isSingleSelectOnly()) {
        ctx.engine.selection.clear();
        return;
      }
      // 逻辑：空白拖拽进入框选，按住 Shift 保留原选区。
      this.selectionAdditive = ctx.event.shiftKey;
      this.selectionBaseIds = this.selectionAdditive ? selectedIds : [];
      this.selectionStartWorld = ctx.worldPoint;
      this.selectionStartScreen = ctx.screenPoint;
      this.selectionBoxActive = false;
      // 逻辑：重新开始框选时清理待处理的帧更新。
      this.cancelSelectionUpdate();
      this.selectionPendingWorld = null;
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
    ctx.engine.setSelectionClickPoint(null);
    this.selectionStartWorld = null;
    this.selectionStartScreen = null;
    this.selectionBoxActive = false;

    if (hit.kind === "connector") {
      ctx.engine.selection.setSelection([hit.id]);
      ctx.engine.setSelectionClickPoint(ctx.worldPoint);
      ctx.engine.setConnectorStyle(hit.style ?? ctx.engine.getConnectorStyle(), {
        applyToSelection: false,
      });
      if (ctx.engine.isLocked()) return;
      return;
    }
    if (hit.kind !== "node") return;
    const isLockedNode = hit.locked === true;
    const elements = ctx.engine.doc.getElements();
    const selectionId = resolveGroupSelectionId(elements, hit);
    if (ctx.event.shiftKey && !ctx.engine.isSingleSelectOnly()) {
      if (isLockedNode) return;
      ctx.engine.selection.toggle(selectionId);
      return;
    }

    if (isLockedNode) {
      // 逻辑：锁定节点只能单选，禁止进入多选/拖拽。
      ctx.engine.selection.setSelection([hit.id]);
      return;
    }

    // 逻辑：pointerDown 时不立刻 setSelection，防止拖拽前闪现选中态 UI。
    // 延迟到 pointerUp 确认是点击（非拖拽）时才设置选区（见 pendingSelectionId）。
    const wasSelected = ctx.engine.selection.isSelected(selectionId);
    if (!wasSelected) {
      this.pendingSelectionId = selectionId;
    }
    if (ctx.engine.isLocked()) return;
    // 逻辑：已选中节点用当前选区计算拖拽列表；未选中节点用 pending id 计算，不依赖 selection。
    const nextSelected = wasSelected
      ? ctx.engine.selection.getSelectedIds()
      : [selectionId];
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
    // 逻辑：静默更新鼠标世界坐标，供锚点磁吸动画 RAF 读取（不触发 React 渲染）。
    ctx.engine.setCursorWorld(ctx.worldPoint);
    const selectedIds = ctx.engine.selection.getSelectedIds();
    if (this.connectorDrafting && this.connectorSource) {
      this.cancelHoverClear();
      const targetNode = ctx.engine.findNodeAt(ctx.worldPoint);
      if (targetNode && targetNode.id !== this.connectorSource.elementId) {
        // 逻辑：根据拖拽方向提供锚点吸附提示，forward 吸附左侧 input，backward 吸附右侧 output。
        const anchorHint = this.getDirectionalAnchorHint(targetNode);
        const hover = ctx.engine.getNearestEdgeAnchorHit(
          targetNode.id,
          anchorHint
        );
        if (hover) {
          // 逻辑：在吸附到目标前先验证连接合法性，不合法时记录原因供视觉反馈使用。
          // backward 拖拽时 mouseUp 会交换 source/target，验证需用交换后的方向。
          const sourceNode = ctx.engine.doc.getElementById(this.connectorSource.elementId);
          const isBackward = this.connectorDirection === 'backward';
          const validation = sourceNode && sourceNode.kind === 'node'
            ? validateConnection(
                isBackward ? targetNode : sourceNode,
                isBackward ? hover.anchorId : this.connectorSource.anchorId,
                isBackward ? sourceNode : targetNode,
                isBackward ? this.connectorSource.anchorId : hover.anchorId,
                (type) => ctx.engine.getNodeDefinition(type),
              )
            : { valid: true };
          ctx.engine.setConnectorValidation(validation);

          // 逻辑：方向不匹配时不吸附，让连线跟随鼠标，避免误连同向锚点。
          if (!validation.valid && validation.reason === 'direction-mismatch') {
            ctx.engine.setNodeHoverId(null);
            ctx.engine.setConnectorHover(null);
            ctx.engine.setConnectorDraft({
              source: {
                elementId: this.connectorSource.elementId,
                anchorId: this.connectorSource.anchorId,
              },
              target: { point: ctx.worldPoint },
              style: ctx.engine.getConnectorStyle(),
              dashed: ctx.engine.getConnectorDashed(),
            });
            return;
          }

          // 逻辑：类型不兼容时仍吸附（显示红色锚点提示），但保留验证结果供 AnchorOverlay 消费。
          const isLargeAnchorTarget = LARGE_ANCHOR_NODE_TYPES.has(targetNode.type);
          ctx.engine.setNodeHoverId(isLargeAnchorTarget ? targetNode.id : null);
          const anchorScope =
            isLargeAnchorTarget && !selectedIds.includes(targetNode.id)
              ? [...selectedIds, targetNode.id]
              : selectedIds;
          // 逻辑：仅在命中锚点 icon 时才标记 hover，用于触发大小变化。
          ctx.engine.setConnectorHover(
            ctx.engine.findEdgeAnchorHit(ctx.worldPoint, undefined, anchorScope)
          );
          ctx.engine.setConnectorDraft({
            source: {
              elementId: this.connectorSource.elementId,
              anchorId: this.connectorSource.anchorId,
            },
            target: { elementId: targetNode.id },
            style: ctx.engine.getConnectorStyle(),
            dashed: ctx.engine.getConnectorDashed(),
          });
          return;
        }
      }

      // 逻辑：未悬停在目标节点上时清空验证状态。
      ctx.engine.setConnectorValidation(null);
      ctx.engine.setNodeHoverId(null);
      const edgeHover = ctx.engine.findEdgeAnchorHit(ctx.worldPoint, undefined, selectedIds);
      ctx.engine.setConnectorHover(edgeHover);
      ctx.engine.setConnectorDraft({
        source: {
          elementId: this.connectorSource.elementId,
          anchorId: this.connectorSource.anchorId,
        },
        target: { point: ctx.worldPoint },
        style: ctx.engine.getConnectorStyle(),
        dashed: ctx.engine.getConnectorDashed(),
      });
      return;
    }
    if (this.connectorDragId && this.connectorDragRole) {
      this.cancelHoverClear();
      if (ctx.engine.isLocked()) return;
      const hit = ctx.engine.findNodeAt(ctx.worldPoint);
      const isLargeAnchorHit = Boolean(hit && LARGE_ANCHOR_NODE_TYPES.has(hit.type));
      ctx.engine.setNodeHoverId(isLargeAnchorHit ? hit!.id : null);
      const hover = hit
        ? ctx.engine.getNearestEdgeAnchorHit(hit.id, ctx.worldPoint)
        : null;
      const end = hover ? { elementId: hit!.id } : { point: ctx.worldPoint };
      ctx.engine.updateConnectorEndpoint(
        this.connectorDragId,
        this.connectorDragRole,
        end
      );
      const anchorScope =
        isLargeAnchorHit ? [...selectedIds, hit!.id] : selectedIds;
      ctx.engine.setConnectorHover(
        ctx.engine.findEdgeAnchorHit(ctx.worldPoint, undefined, anchorScope)
      );
      return;
    }
    if (this.selectionStartWorld || this.draggingId) {
      ctx.engine.setConnectorHoverId(null);
    }
    if (!this.selectionStartWorld && !this.draggingId) {
      const hoverNode = this.getHoverAnchorNode(
        ctx.engine,
        ctx.worldPoint,
        selectedIds
      );
      if (hoverNode) {
        ctx.engine.setNodeHoverId(hoverNode.id);
        this.cancelHoverClear();
      } else {
        this.scheduleHoverClear(ctx.engine);
      }
      const hoverNodeId = ctx.engine.getNodeHoverId();
      const hoverScope =
        hoverNodeId && !selectedIds.includes(hoverNodeId)
          ? [...selectedIds, hoverNodeId]
          : selectedIds;
      ctx.engine.setConnectorHover(
        ctx.engine.findEdgeAnchorHit(ctx.worldPoint, undefined, hoverScope)
      );
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
      if (!this.selectionBoxActive) {
        this.selectionBoxActive = true;
      }
      // 逻辑：框选框的视觉位置每帧更新（流畅），节点选区计算仍然节流（性能）。
      const rect = this.buildSelectionRect(this.selectionStartWorld, ctx.worldPoint);
      ctx.engine.setSelectionBox(rect);
      this.scheduleSelectionUpdate(ctx.engine, ctx.worldPoint);
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
      this.cachedDragGroupBounds = this.getDragGroupBounds();
      this.cachedDraggingSet = new Set(this.draggingIds);
    }

    const group = this.cachedDragGroupBounds;
    if (!group) return;
    let finalDx = dx;
    let finalDy = dy;
    // 逻辑：3D 透视倾斜 — 基于帧间速度（非总位移）计算 tilt，停止移动后防抖归零。
    const frameDx = this.lastMovePoint ? ctx.worldPoint[0] - this.lastMovePoint[0] : 0;
    const frameDy = this.lastMovePoint ? ctx.worldPoint[1] - this.lastMovePoint[1] : 0;
    this.lastMovePoint = ctx.worldPoint;
    const tiltX = Math.max(-4, Math.min(4, frameDy * 0.15));
    const tiltY = Math.max(-4, Math.min(4, -frameDx * 0.15));
    for (const id of this.draggingIds) {
      const el = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement | null;
      if (el) {
        el.style.setProperty('--drag-tilt-x', `${tiltX}deg`);
        el.style.setProperty('--drag-tilt-y', `${tiltY}deg`);
      }
    }
    // 逻辑：150ms 无移动 → tilt 归零，CSS transition 驱动平滑回正动画。
    if (this.tiltResetTimer !== null) clearTimeout(this.tiltResetTimer);
    this.tiltResetTimer = window.setTimeout(() => {
      for (const id of this.draggingIds) {
        const el = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement | null;
        if (el) {
          el.style.setProperty('--drag-tilt-x', '0deg');
          el.style.setProperty('--drag-tilt-y', '0deg');
        }
      }
      this.tiltResetTimer = null;
    }, 150) as unknown as number;

    ctx.engine.batch(() => {
      ctx.engine.doc.transact(() => {
        this.draggingIds.forEach(id => {
          const startRect = this.dragStartRects.get(id);
          if (!startRect) return;
          const element = ctx.engine.doc.getElementById(id);
          if (!element) return;
          ctx.engine.doc.updateElement(id, {
            xywh: [
              startRect[0] + finalDx,
              startRect[1] + finalDy,
              startRect[2],
              startRect[3],
            ],
          });
        });
      });
      ctx.engine.setAlignmentGuides([]);
    });
  }

  /** Handle pointer up to stop dragging. */
  onPointerUp(ctx: ToolContext): void {
    if (this.connectorDrafting && this.connectorSource) {
      const draft = ctx.engine.getConnectorDraft();
      const direction = this.connectorDirection;
      let keepDraft = false;
      let connectedTargetId: string | null = null;
      if (draft) {
        const isSameElement =
          "elementId" in draft.target &&
          draft.target.elementId === this.connectorSource.elementId;
        if ("point" in draft.target) {
          // 逻辑：拖到空白处触发组件选择面板，传递方向供后续创建节点使用。
          ctx.engine.setConnectorDrop({
            source: draft.source,
            point: draft.target.point,
            direction,
          });
          keepDraft = true;
        } else if (!isSameElement) {
          // 逻辑：backward 拖拽连接到已有节点时交换 source/target，保证连线方向为上游→下游。
          const finalDraft =
            direction === 'backward'
              ? { ...draft, source: draft.target, target: draft.source }
              : draft;
          ctx.engine.addConnectorElement(finalDraft, { skipLayout: true });
          // 逻辑：记录连接目标节点 ID，连线完成后选中目标节点而非源节点。
          connectedTargetId = (draft.target as { elementId: string }).elementId;
        }
      }

      // 逻辑：连接到已有节点时选中目标节点；面板场景由 BoardCanvasInteraction 处理；其余恢复源节点选中。
      if (!keepDraft) {
        ctx.engine.selection.setSelection([connectedTargetId ?? this.connectorSource.elementId]);
        ctx.engine.setConnectorDraft(null);
      }
      ctx.engine.setConnectorHover(null);
      ctx.engine.setConnectorValidation(null);
      this.connectorSource = null;
      this.connectorDrafting = false;
      this.connectorDirection = 'forward';
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
      this.cancelSelectionUpdate();
      if (this.selectionBoxActive) {
        this.applySelectionUpdate(ctx.engine, ctx.worldPoint, true);
      } else {
        ctx.engine.setSelectionBox(null);
      }
      this.selectionStartWorld = null;
      this.selectionStartScreen = null;
      this.selectionBoxActive = false;
      this.selectionBaseIds = [];
      this.selectionAdditive = false;
      this.selectionPendingWorld = null;
    }
    if (this.draggingId) {
      ctx.engine.setDraggingElementId(null);
    }
    ctx.engine.setAlignmentGuides([]);
    let didReparent = false;
    if (this.dragActivated && this.draggingIds.length === 1) {
      const draggedId = this.draggingIds[0];
      const draggedElement = ctx.engine.doc.getElementById(draggedId);
      const draggedMeta = draggedElement?.meta as Record<string, unknown> | undefined;
      const isGhost = Boolean(draggedMeta?.[MINDMAP_META.ghost]);
      if (draggedElement?.kind === "node" && draggedElement.type === "text" && !isGhost) {
        const target = ctx.engine.findNodeAt(ctx.worldPoint);
        if (target && target.id !== draggedId) {
          const targetMeta = target.meta as Record<string, unknown> | undefined;
          const targetIsGhost = Boolean(targetMeta?.[MINDMAP_META.ghost]);
          if (!targetIsGhost) {
            ctx.engine.reparentMindmapNode(draggedId, target.id);
            didReparent = true;
          }
        }
      }
    }
    if (this.dragActivated && this.draggingIds.length > 0 && !didReparent) {
      // 逻辑：放下时网格吸附 — 延迟一帧让 CSS transition 生效后再更新位置，实现平滑吸附动画。
      if (!ctx.event.altKey) {
        const snapIds = [...this.draggingIds];
        const engine = ctx.engine;
        requestAnimationFrame(() => {
          const half = GRID_SIZE / 2;
          let changed = false;
          for (const id of snapIds) {
            const el = engine.doc.getElementById(id);
            if (!el || el.kind !== 'node') continue;
            const [x, y, w, h] = el.xywh;
            const snappedX = Math.round((x - half) / GRID_SIZE) * GRID_SIZE + half;
            const snappedY = Math.round((y - half) / GRID_SIZE) * GRID_SIZE + half;
            if (snappedX !== x || snappedY !== y) {
              engine.doc.updateElement(id, { xywh: [snappedX, snappedY, w, h] });
              changed = true;
            }
          }
          if (changed) engine.commitHistory();
        });
      } else {
        ctx.engine.commitHistory();
      }
    }
    // 逻辑：清除 3D 倾斜 CSS 变量。
    for (const id of this.draggingIds) {
      const el = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement | null;
      if (el) {
        el.style.setProperty('--drag-tilt-x', '0deg');
        el.style.setProperty('--drag-tilt-y', '0deg');
      }
    }
    // 逻辑：拖拽放置后清空选区；非拖拽点击时应用 pending selection 进入选中态。
    if (this.dragActivated) {
      ctx.engine.selection.clear();
    } else if (this.pendingSelectionId) {
      ctx.engine.selection.setSelection([this.pendingSelectionId]);
    }
    this.pendingSelectionId = null;
    this.draggingId = null;
    this.draggingIds = [];
    this.dragStartRects.clear();
    this.dragStart = null;
    this.dragActivated = false;
    this.cachedDragGroupBounds = null;
    this.cachedDraggingSet = null;
    this.lastMovePoint = null;
    if (this.tiltResetTimer !== null) {
      clearTimeout(this.tiltResetTimer);
      this.tiltResetTimer = null;
    }
    this.cancelHoverClear();
  }

  /** Handle keyboard shortcuts for selection. */
  onKeyDown(event: KeyboardEvent, engine: CanvasToolHost): void {
    if (isEditableTarget(event.target)) return;
    const isMeta = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (isMeta) {
      // 逻辑：copy/cut/undo/redo/delete 已提升到 ToolManager，此处仅保留 select 工具特有的快捷键。
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

    const selectedIds = engine.selection.getSelectedIds();
    const selectedElement =
      selectedIds.length === 1 ? engine.doc.getElementById(selectedIds[0]) : null;
    const selectedMeta = selectedElement?.meta as Record<string, unknown> | undefined;
    const isGhost = Boolean(selectedMeta?.[MINDMAP_META.ghost]);
    const isTextNode =
      selectedElement?.kind === "node" && selectedElement.type === "text";
    const canMindmapEdit =
      isTextNode &&
      !isGhost &&
      !engine.isLocked() &&
      !selectedElement?.locked;

    if (canMindmapEdit) {
      if (key === "tab") {
        event.preventDefault();
        if (event.shiftKey) {
          engine.promoteMindmapNode(selectedElement!.id);
        } else {
          engine.createMindmapChild(selectedElement!.id);
        }
        return;
      }
      if (key === "enter") {
        event.preventDefault();
        engine.createMindmapSibling(selectedElement!.id);
        return;
      }
      if (event.key === "Backspace") {
        const props = selectedElement!.props as Record<string, unknown>;
        const value = typeof props.value === "string" ? props.value : "";
        if (value.trim().length === 0) {
          event.preventDefault();
          engine.removeMindmapNode(selectedElement!.id);
          return;
        }
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

  /** Merge base selection ids with new hits. */
  private mergeSelectionIds(baseIds: string[], hits: string[]): string[] {
    if (baseIds.length === 0) return hits;
    const merged = new Set(baseIds);
    hits.forEach(id => merged.add(id));
    return Array.from(merged);
  }

  /** Apply a rectangle selection update. */
  private applySelectionUpdate(
    engine: CanvasToolHost,
    endWorld: CanvasPoint,
    clearBox: boolean
  ): void {
    if (!this.selectionStartWorld) return;
    const rect = this.buildSelectionRect(this.selectionStartWorld, endWorld);
    const hits = this.pickNodesInRect(rect, engine);
    const selectionIds = this.selectionAdditive
      ? this.mergeSelectionIds(this.selectionBaseIds, hits)
      : hits;
    const box = clearBox ? null : rect;
    const currentSelection = engine.selection.getSelectedIds();
    if (this.isSameSelectionSet(currentSelection, selectionIds)) {
      engine.setSelectionBox(box);
      return;
    }
    engine.setSelectionBoxAndSelection(box, selectionIds);
  }

  /** Schedule rectangle selection updates for the next frame. */
  private scheduleSelectionUpdate(engine: CanvasToolHost, endWorld: CanvasPoint): void {
    this.selectionPendingWorld = endWorld;
    if (this.selectionFrameId !== null || this.selectionThrottleTimeout !== null) return;
    const now = performance.now();
    const delta = now - this.selectionLastUpdateTime;
    if (delta < this.selectionThrottleMs) {
      const wait = this.selectionThrottleMs - delta;
      // 逻辑：框选刷新节流到固定帧率，避免拖拽时占用过高。
      this.selectionThrottleTimeout = window.setTimeout(() => {
        this.selectionThrottleTimeout = null;
        this.scheduleSelectionUpdate(engine, endWorld);
      }, wait);
      return;
    }
    this.selectionFrameId = window.requestAnimationFrame(() => {
      this.selectionFrameId = null;
      const pending = this.selectionPendingWorld;
      if (!pending) return;
      this.selectionPendingWorld = null;
      if (!this.selectionStartWorld) return;
      // 逻辑：框选刷新合并到帧回调，降低高频指针事件的渲染压力。
      this.applySelectionUpdate(engine, pending, false);
      this.selectionLastUpdateTime = performance.now();
    });
  }

  /** Cancel any pending selection frame. */
  private cancelSelectionUpdate(): void {
    if (this.selectionFrameId !== null) {
      window.cancelAnimationFrame(this.selectionFrameId);
      this.selectionFrameId = null;
    }
    if (this.selectionThrottleTimeout !== null) {
      window.clearTimeout(this.selectionThrottleTimeout);
      this.selectionThrottleTimeout = null;
    }
    this.selectionPendingWorld = null;
  }

  /** Find the top-most hovered large-anchor node with expanded hit area. */
  private getHoverAnchorNode(
    engine: CanvasToolHost,
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
      const meta = element.meta as Record<string, unknown> | undefined;
      if (meta?.[MINDMAP_META.hidden] || meta?.[MINDMAP_META.ghost]) continue;
      if (!LARGE_ANCHOR_NODE_TYPES.has(element.type)) continue;
      if (element.locked) continue;
      // 逻辑：选中节点也需要显示 hover 锚点，方便用户拖出连线。
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
  private scheduleHoverClear(engine: CanvasToolHost): void {
    if (this.hoverClearTimeout) return;
    this.hoverClearTimeout = window.setTimeout(() => {
      engine.setNodeHoverId(null);
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
  private pickNodesInRect(rect: CanvasRect, engine: CanvasToolHost): string[] {
    const selectionIds = new Set<string>();
    const { zoom } = engine.viewport.getState();
    const queryRect = this.expandRect(rect, getGroupOutlinePadding(zoom));
    const candidates = engine.doc.getNodeCandidatesInRect(queryRect);
    candidates.forEach(element => {
      if (element.locked) return;
      const meta = element.meta as Record<string, unknown> | undefined;
      if (meta?.[MINDMAP_META.hidden] || meta?.[MINDMAP_META.ghost]) return;
      if (!this.rectsIntersect(rect, element, zoom)) return;
      selectionIds.add(this.resolveSelectionId(engine, element));
    });
    return Array.from(selectionIds);
  }

  /** Check whether two rectangles intersect. */
  private rectsIntersect(a: CanvasRect, element: CanvasNodeElement, zoom: number): boolean {
    const [bx, by, bw, bh] = element.xywh;
    const padding = isGroupNodeType(element.type)
      ? getGroupOutlinePadding(zoom)
      : 0;
    const aRight = a.x + a.w;
    const aBottom = a.y + a.h;
    const bRight = bx + bw + padding;
    const bBottom = by + bh + padding;
    return (
      a.x <= bRight &&
      aRight >= bx - padding &&
      a.y <= bBottom &&
      aBottom >= by - padding
    );
  }

  /** Expand a rect by padding on all sides. */
  private expandRect(rect: CanvasRect, padding: number): CanvasRect {
    if (padding <= 0) return rect;
    return {
      x: rect.x - padding,
      y: rect.y - padding,
      w: rect.w + padding * 2,
      h: rect.h + padding * 2,
    };
  }

  /** Resolve the selection id for a node element. */
  private resolveSelectionId(engine: CanvasToolHost, element: CanvasNodeElement): string {
    const groupId = getNodeGroupId(element);
    if (!groupId) return element.id;
    const groupNode = engine.doc.getElementById(groupId);
    return groupNode && groupNode.kind === "node" ? groupId : element.id;
  }

  /** Check whether two selection sets contain the same ids. */
  private isSameSelectionSet(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    const rightSet = new Set(right);
    for (const id of left) {
      if (!rightSet.has(id)) return false;
    }
    return true;
  }

  /**
   * Compute a hint point that biases anchor snapping toward the expected direction.
   * Forward drag → hint far to the left of target (snaps to left/input anchor).
   * Backward drag → hint far to the right of target (snaps to right/output anchor).
   */
  private getDirectionalAnchorHint(targetNode: CanvasNodeElement): CanvasPoint {
    const [x, y, w, h] = targetNode.xywh;
    const centerY = y + h / 2;
    // 逻辑：使用极端偏移量保证始终命中期望侧锚点，不受实际拖拽位置影响。
    const FAR_OFFSET = 100_000;
    if (this.connectorDirection === 'backward') {
      // backward → 吸附目标的右侧（output）锚点
      return [x + w + FAR_OFFSET, centerY];
    }
    // forward → 吸附目标的左侧（input）锚点
    return [x - FAR_OFFSET, centerY];
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
