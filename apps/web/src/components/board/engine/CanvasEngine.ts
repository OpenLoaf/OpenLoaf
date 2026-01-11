import { CanvasDoc } from "./CanvasDoc";
import type {
  CanvasAnchorHit,
  CanvasAnchorMap,
  CanvasAlignmentGuide,
  CanvasConnectorDraft,
  CanvasConnectorDrop,
  CanvasConnectorElement,
  CanvasConnectorEnd,
  CanvasConnectorEndpointHit,
  CanvasConnectorEndpointRole,
  CanvasConnectorStyle,
  CanvasElement,
  CanvasInsertRequest,
  CanvasNodeDefinition,
  CanvasNodeElement,
  CanvasPoint,
  CanvasRect,
  CanvasSelectionBox,
  CanvasSnapshot,
  CanvasStrokePoint,
  CanvasStrokeSettings,
  CanvasStrokeTool,
} from "./types";
import type { CanvasHistoryState } from "./history-utils";
import type { CanvasClipboard, ClipboardInsertPayload } from "./clipboard";
import type { StrokeSettingsState } from "./strokes";
import {
  DEFAULT_FIT_PADDING,
  DEFAULT_NODE_SIZE,
  HISTORY_MAX_SIZE,
  LAYOUT_GAP,
  MIN_ZOOM_EPS,
  PASTE_OFFSET_STEP,
  PAN_SOFT_PADDING_MIN,
  PAN_SOFT_PADDING_RATIO,
  PAN_SOFT_RESISTANCE_RATIO,
} from "./constants";
import { NodeRegistry } from "./NodeRegistry";
import { SelectionManager } from "./SelectionManager";
import { computeElementsBounds, computeNodeBounds } from "./geometry";
import {
  EraserTool,
  HandTool,
  HighlighterTool,
  PenTool,
  SelectTool,
  ToolManager,
} from "../tools";
import { ViewportController } from "./ViewportController";
import { getMinZIndex, getNextZIndex, sortElementsByZIndex } from "./element-order";
import { cloneElements, isHistoryStateEqual } from "./history-utils";
import { buildHistoryState, filterSelectionIds } from "./history-ops";
import {
  findAnchorHit,
  findConnectorEndpointHit,
  findEdgeAnchorHit,
  findNodeAt,
  getNearestEdgeAnchorHit,
  pickElementAt,
} from "./hit-testing";
import {
  buildConnectorElement,
  buildConnectorEndpointUpdate,
} from "./connectors";
import { buildClipboardState, buildPastedElements, getClipboardInsertPayload } from "./clipboard";
import { buildImageNodePayloadFromFile, type ImageNodePayload } from "../utils/image";
import { buildLinkNodePayloadFromUrl } from "../utils/link";
import { buildAnchorMap } from "./anchors";
import {
  addStrokeElement as addStrokeElementToDoc,
  eraseStrokesAt as eraseStrokesAtDoc,
  getHighlighterSettings,
  getPenSettings,
  getStrokeSettings,
  setHighlighterSettings,
  setPenSettings,
  updateStrokeElement as updateStrokeElementInDoc,
} from "./strokes";
import {
  fitToElements,
  getViewportCenterWorld,
  handleWheel,
} from "./viewport-actions";
import {
  deleteSelection,
  getGroupMemberIds,
  groupSelection,
  bringNodeToFront,
  layoutSelection,
  nudgeSelection,
  sendNodeToBack,
  setElementLocked,
  ungroupSelection,
} from "./selection-actions";
import { expandSelectionWithGroupChildren } from "./grouping";
import { generateElementId } from "./id";

/** Builder for image payloads. */
type ImagePayloadBuilder = (file: File) => Promise<ImageNodePayload>;

export class CanvasEngine {
  /** Document model storing elements. */
  readonly doc: CanvasDoc;
  /** Viewport controller for coordinate transforms. */
  readonly viewport: ViewportController;
  /** Selection manager for node selection state. */
  readonly selection: SelectionManager;
  /** Node definition registry. */
  readonly nodes: NodeRegistry;
  /** Tool manager handling interactions. */
  readonly tools: ToolManager;
  /** Canvas lock flag. */
  private locked = false;
  /** Draft connector during linking. */
  private connectorDraft: CanvasConnectorDraft | null = null;
  /** Hovered anchor while linking. */
  private connectorHover: CanvasAnchorHit | null = null;
  /** Hovered node id used for showing anchor UI. */
  private nodeHoverId: string | null = null;
  /** Hovered connector id for visual feedback. */
  private connectorHoverId: string | null = null;
  /** Active connector style for new links. */
  private connectorStyle: CanvasConnectorStyle = "curve";
  /** Pending connector drop for node creation. */
  private connectorDrop: CanvasConnectorDrop | null = null;
  /** Pending insert request for one-shot placement. */
  private pendingInsert: CanvasInsertRequest | null = null;
  /** Cursor position for pending insert in world space. */
  private pendingInsertPoint: CanvasPoint | null = null;
  /** Whether a toolbar drag-insert gesture is active. */
  private toolbarDragging = false;
  /** Alignment guides for snapping feedback. */
  private alignmentGuides: CanvasAlignmentGuide[] = [];
  /** Selection box for rectangle selection. */
  private selectionBox: CanvasSelectionBox | null = null;
  /** Cached ordered elements for hit testing. */
  private orderedElementsCache: CanvasElement[] | null = null;
  /** Cached anchor map for connector hit testing. */
  private anchorMapCache: CanvasAnchorMap | null = null;
  /** Dirty flag for ordered elements cache. */
  private orderedElementsDirty = true;
  /** Dirty flag for anchor map cache. */
  private anchorMapDirty = true;
  /** Cached bounds for elements to avoid heavy recompute on pan. */
  private elementsBoundsCache: CanvasRect = { x: 0, y: 0, w: 0, h: 0 };
  /** Cached element count for bounds validity. */
  private elementsBoundsCount = 0;
  /** Dirty flag for element bounds cache. */
  private elementsBoundsDirty = true;
  /** Active dragging element id. */
  private draggingElementId: string | null = null;
  /** Whether the viewport is currently being panned. */
  private panning = false;
  /** History stack for undo operations. */
  private historyPast: CanvasHistoryState[] = [];
  /** History stack for redo operations. */
  private historyFuture: CanvasHistoryState[] = [];
  /** History guard for applying snapshots. */
  private historyPaused = false;
  /** Clipboard for copy/paste. */
  private clipboard: CanvasClipboard | null = null;
  /** Optional image payload builder for file inserts. */
  private imagePayloadBuilder: ImagePayloadBuilder | null = null;
  /** Paste offset step counter. */
  private pasteCount = 0;
  /** Stroke tool settings state. */
  private strokeSettings: StrokeSettingsState = {
    penSettings: {
      size: 6,
      color: "#111827",
      opacity: 1,
    },
    highlighterSettings: {
      size: 6,
      color: "#111827",
      opacity: 0.35,
    },
  };
  /** Change subscribers. */
  private readonly listeners = new Set<() => void>();
  /** Attached container element. */
  private container: HTMLElement | null = null;
  /** Resize observer for viewport sync. */
  private resizeObserver: ResizeObserver | null = null;
  /** Pointer down handler bound to the engine instance. */
  private readonly onPointerDown = (event: PointerEvent) => {
    this.tools.handlePointerDown(event);
  };
  /** Pointer move handler bound to the engine instance. */
  private readonly onPointerMove = (event: PointerEvent) => {
    this.tools.handlePointerMove(event);
  };
  /** Pointer up handler bound to the engine instance. */
  private readonly onPointerUp = (event: PointerEvent) => {
    this.tools.handlePointerUp(event);
  };
  /** Key down handler bound to the engine instance. */
  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.tools.handleKeyDown(event);
  };
  /** Paste handler bound to the engine instance. */
  private readonly onPaste = (event: ClipboardEvent) => {
    if (this.locked) return;
    const target = event.target;
    // 逻辑：输入控件优先消费粘贴内容，避免画布误插入。
    if (
      target instanceof HTMLElement &&
      target.closest("input, textarea, [contenteditable='true'], [contenteditable='']")
    ) {
      return;
    }
    const clipboardData = event.clipboardData;
    if (clipboardData) {
      const files = Array.from(clipboardData.files ?? []);
      const items = Array.from(clipboardData.items ?? []);
      const textPlain = clipboardData.getData("text/plain") ?? "";
      const textHtml = clipboardData.getData("text/html") ?? "";
      const textUriList = clipboardData.getData("text/uri-list") ?? "";
      const previewLimit = 240;
      const textPlainPreview =
        textPlain.length > previewLimit
          ? `${textPlain.slice(0, previewLimit)}...`
          : textPlain;
      const textHtmlPreview =
        textHtml.length > previewLimit
          ? `${textHtml.slice(0, previewLimit)}...`
          : textHtml;
      const textUriListPreview =
        textUriList.length > previewLimit
          ? `${textUriList.slice(0, previewLimit)}...`
          : textUriList;
      // 逻辑：打印剪贴板内容，便于定位 Paste 粘贴格式。
      console.info("[board] paste payload", {
        types: Array.from(clipboardData.types ?? []),
        items: items.map(item => item.type),
        files: files.map(file => ({
          name: file.name,
          type: file.type,
          size: file.size,
        })),
        textPlain: textPlainPreview,
        textPlainLength: textPlain.length,
        textHtml: textHtmlPreview,
        textHtmlLength: textHtml.length,
        textUriList: textUriListPreview,
        textUriListLength: textUriList.length,
      });
    }
    const payload = getClipboardInsertPayload(event);
    if (payload) {
      event.preventDefault();
      void this.handleExternalPaste(payload);
      return;
    }
    if (this.clipboard) {
      event.preventDefault();
      this.pasteClipboard();
    }
  };
  /** Wheel handler bound to the engine instance. */
  private readonly onWheel = (event: WheelEvent) => {
    this.handleWheel(event);
  };

  /** Create a new canvas engine. */
  constructor() {
    const emitChange = () => this.emitChange();
    const emitSelectionChange = () => {
      this.orderedElementsDirty = true;
      this.orderedElementsCache = null;
      this.emitChange();
    };
    const emitDocChange = () => {
      this.orderedElementsDirty = true;
      this.anchorMapDirty = true;
      this.elementsBoundsDirty = true;
      this.orderedElementsCache = null;
      this.anchorMapCache = null;
      this.emitChange();
    };
    this.doc = new CanvasDoc(emitDocChange);
    this.viewport = new ViewportController(emitChange);
    this.selection = new SelectionManager(emitSelectionChange);
    this.nodes = new NodeRegistry();
    this.tools = new ToolManager(this);
    this.tools.register(new SelectTool());
    this.tools.register(new HandTool());
    this.tools.register(new PenTool());
    this.tools.register(new HighlighterTool());
    this.tools.register(new EraserTool());
    this.tools.setActive("select");
    this.historyPast.push(this.captureHistoryState());
  }

  /** Attach the engine to a DOM container. */
  attach(container: HTMLElement): void {
    if (this.container === container) return;
    if (this.container) this.detach();
    this.container = container;

    // 1) 绑定交互事件，统一交给工具系统处理。
    // 2) 初始化视口尺寸，确保首帧渲染可见。
    // 3) 监听尺寸变化，实时同步 viewport。
    this.container.addEventListener("pointerdown", this.onPointerDown);
    this.container.addEventListener("pointermove", this.onPointerMove);
    this.container.addEventListener("pointerup", this.onPointerUp);
    this.container.addEventListener("keydown", this.onKeyDown);
    this.container.addEventListener("paste", this.onPaste);
    this.container.addEventListener("wheel", this.onWheel, { passive: false });

    const rect = this.container.getBoundingClientRect();
    this.viewport.setSize(rect.width, rect.height);

    this.resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      this.viewport.setSize(width, height);
    });
    this.resizeObserver.observe(this.container);
  }

  /** Detach the engine from the current container. */
  detach(): void {
    if (!this.container) return;
    this.container.removeEventListener("pointerdown", this.onPointerDown);
    this.container.removeEventListener("pointermove", this.onPointerMove);
    this.container.removeEventListener("pointerup", this.onPointerUp);
    this.container.removeEventListener("keydown", this.onKeyDown);
    this.container.removeEventListener("paste", this.onPaste);
    this.container.removeEventListener("wheel", this.onWheel);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.container = null;
  }

  /** Return the current container element. */
  getContainer(): HTMLElement | null {
    return this.container;
  }

  /** Convert a screen-space point to world coordinates. */
  screenToWorld(point: CanvasPoint): CanvasPoint {
    return this.viewport.toWorld(point);
  }

  /** Convert a world-space point to screen coordinates. */
  worldToScreen(point: CanvasPoint): CanvasPoint {
    return this.viewport.toScreen(point);
  }

  /** Register node definitions for rendering and tooling. */
  registerNodes(definitions: CanvasNodeDefinition<unknown>[]): void {
    this.nodes.registerAll(definitions);
  }

  /** Initialize document elements once. */
  setInitialElements(elements: CanvasElement[]): void {
    if (this.doc.getElements().length > 0) return;
    this.doc.transact(() => {
      elements.forEach(element => this.doc.addElement(element));
    });
    this.commitHistory();
  }

  /** Subscribe to engine changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Set the currently active tool. */
  setActiveTool(toolId: string): void {
    this.tools.setActive(toolId);
    if (toolId !== "connector") {
      this.connectorDraft = null;
      this.connectorHover = null;
    }
    if (toolId !== "select") {
      this.connectorHoverId = null;
      this.nodeHoverId = null;
    }
    // 逻辑：切换主工具时清空一次性插入状态。
    this.pendingInsert = null;
    this.pendingInsertPoint = null;
    // 逻辑：切换工具时清空待处理的连线面板。
    this.connectorDrop = null;
    // 逻辑：离开选择工具时清理对齐线，避免残留显示。
    if (toolId !== "select") {
      this.alignmentGuides = [];
      this.selectionBox = null;
    }
    this.emitChange();
  }

  /** Build a render snapshot for React components. */
  getSnapshot(): CanvasSnapshot {
    return {
      elements: this.getOrderedElements(),
      selectedIds: this.selection.getSelectedIds(),
      viewport: this.viewport.getState(),
      anchors: this.getAnchorMap(),
      alignmentGuides: this.alignmentGuides,
      selectionBox: this.selectionBox,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      activeToolId: this.tools.getActiveToolId(),
      draggingId: this.draggingElementId,
      panning: this.panning,
      locked: this.locked,
      connectorDraft: this.connectorDraft,
      connectorHover: this.connectorHover,
      nodeHoverId: this.nodeHoverId,
      connectorHoverId: this.connectorHoverId,
      connectorStyle: this.connectorStyle,
      connectorDrop: this.connectorDrop,
      pendingInsert: this.pendingInsert,
      pendingInsertPoint: this.pendingInsertPoint,
      toolbarDragging: this.toolbarDragging,
    };
  }

  /** Return whether the canvas is locked. */
  isLocked(): boolean {
    return this.locked;
  }

  /** Toggle the canvas lock state. */
  setLocked(locked: boolean): void {
    this.locked = locked;
    this.emitChange();
  }

  /** Return the current pen settings. */
  getPenSettings(): CanvasStrokeSettings {
    return getPenSettings(this.strokeSettings);
  }

  /** Update the pen settings. */
  setPenSettings(settings: Partial<CanvasStrokeSettings>): void {
    setPenSettings(this.strokeSettings, settings);
  }

  /** Return the current highlighter settings. */
  getHighlighterSettings(): CanvasStrokeSettings {
    return getHighlighterSettings(this.strokeSettings);
  }

  /** Update the highlighter settings. */
  setHighlighterSettings(settings: Partial<CanvasStrokeSettings>): void {
    setHighlighterSettings(this.strokeSettings, settings);
  }

  /** Resolve stroke settings for the requested tool. */
  getStrokeSettings(tool: CanvasStrokeTool): CanvasStrokeSettings {
    return getStrokeSettings(this.strokeSettings, tool);
  }

  /** Return the pending insert request. */
  getPendingInsert(): CanvasInsertRequest | null {
    return this.pendingInsert;
  }

  /** Update the pending insert request. */
  setPendingInsert(request: CanvasInsertRequest | null): void {
    this.pendingInsert = request;
    if (!request) {
      this.pendingInsertPoint = null;
    }
    this.emitChange();
  }

  /** Return whether a toolbar drag is active. */
  isToolbarDragging(): boolean {
    return this.toolbarDragging;
  }

  /** Update toolbar drag state. */
  setToolbarDragging(active: boolean): void {
    this.toolbarDragging = active;
    if (!active && !this.pendingInsert) {
      this.pendingInsertPoint = null;
    }
    this.emitChange();
  }

  /** Return the pending insert cursor point. */
  getPendingInsertPoint(): CanvasPoint | null {
    return this.pendingInsertPoint;
  }

  /** Update the pending insert cursor point. */
  setPendingInsertPoint(point: CanvasPoint | null): void {
    this.pendingInsertPoint = point;
    this.emitChange();
  }

  /** Mark the currently dragging element id. */
  setDraggingElementId(id: string | null): void {
    this.draggingElementId = id;
    this.emitChange();
  }

  /** Mark the viewport panning state. */
  setPanning(panning: boolean): void {
    this.panning = panning;
    this.emitChange();
  }

  /** Return the active connector style. */
  getConnectorStyle(): CanvasConnectorStyle {
    return this.connectorStyle;
  }

  /** Update the active connector style. */
  setConnectorStyle(
    style: CanvasConnectorStyle,
    options?: { applyToSelection?: boolean }
  ): void {
    this.connectorStyle = style;
    const applyToSelection = options?.applyToSelection ?? true;
    if (!applyToSelection) {
      this.emitChange();
      return;
    }

    // 逻辑：选中连线时同步更新样式，未选中则只改默认样式。
    const selectedIds = this.selection.getSelectedIds();
    const connectorIds = selectedIds.filter(id => {
      const element = this.doc.getElementById(id);
      return element?.kind === "connector";
    });

    if (connectorIds.length === 0) {
      this.emitChange();
      return;
    }

    this.doc.transact(() => {
      connectorIds.forEach(id => {
        this.doc.updateElement(id, { style });
      });
    });
  }

  /** Return the current connector draft. */
  getConnectorDraft(): CanvasConnectorDraft | null {
    return this.connectorDraft;
  }

  /** Update the current connector draft. */
  setConnectorDraft(draft: CanvasConnectorDraft | null): void {
    this.connectorDraft = draft;
    this.emitChange();
  }

  /** Update the hover anchor used by connector tool. */
  setConnectorHover(hit: CanvasAnchorHit | null): void {
    this.connectorHover = hit;
    this.emitChange();
  }

  /** Return the current hover anchor. */
  getConnectorHover(): CanvasAnchorHit | null {
    return this.connectorHover;
  }

  /** Update hovered node id used for showing anchor UI. */
  setNodeHoverId(id: string | null): void {
    if (this.nodeHoverId === id) return;
    this.nodeHoverId = id;
    this.emitChange();
  }

  /** Return the hovered node id used for showing anchor UI. */
  getNodeHoverId(): string | null {
    return this.nodeHoverId;
  }

  /** Update hovered connector id for hover styling. */
  setConnectorHoverId(id: string | null): void {
    if (this.connectorHoverId === id) return;
    this.connectorHoverId = id;
    this.emitChange();
  }

  /** Return the pending connector drop. */
  getConnectorDrop(): CanvasConnectorDrop | null {
    return this.connectorDrop;
  }

  /** Update the pending connector drop. */
  setConnectorDrop(drop: CanvasConnectorDrop | null): void {
    this.connectorDrop = drop;
    if (!drop) {
      // 逻辑：关闭插入面板时同步清理草稿连线与悬停状态。
      this.connectorDraft = null;
      this.connectorHover = null;
    }
    this.emitChange();
  }

  /** Find the top-most node element at the given world point. */
  findNodeAt(point: CanvasPoint): CanvasNodeElement | null {
    const elements = this.getOrderedElements().filter(
      element => element.kind === "node"
    ) as CanvasNodeElement[];
    return findNodeAt(point, elements);
  }

  /** Resolve the nearest edge-center anchor for a node. */
  getNearestEdgeAnchorHit(
    elementId: string,
    hint: CanvasPoint
  ): CanvasAnchorHit | null {
    const element = this.doc.getElementById(elementId);
    if (!element || element.kind !== "node") return null;
    return getNearestEdgeAnchorHit(element, this.nodes, hint);
  }

  /** Find the nearest connector endpoint hit. */
  findConnectorEndpointHit(
    point: CanvasPoint,
    connectorIds?: string[]
  ): CanvasConnectorEndpointHit | null {
    const anchors = this.getAnchorMap();
    const connectors = this.getOrderedElements().filter(
      element => element.kind === "connector"
    ) as CanvasConnectorElement[];
    const { zoom } = this.viewport.getState();
    return findConnectorEndpointHit(
      point,
      connectors,
      anchors,
      zoom,
      this.getNodeBoundsById,
      connectorIds
    );
  }

  /** Update a connector endpoint and recompute bounds. */
  updateConnectorEndpoint(
    connectorId: string,
    role: CanvasConnectorEndpointRole,
    end: CanvasConnectorEnd
  ): void {
    const element = this.doc.getElementById(connectorId);
    if (!element || element.kind !== "connector") return;
    const anchors = this.getAnchorMap();
    const { update } = buildConnectorEndpointUpdate(
      element,
      role,
      end,
      anchors,
      this.connectorStyle,
      this.getNodeBoundsById
    );
    this.doc.updateElement(connectorId, update);
  }

  /** Update alignment guides for snapping feedback. */
  setAlignmentGuides(guides: CanvasAlignmentGuide[]): void {
    this.alignmentGuides = guides;
    this.emitChange();
  }

  /** Update the selection box rectangle. */
  setSelectionBox(box: CanvasSelectionBox | null): void {
    this.selectionBox = box;
    this.emitChange();
  }

  /** Return whether undo is available. */
  canUndo(): boolean {
    return this.historyPast.length > 1;
  }

  /** Return whether redo is available. */
  canRedo(): boolean {
    return this.historyFuture.length > 0;
  }

  /** Commit the current state into history. */
  commitHistory(): void {
    if (this.historyPaused) return;
    const snapshot = this.captureHistoryState();
    const last = this.historyPast[this.historyPast.length - 1];
    // 逻辑：避免无变化的快照污染历史堆栈。
    if (last && isHistoryStateEqual(last, snapshot)) {
      return;
    }
    this.historyPast.push(snapshot);
    this.historyFuture = [];
    if (this.historyPast.length > HISTORY_MAX_SIZE) {
      this.historyPast.shift();
    }
    this.emitChange();
  }

  /** Undo the latest change. */
  undo(): void {
    if (!this.canUndo()) return;
    const current = this.historyPast.pop();
    if (current) {
      this.historyFuture.unshift(current);
    }
    const previous = this.historyPast[this.historyPast.length - 1];
    if (previous) {
      this.applyHistoryState(previous);
    }
    this.emitChange();
  }

  /** Redo the last undone change. */
  redo(): void {
    if (!this.canRedo()) return;
    const next = this.historyFuture.shift();
    if (!next) return;
    this.applyHistoryState(next);
    this.historyPast.push(next);
    this.emitChange();
  }

  /** Capture the current document and selection state. */
  private captureHistoryState(): CanvasHistoryState {
    return buildHistoryState(this.doc.getElements(), this.selection.getSelectedIds());
  }

  /** Apply a history snapshot to the document. */
  private applyHistoryState(state: CanvasHistoryState): void {
    this.historyPaused = true;
    this.doc.setElements(cloneElements(state.elements));
    this.selection.setSelection(filterSelectionIds(this.doc.getElements(), state.selectedIds));
    this.connectorDraft = null;
    this.connectorHover = null;
    this.connectorDrop = null;
    this.alignmentGuides = [];
    this.selectionBox = null;
    this.historyPaused = false;
  }

  /** Group selected nodes into a new group. */
  groupSelection(): void {
    groupSelection(this.getSelectionDeps(), this.getSelectedNodeIds());
  }

  /** Ungroup selected nodes (or their entire groups). */
  ungroupSelection(): void {
    ungroupSelection(this.getSelectionDeps(), this.getSelectedNodeElements());
  }

  /** Detect the dominant layout axis for a group. */
  getGroupLayoutAxis(groupId: string): "row" | "column" | "mixed" {
    const elements = this.doc.getElements();
    const childIds = getGroupMemberIds(elements, groupId);
    const nodes = childIds
      .map(id => this.doc.getElementById(id))
      .filter((element): element is CanvasNodeElement => element?.kind === "node");
    if (nodes.length < 2) return "mixed";

    let maxLeft = Number.NEGATIVE_INFINITY;
    let minRight = Number.POSITIVE_INFINITY;
    let maxTop = Number.NEGATIVE_INFINITY;
    let minBottom = Number.POSITIVE_INFINITY;
    nodes.forEach(node => {
      const [x, y, w, h] = node.xywh;
      maxLeft = Math.max(maxLeft, x);
      minRight = Math.min(minRight, x + w);
      maxTop = Math.max(maxTop, y);
      minBottom = Math.min(minBottom, y + h);
    });
    const overlapX = maxLeft <= minRight;
    const overlapY = maxTop <= minBottom;
    if (overlapY && !overlapX) return "row";
    if (overlapX && !overlapY) return "column";
    return "mixed";
  }

  /** Normalize child node sizes inside a group. */
  uniformGroupSize(groupId: string): void {
    if (this.locked) return;
    const elements = this.doc.getElements();
    const childIds = getGroupMemberIds(elements, groupId);
    const nodes = childIds
      .map(id => this.doc.getElementById(id))
      .filter((element): element is CanvasNodeElement => element?.kind === "node");
    if (nodes.length < 2) return;

    const targetW = Math.max(...nodes.map(node => node.xywh[2]));
    const targetH = Math.max(...nodes.map(node => node.xywh[3]));
    const groupElement = this.doc.getElementById(groupId);

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    this.doc.transact(() => {
      nodes.forEach(node => {
        const definition = this.nodes.getDefinition(node.type);
        const minSize = definition?.capabilities?.minSize;
        const maxSize = definition?.capabilities?.maxSize;
        let nextW = targetW;
        let nextH = targetH;
        if (minSize) {
          nextW = Math.max(nextW, minSize.w);
          nextH = Math.max(nextH, minSize.h);
        }
        if (maxSize) {
          nextW = Math.min(nextW, maxSize.w);
          nextH = Math.min(nextH, maxSize.h);
        }
        const [x, y] = node.xywh;
        this.doc.updateElement(node.id, { xywh: [x, y, nextW, nextH] });
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + nextW);
        maxY = Math.max(maxY, y + nextH);
      });
      if (groupElement && groupElement.kind === "node") {
        this.doc.updateElement(groupId, {
          xywh: [minX, minY, maxX - minX, maxY - minY],
        });
      }
    });
    this.commitHistory();
  }

  /** Auto layout child nodes inside a group. */
  layoutGroup(groupId: string, direction: "row" | "column" = "row"): void {
    if (this.locked) return;
    const elements = this.doc.getElements();
    const childIds = getGroupMemberIds(elements, groupId);
    const nodes = childIds
      .map(id => this.doc.getElementById(id))
      .filter((element): element is CanvasNodeElement => element?.kind === "node");
    if (nodes.length < 2) return;

    const groupElement = this.doc.getElementById(groupId);
    const bounds = computeNodeBounds(nodes);
    const sorted = [...nodes].sort((a, b) =>
      direction === "row" ? a.xywh[0] - b.xywh[0] : a.xywh[1] - b.xywh[1]
    );
    let cursor = direction === "row" ? bounds.x : bounds.y;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    this.doc.transact(() => {
      sorted.forEach(node => {
        const [, , w, h] = node.xywh;
        const nextX = direction === "row" ? cursor : bounds.x;
        const nextY = direction === "row" ? bounds.y : cursor;
        this.doc.updateElement(node.id, { xywh: [nextX, nextY, w, h] });
        cursor += (direction === "row" ? w : h) + LAYOUT_GAP;
        minX = Math.min(minX, nextX);
        minY = Math.min(minY, nextY);
        maxX = Math.max(maxX, nextX + w);
        maxY = Math.max(maxY, nextY + h);
      });
      if (groupElement && groupElement.kind === "node") {
        this.doc.updateElement(groupId, {
          xywh: [minX, minY, maxX - minX, maxY - minY],
        });
      }
    });
    this.commitHistory();
  }

  /** Return node ids for a given group id. */
  getGroupMemberIds(groupId: string): string[] {
    return getGroupMemberIds(this.doc.getElements(), groupId);
  }

  /** Delete currently selected elements. */
  deleteSelection(): void {
    const selectionIds = expandSelectionWithGroupChildren(
      this.doc.getElements(),
      this.selection.getSelectedIds()
    );
    deleteSelection(this.getSelectionDeps(), selectionIds);
  }

  /** Copy selected nodes (and internal connectors) to clipboard. */
  copySelection(): void {
    const selectedIds = expandSelectionWithGroupChildren(
      this.doc.getElements(),
      this.selection.getSelectedIds()
    );
    const nodes = selectedIds
      .map(id => this.doc.getElementById(id))
      .filter((element): element is CanvasNodeElement => element?.kind === "node");
    if (nodes.length === 0) return;

    const nodeIdSet = new Set(nodes.map(node => node.id));
    const connectors = this.doc
      .getElements()
      .filter(element => element.kind === "connector")
      .filter(element => {
        const sourceHit =
          "elementId" in element.source && nodeIdSet.has(element.source.elementId);
        const targetHit =
          "elementId" in element.target && nodeIdSet.has(element.target.elementId);
        return sourceHit && targetHit;
      }) as CanvasConnectorElement[];

    this.clipboard = buildClipboardState(nodes, connectors);
    this.pasteCount = 0;
  }

  /** Cut selected nodes (copy then delete). */
  cutSelection(): void {
    if (this.locked) return;
    this.copySelection();
    this.deleteSelection();
  }

  /** Paste clipboard contents into the document. */
  pasteClipboard(): void {
    if (this.locked) return;
    if (!this.clipboard) return;

    this.pasteCount += 1;
    const offset = PASTE_OFFSET_STEP * this.pasteCount;
    const { nextNodes, nextConnectors, selectionIds } = buildPastedElements(
      this.clipboard,
      {
        offset,
        connectorStyle: this.connectorStyle,
        generateId: this.generateId.bind(this),
        getAnchorMap: () => this.getAnchorMap(),
        getNodeBoundsById: this.getNodeBoundsById,
        getNodeById: (elementId: string) => {
          const element = this.doc.getElementById(elementId);
          return element && element.kind === "node" ? element : undefined;
        },
        getNextZIndex: () => this.getNextZIndex(),
      }
    );

    // 逻辑：粘贴时以节点左上角为基准偏移。
    this.doc.transact(() => {
      nextNodes.forEach(node => this.doc.addElement(node));
      nextConnectors.forEach(connector => this.doc.addElement(connector));
    });
    this.selection.setSelection(selectionIds);
    this.commitHistory();
  }

  /** Register a custom image payload builder for file insertions. */
  setImagePayloadBuilder(builder: ImagePayloadBuilder | null): void {
    this.imagePayloadBuilder = builder;
  }

  /** Build an image payload using the registered builder if available. */
  async buildImagePayloadFromFile(file: File): Promise<ImageNodePayload> {
    const builder = this.imagePayloadBuilder ?? buildImageNodePayloadFromFile;
    return builder(file);
  }

  /** Handle external clipboard payloads, with room for future node types. */
  private async handleExternalPaste(payload: ClipboardInsertPayload): Promise<void> {
    if (payload.kind === "image") {
      await this.insertImageFromFile(payload.file);
      return;
    }
    if (payload.kind === "url") {
      this.insertLinkFromUrl(payload.url);
    }
  }

  /** Insert an image node from a file and place it at the viewport center. */
  private async insertImageFromFile(file: File): Promise<void> {
    const payload = await this.buildImagePayloadFromFile(file);
    const [width, height] = payload.size;
    const center = this.getViewportCenterWorld();
    this.addNodeElement("image", payload.props, [
      center[0] - width / 2,
      center[1] - height / 2,
      width,
      height,
    ]);
  }

  /** Insert a link node from a URL and place it at the viewport center. */
  private insertLinkFromUrl(url: string): void {
    const payload = buildLinkNodePayloadFromUrl(url);
    const [width, height] = payload.size;
    const center = this.getViewportCenterWorld();
    this.addNodeElement("link", payload.props, [
      center[0] - width / 2,
      center[1] - height / 2,
      width,
      height,
    ]);
  }

  /** Nudge selected nodes by a small delta. */
  nudgeSelection(dx: number, dy: number): void {
    const selectedIds = expandSelectionWithGroupChildren(
      this.doc.getElements(),
      this.selection.getSelectedIds()
    );
    const nodeIds = selectedIds.filter(id => {
      const element = this.doc.getElementById(id);
      return element?.kind === "node";
    });
    nudgeSelection(this.getSelectionDeps(), nodeIds, dx, dy);
  }

  /** Auto layout selected nodes in a simple row. */
  layoutSelection(): void {
    layoutSelection(this.getSelectionDeps(), this.getSelectedNodeElements(), LAYOUT_GAP);
  }

  /** Toggle lock state for a node element. */
  setElementLocked(elementId: string, locked: boolean): void {
    setElementLocked(this.doc, elementId, locked);
    this.emitChange();
  }

  /** Bring a node element to the top. */
  bringNodeToFront(elementId: string): void {
    bringNodeToFront(this.getSelectionDeps(), elementId);
  }

  /** Send a node element to the bottom. */
  sendNodeToBack(elementId: string): void {
    sendNodeToBack(this.getSelectionDeps(), elementId);
  }

  /** Return selected node elements. */
  private getSelectedNodeElements(): CanvasNodeElement[] {
    const selectedIds = this.selection.getSelectedIds();
    return selectedIds
      .map(id => this.doc.getElementById(id))
      .filter((element): element is CanvasNodeElement => element?.kind === "node");
  }

  /** Return selected node ids. */
  private getSelectedNodeIds(): string[] {
    return this.getSelectedNodeElements().map(element => element.id);
  }

  /** Build selection action dependencies. */
  private getSelectionDeps() {
    return {
      doc: this.doc,
      selection: this.selection,
      isLocked: () => this.locked,
      commitHistory: () => this.commitHistory(),
      generateId: (prefix: string) => this.generateId(prefix),
      getNextZIndex: () => this.getNextZIndex(),
      getMinZIndex: () => this.getMinZIndex(),
    };
  }

  /** Add a new node element to the document. */
  addNodeElement<P extends Record<string, unknown>>(
    type: string,
    props: Partial<P>,
    xywh?: [number, number, number, number]
  ): string | null {
    const definition = this.nodes.getDefinition(type);
    if (!definition) return null;

    const id = this.generateId(type);
    // 逻辑：默认在视口中心插入节点，保证插入位置可见。
    const viewportCenter = this.getViewportCenterWorld();
    const defaultSize = DEFAULT_NODE_SIZE;
    const nextXYWH: [number, number, number, number] =
      xywh ?? [
        viewportCenter[0] - defaultSize[0] / 2,
        viewportCenter[1] - defaultSize[1] / 2,
        defaultSize[0],
        defaultSize[1],
      ];

    this.doc.addElement({
      id,
      kind: "node",
      type,
      xywh: nextXYWH,
      zIndex: this.getNextZIndex(),
      props: {
        ...(definition.defaultProps as Record<string, unknown>),
        ...(props as Record<string, unknown>),
      } as P,
    });
    // 逻辑：插入后默认选中新节点，便于后续编辑。
    this.selection.setSelection([id]);
    this.commitHistory();
    return id;
  }

  /** Add a new connector element to the document. */
  addConnectorElement(draft: CanvasConnectorDraft): void {
    const anchors = this.getAnchorMap();
    const element = buildConnectorElement(
      draft,
      anchors,
      this.connectorStyle,
      this.getNodeBoundsById,
      this.generateId.bind(this)
    );
    if (!element) return;
    this.doc.addElement(element);
    // 逻辑：创建连线后默认选中，便于调整样式。
    this.selection.setSelection([element.id]);
    this.commitHistory();
  }

  /** Add a new stroke node to the document. */
  addStrokeElement(
    tool: CanvasStrokeTool,
    settings: CanvasStrokeSettings,
    point: CanvasStrokePoint
  ): string {
    const id = addStrokeElementToDoc(
      this.doc,
      this.generateId.bind(this),
      tool,
      settings,
      point
    );
    this.doc.updateElement(id, { zIndex: this.getNextZIndex() });
    return id;
  }

  /** Update an existing stroke node. */
  updateStrokeElement(
    id: string,
    points: CanvasStrokePoint[],
    tool: CanvasStrokeTool,
    settings: CanvasStrokeSettings
  ): void {
    updateStrokeElementInDoc(this.doc, id, points, tool, settings);
  }

  /** Erase stroke nodes near a world point. */
  eraseStrokesAt(point: CanvasPoint, radius: number): string[] {
    return eraseStrokesAtDoc(this.doc, this.viewport, point, radius);
  }

  /** Build anchor positions for all connectable nodes. */
  getAnchorMap(): CanvasAnchorMap {
    if (!this.anchorMapDirty && this.anchorMapCache) {
      return this.anchorMapCache;
    }
    const nodes = this.doc
      .getElements()
      .filter((element): element is CanvasNodeElement => element.kind === "node");
    const map = buildAnchorMap(nodes, this.nodes);
    this.anchorMapCache = map;
    this.anchorMapDirty = false;
    return map;
  }

  /** Find the nearest anchor within a hit radius. */
  findAnchorHit(
    point: CanvasPoint,
    exclude?: { elementId: string; anchorId: string }
  ): CanvasAnchorHit | null {
    const anchors = this.getAnchorMap();
    const { zoom } = this.viewport.getState();
    return findAnchorHit(point, anchors, zoom, exclude);
  }

  /** Find the closest edge-center anchor hit for nodes. */
  findEdgeAnchorHit(
    point: CanvasPoint,
    exclude?: { elementId: string; anchorId: string },
    selectedIds: string[] = []
  ): CanvasAnchorHit | null {
    const elements = this.getOrderedElements().filter(
      element => element.kind === "node"
    ) as CanvasNodeElement[];
    const { zoom } = this.viewport.getState();
    return findEdgeAnchorHit(point, elements, this.nodes, zoom, exclude, selectedIds);
  }

  /** Return bounds for a node by id if present. */
  private getNodeBoundsById = (elementId: string): CanvasRect | undefined => {
    const element = this.doc.getElementById(elementId);
    if (!element || element.kind !== "node") return undefined;
    const [x, y, w, h] = element.xywh;
    return { x, y, w, h };
  };

  /** Compute the viewport center in world coordinates. */
  getViewportCenterWorld(): CanvasPoint {
    return getViewportCenterWorld(this.viewport);
  }

  /** Fit the viewport to include all node elements. */
  fitToElements(padding = DEFAULT_FIT_PADDING): void {
    fitToElements(this.doc, this.viewport, padding);
  }

  /** Generate a unique id for canvas elements. */
  generateId(prefix: string): string {
    return generateElementId(prefix);
  }

  /** Pick the top-most element at the given world point. */
  pickElementAt(point: CanvasPoint): CanvasElement | null {
    const elements = this.getOrderedElements();
    const anchors = this.getAnchorMap();
    const { zoom } = this.viewport.getState();
    return pickElementAt(
      point,
      elements,
      anchors,
      zoom,
      this.connectorStyle,
      this.getNodeBoundsById
    );
  }

  /** Handle wheel events for zooming and panning. */
  handleWheel(event: WheelEvent): void {
    const container = this.container;
    if (!container) return;
    handleWheel(event, container, this.viewport, {
      ignoreSelectors: ["[data-canvas-toolbar]", "[data-board-controls]"],
      onPan: (dx, dy) => this.panViewportBy(dx, dy),
    });
  }

  /** Emit change notifications to subscribers. */
  private emitChange(): void {
    this.listeners.forEach(listener => listener());
  }

  /** Pan the viewport while applying soft bounds. */
  panViewportBy(dx: number, dy: number): void {
    const { offset } = this.viewport.getState();
    const nextOffset: CanvasPoint = [offset[0] + dx, offset[1] + dy];
    this.viewport.setOffset(this.applySoftPanOffset(nextOffset));
  }

  /** Set the viewport offset with soft bounds applied. */
  setViewportOffset(offset: CanvasPoint): void {
    this.viewport.setOffset(this.applySoftPanOffset(offset));
  }

  /** Force a view refresh without mutating document state. */
  refreshView(): void {
    this.emitChange();
  }

  /** Return elements sorted by zIndex with stable fallback. */
  private getOrderedElements(): CanvasElement[] {
    if (!this.orderedElementsDirty && this.orderedElementsCache) {
      return this.orderedElementsCache;
    }
    const sorted = sortElementsByZIndex(this.doc.getElements());
    const selectedIds = this.selection.getSelectedIds();
    // 逻辑：选中节点临时置顶显示，但不修改原始 zIndex。
    const elements =
      selectedIds.length === 0
        ? sorted
        : (() => {
            const selectedSet = new Set(selectedIds);
            const base: CanvasElement[] = [];
            const selected: CanvasElement[] = [];
            sorted.forEach(element => {
              if (element.kind === "node" && selectedSet.has(element.id)) {
                selected.push(element);
              } else {
                base.push(element);
              }
            });
            return [...base, ...selected];
          })();
    this.orderedElementsCache = elements;
    this.orderedElementsDirty = false;
    return elements;
  }

  /** Return cached bounds for elements with a fast dirty check. */
  private getElementsBounds(): { bounds: CanvasRect; count: number } {
    if (!this.elementsBoundsDirty) {
      return { bounds: this.elementsBoundsCache, count: this.elementsBoundsCount };
    }
    const elements = this.doc.getElements();
    this.elementsBoundsCache = computeElementsBounds(elements);
    this.elementsBoundsCount = elements.length;
    this.elementsBoundsDirty = false;
    return { bounds: this.elementsBoundsCache, count: this.elementsBoundsCount };
  }

  /** Apply a soft boundary to the proposed viewport offset. */
  private applySoftPanOffset(offset: CanvasPoint): CanvasPoint {
    const { size, zoom } = this.viewport.getState();
    if (size[0] <= 0 || size[1] <= 0) return offset;

    const safeZoom = Math.max(zoom, MIN_ZOOM_EPS);
    const worldW = size[0] / safeZoom;
    const worldH = size[1] / safeZoom;
    const worldBase = Math.max(worldW, worldH);

    const padding = Math.max(
      worldBase * PAN_SOFT_PADDING_RATIO,
      PAN_SOFT_PADDING_MIN / safeZoom
    );
    const resistance = Math.max(worldBase * PAN_SOFT_RESISTANCE_RATIO, worldBase * 0.2);

    const { bounds, count } = this.getElementsBounds();
    let softBounds: CanvasRect;
    if (count === 0 || (bounds.w === 0 && bounds.h === 0)) {
      const fallbackSize = Math.max(worldBase * 1.6, DEFAULT_NODE_SIZE[0] * 2);
      const half = fallbackSize / 2;
      softBounds = { x: -half, y: -half, w: fallbackSize, h: fallbackSize };
    } else {
      softBounds = {
        x: bounds.x - padding,
        y: bounds.y - padding,
        w: bounds.w + padding * 2,
        h: bounds.h + padding * 2,
      };
    }

    if (softBounds.w < worldW) {
      const extra = (worldW - softBounds.w) / 2;
      softBounds = {
        x: softBounds.x - extra,
        y: softBounds.y,
        w: worldW,
        h: softBounds.h,
      };
    }
    if (softBounds.h < worldH) {
      const extra = (worldH - softBounds.h) / 2;
      softBounds = {
        x: softBounds.x,
        y: softBounds.y - extra,
        w: softBounds.w,
        h: worldH,
      };
    }

    let worldX = -offset[0] / safeZoom;
    let worldY = -offset[1] / safeZoom;

    const maxX = softBounds.x + softBounds.w - worldW;
    const maxY = softBounds.y + softBounds.h - worldH;

    const rubber = (overshoot: number) => (overshoot * resistance) / (overshoot + resistance);

    if (worldX < softBounds.x) {
      const overshoot = softBounds.x - worldX;
      worldX = softBounds.x - rubber(overshoot);
    } else if (worldX > maxX) {
      const overshoot = worldX - maxX;
      worldX = maxX + rubber(overshoot);
    }

    if (worldY < softBounds.y) {
      const overshoot = softBounds.y - worldY;
      worldY = softBounds.y - rubber(overshoot);
    } else if (worldY > maxY) {
      const overshoot = worldY - maxY;
      worldY = maxY + rubber(overshoot);
    }

    return [-worldX * safeZoom, -worldY * safeZoom];
  }

  /** Compute the next zIndex based on current elements. */
  private getNextZIndex(): number {
    return getNextZIndex(this.doc.getElements());
  }

  /** Compute the minimum zIndex among elements. */
  private getMinZIndex(): number {
    return getMinZIndex(this.doc.getElements());
  }
}
