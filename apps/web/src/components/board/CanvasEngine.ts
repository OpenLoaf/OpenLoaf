import { CanvasDoc } from "./CanvasDoc";
import type {
  CanvasAnchor,
  CanvasAnchorHit,
  CanvasAnchorMap,
  CanvasAlignmentGuide,
  CanvasConnectorDraft,
  CanvasConnectorElement,
  CanvasConnectorEnd,
  CanvasConnectorEndpointHit,
  CanvasConnectorEndpointRole,
  CanvasConnectorStyle,
  CanvasElement,
  CanvasNodeDefinition,
  CanvasNodeElement,
  CanvasPoint,
  CanvasRect,
  CanvasSelectionBox,
  CanvasSnapshot,
} from "./CanvasTypes";
import { NodeRegistry } from "./NodeRegistry";
import { SelectionManager } from "./SelectionManager";
import { ConnectorTool, HandTool, SelectTool, ToolManager } from "./ToolManager";
import { ViewportController } from "./ViewportController";
import {
  buildConnectorPath,
  computeBounds,
  distanceToPolyline,
  flattenConnectorPath,
  resolveConnectorEndpoint,
} from "./utils/connector-path";

type CanvasHistoryState = {
  /** Snapshot of elements for history. */
  elements: CanvasElement[];
  /** Selected ids for history. */
  selectedIds: string[];
};

type CanvasClipboard = {
  /** Copied node elements. */
  nodes: CanvasNodeElement[];
  /** Copied connector elements. */
  connectors: CanvasConnectorElement[];
  /** Bounds of copied nodes. */
  bounds: CanvasRect;
};

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
  /** Active connector style for new links. */
  private connectorStyle: CanvasConnectorStyle = "curve";
  /** Alignment guides for snapping feedback. */
  private alignmentGuides: CanvasAlignmentGuide[] = [];
  /** Selection box for rectangle selection. */
  private selectionBox: CanvasSelectionBox | null = null;
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
  /** Paste offset step counter. */
  private pasteCount = 0;
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
  /** Wheel handler bound to the engine instance. */
  private readonly onWheel = (event: WheelEvent) => {
    this.handleWheel(event);
  };

  /** Create a new canvas engine. */
  constructor() {
    const emitChange = () => this.emitChange();
    this.doc = new CanvasDoc(emitChange);
    this.viewport = new ViewportController(emitChange);
    this.selection = new SelectionManager(emitChange);
    this.nodes = new NodeRegistry();
    this.tools = new ToolManager(this);
    this.tools.register(new SelectTool());
    this.tools.register(new HandTool());
    this.tools.register(new ConnectorTool());
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
    this.container.removeEventListener("wheel", this.onWheel);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.container = null;
  }

  /** Return the current container element. */
  getContainer(): HTMLElement | null {
    return this.container;
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
      connectorStyle: this.connectorStyle,
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

  /** Find the nearest connector endpoint hit. */
  findConnectorEndpointHit(
    point: CanvasPoint,
    connectorIds?: string[]
  ): CanvasConnectorEndpointHit | null {
    const anchors = this.getAnchorMap();
    const connectors = this.getOrderedElements().filter(
      element => element.kind === "connector"
    ) as CanvasConnectorElement[];
    const filtered = connectorIds
      ? connectors.filter(connector => connectorIds.includes(connector.id))
      : connectors;
    const { zoom } = this.viewport.getState();
    // 逻辑：端点命中半径按缩放换算。
    const hitRadius = 10 / Math.max(zoom, 0.1);
    let closest: CanvasConnectorEndpointHit | null = null;
    let closestDistance = hitRadius;

    filtered.forEach(connector => {
      const source = this.resolveConnectorPoint(connector.source, anchors);
      const target = this.resolveConnectorPoint(connector.target, anchors);
      if (source) {
        const dist = Math.hypot(point[0] - source[0], point[1] - source[1]);
        if (dist <= closestDistance) {
          closestDistance = dist;
          closest = {
            connectorId: connector.id,
            role: "source",
            point: source,
          };
        }
      }
      if (target) {
        const dist = Math.hypot(point[0] - target[0], point[1] - target[1]);
        if (dist <= closestDistance) {
          closestDistance = dist;
          closest = {
            connectorId: connector.id,
            role: "target",
            point: target,
          };
        }
      }
    });

    return closest;
  }

  /** Update a connector endpoint and recompute bounds. */
  updateConnectorEndpoint(
    connectorId: string,
    role: CanvasConnectorEndpointRole,
    end: CanvasConnectorEnd
  ): void {
    const element = this.doc.getElementById(connectorId);
    if (!element || element.kind !== "connector") return;

    const nextSource = role === "source" ? end : element.source;
    const nextTarget = role === "target" ? end : element.target;
    const anchors = this.getAnchorMap();
    const sourcePoint = this.resolveConnectorPoint(nextSource, anchors);
    const targetPoint = this.resolveConnectorPoint(nextTarget, anchors);
    let nextXYWH: [number, number, number, number] | undefined;
    if (sourcePoint && targetPoint) {
      // 逻辑：端点变化后重新计算包围盒，便于后续命中与布局。
      const style = element.style ?? this.connectorStyle;
      const path = buildConnectorPath(style, sourcePoint, targetPoint);
      const polyline = flattenConnectorPath(path, 20);
      const bounds = computeBounds(polyline);
      nextXYWH = [bounds.x, bounds.y, bounds.w, bounds.h];
    }

    this.doc.updateElement(connectorId, {
      [role]: end,
      ...(nextXYWH ? { xywh: nextXYWH } : {}),
    });
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
    if (last && this.isHistoryStateEqual(last, snapshot)) {
      return;
    }
    this.historyPast.push(snapshot);
    this.historyFuture = [];
    const maxSize = 100;
    if (this.historyPast.length > maxSize) {
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
    const elements = this.cloneElements(this.doc.getElements());
    return {
      elements,
      selectedIds: this.selection.getSelectedIds(),
    };
  }

  /** Compare two history snapshots for equality. */
  private isHistoryStateEqual(
    a: CanvasHistoryState,
    b: CanvasHistoryState
  ): boolean {
    if (a.selectedIds.length !== b.selectedIds.length) return false;
    for (let i = 0; i < a.selectedIds.length; i += 1) {
      if (a.selectedIds[i] !== b.selectedIds[i]) return false;
    }
    if (a.elements.length !== b.elements.length) return false;
    for (let i = 0; i < a.elements.length; i += 1) {
      const left = a.elements[i];
      const right = b.elements[i];
      if (left.id !== right.id || left.kind !== right.kind) return false;
      if (JSON.stringify(left) !== JSON.stringify(right)) return false;
    }
    return true;
  }

  /** Apply a history snapshot to the document. */
  private applyHistoryState(state: CanvasHistoryState): void {
    this.historyPaused = true;
    this.doc.setElements(this.cloneElements(state.elements));
    const validIds = new Set(this.doc.getElements().map(element => element.id));
    const nextSelection = state.selectedIds.filter(id => validIds.has(id));
    this.selection.setSelection(nextSelection);
    this.connectorDraft = null;
    this.connectorHover = null;
    this.alignmentGuides = [];
    this.selectionBox = null;
    this.historyPaused = false;
  }

  /** Clone elements to avoid mutation across history states. */
  private cloneElements(elements: CanvasElement[]): CanvasElement[] {
    if (typeof structuredClone === "function") {
      return structuredClone(elements);
    }
    return JSON.parse(JSON.stringify(elements)) as CanvasElement[];
  }

  /** Group selected nodes into a new group. */
  groupSelection(): void {
    if (this.locked) return;
    const nodeIds = this.getSelectedNodeIds();
    if (nodeIds.length < 2) return;

    const groupId = this.generateId("group");
    // 逻辑：同一次分组使用同一个 groupId，便于批量选择。
    this.doc.transact(() => {
      nodeIds.forEach(id => {
        const element = this.doc.getElementById(id);
        if (!element || element.kind !== "node") return;
        const meta = { ...(element.meta ?? {}), groupId };
        this.doc.updateElement(id, { meta });
      });
    });
    this.selection.setSelection(nodeIds);
    this.commitHistory();
  }

  /** Ungroup selected nodes (or their entire groups). */
  ungroupSelection(): void {
    if (this.locked) return;
    const selectedNodes = this.getSelectedNodeElements();
    if (selectedNodes.length === 0) return;

    const groupIds = new Set<string>();
    selectedNodes.forEach(node => {
      const groupId = (node.meta as Record<string, unknown> | undefined)?.groupId;
      if (typeof groupId === "string") {
        groupIds.add(groupId);
      }
    });
    if (groupIds.size === 0) return;

    // 逻辑：移除选中节点所属的整个分组。
    this.doc.transact(() => {
      this.doc.getElements().forEach(element => {
        if (element.kind !== "node") return;
        const groupId = (element.meta as Record<string, unknown> | undefined)?.groupId;
        if (!groupId || !groupIds.has(groupId)) return;
        const nextMeta = { ...(element.meta ?? {}) } as Record<string, unknown>;
        delete nextMeta.groupId;
        const meta = Object.keys(nextMeta).length > 0 ? nextMeta : undefined;
        this.doc.updateElement(element.id, { meta });
      });
    });
    this.commitHistory();
  }

  /** Return node ids for a given group id. */
  getGroupMemberIds(groupId: string): string[] {
    return this.doc
      .getElements()
      .filter(element => {
        if (element.kind !== "node") return false;
        const meta = element.meta as Record<string, unknown> | undefined;
        return meta?.groupId === groupId;
      })
      .map(element => element.id);
  }

  /** Delete currently selected elements. */
  deleteSelection(): void {
    if (this.locked) return;
    const selectedIds = this.selection.getSelectedIds();
    if (selectedIds.length === 0) return;

    const selectedSet = new Set(selectedIds);
    const nodeIds = selectedIds.filter(id => {
      const element = this.doc.getElementById(id);
      return element?.kind === "node";
    });
    const nodeSet = new Set(nodeIds);
    const connectorIds = this.doc
      .getElements()
      .filter(element => element.kind === "connector")
      .filter(element => {
        if (selectedSet.has(element.id)) return true;
        const sourceHit =
          "elementId" in element.source && nodeSet.has(element.source.elementId);
        const targetHit =
          "elementId" in element.target && nodeSet.has(element.target.elementId);
        return sourceHit || targetHit;
      })
      .map(element => element.id);

    const deleteIds = new Set([...nodeIds, ...connectorIds, ...selectedIds]);
    // 逻辑：删除节点时同步删除关联连线。
    this.doc.transact(() => {
      this.doc.deleteElements(Array.from(deleteIds));
    });
    this.selection.clear();
    this.commitHistory();
  }

  /** Copy selected nodes (and internal connectors) to clipboard. */
  copySelection(): void {
    const nodes = this.getSelectedNodeElements();
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

    const bounds = this.computeNodeBounds(nodes);
    this.clipboard = {
      nodes: this.cloneElements(nodes) as CanvasNodeElement[],
      connectors: this.cloneElements(connectors) as CanvasConnectorElement[],
      bounds,
    };
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

    const offsetStep = 24;
    this.pasteCount += 1;
    const offset = offsetStep * this.pasteCount;
    const { nodes, connectors } = this.clipboard;

    const idMap = new Map<string, string>();
    const groupMap = new Map<string, string>();
    const maxZ = this.getNextZIndex();
    const nextNodes: CanvasNodeElement[] = nodes.map((node, index) => {
      const nextId = this.generateId(node.type);
      idMap.set(node.id, nextId);
      const [x, y, w, h] = node.xywh;
      const nextMeta = { ...(node.meta ?? {}) } as Record<string, unknown>;
      const groupId = nextMeta.groupId;
      if (typeof groupId === "string") {
        if (!groupMap.has(groupId)) {
          groupMap.set(groupId, this.generateId("group"));
        }
        nextMeta.groupId = groupMap.get(groupId);
      }
      return {
        ...node,
        id: nextId,
        xywh: [x + offset, y + offset, w, h],
        zIndex: maxZ + index,
        meta: Object.keys(nextMeta).length > 0 ? nextMeta : undefined,
      };
    });

    const nextConnectors: CanvasConnectorElement[] = connectors.map(connector => {
      const nextId = this.generateId("connector");
      const nextSource =
        "elementId" in connector.source
          ? {
              ...connector.source,
              elementId: idMap.get(connector.source.elementId) ?? connector.source.elementId,
            }
          : { point: [connector.source.point[0] + offset, connector.source.point[1] + offset] };
      const nextTarget =
        "elementId" in connector.target
          ? {
              ...connector.target,
              elementId: idMap.get(connector.target.elementId) ?? connector.target.elementId,
            }
          : { point: [connector.target.point[0] + offset, connector.target.point[1] + offset] };

      const sourcePoint = this.resolveConnectorPoint(nextSource, this.getAnchorMap());
      const targetPoint = this.resolveConnectorPoint(nextTarget, this.getAnchorMap());
      let nextXYWH = connector.xywh;
      if (sourcePoint && targetPoint) {
        const path = buildConnectorPath(connector.style ?? this.connectorStyle, sourcePoint, targetPoint);
        const polyline = flattenConnectorPath(path, 20);
        const boundsRect = computeBounds(polyline);
        nextXYWH = [boundsRect.x, boundsRect.y, boundsRect.w, boundsRect.h];
      }

      return {
        ...connector,
        id: nextId,
        source: nextSource,
        target: nextTarget,
        xywh: nextXYWH,
        zIndex: 0,
      };
    });

    // 逻辑：粘贴时以节点左上角为基准偏移。
    this.doc.transact(() => {
      nextNodes.forEach(node => this.doc.addElement(node));
      nextConnectors.forEach(connector => this.doc.addElement(connector));
    });
    this.selection.setSelection(nextNodes.map(node => node.id));
    this.commitHistory();
  }

  /** Nudge selected nodes by a small delta. */
  nudgeSelection(dx: number, dy: number): void {
    if (this.locked) return;
    const nodeIds = this.getSelectedNodeIds();
    if (nodeIds.length === 0) return;

    // 逻辑：批量位移选中节点，保持相对布局。
    this.doc.transact(() => {
      nodeIds.forEach(id => {
        const element = this.doc.getElementById(id);
        if (!element || element.kind !== "node") return;
        const [x, y, w, h] = element.xywh;
        this.doc.updateElement(id, { xywh: [x + dx, y + dy, w, h] });
      });
    });
    this.commitHistory();
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

  /** Compute bounds for a list of nodes. */
  private computeNodeBounds(nodes: CanvasNodeElement[]): CanvasRect {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    nodes.forEach(node => {
      const [x, y, w, h] = node.xywh;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    });
    if (!Number.isFinite(minX)) {
      return { x: 0, y: 0, w: 0, h: 0 };
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  /** Add a new node element to the document. */
  addNodeElement<P extends Record<string, unknown>>(
    type: string,
    props: Partial<P>,
    xywh?: [number, number, number, number]
  ): void {
    const definition = this.nodes.getDefinition(type);
    if (!definition) return;

    const id = this.generateId(type);
    // 逻辑：默认在视口中心插入节点，保证插入位置可见。
    const viewportCenter = this.getViewportCenterWorld();
    const defaultSize: [number, number] = [320, 180];
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
      props: { ...definition.defaultProps, ...props },
    });
    // 逻辑：插入后默认选中新节点，便于后续编辑。
    this.selection.setSelection([id]);
    this.commitHistory();
  }

  /** Add a new connector element to the document. */
  addConnectorElement(draft: CanvasConnectorDraft): void {
    const anchors = this.getAnchorMap();
    const sourcePoint = this.resolveConnectorPoint(draft.source, anchors);
    const targetPoint = this.resolveConnectorPoint(draft.target, anchors);
    if (!sourcePoint || !targetPoint) return;

    const style = draft.style ?? this.connectorStyle;
    const path = buildConnectorPath(style, sourcePoint, targetPoint);
    const polyline = flattenConnectorPath(path);
    const bounds = computeBounds(polyline);

    const id = this.generateId("connector");
    this.doc.addElement({
      id,
      kind: "connector",
      type: "connector",
      xywh: [bounds.x, bounds.y, bounds.w, bounds.h],
      source: draft.source,
      target: draft.target,
      style,
      zIndex: 0,
    });
    // 逻辑：创建连线后默认选中，便于调整样式。
    this.selection.setSelection([id]);
    this.commitHistory();
  }

  /** Build anchor positions for all connectable nodes. */
  getAnchorMap(): CanvasAnchorMap {
    const anchorMap: CanvasAnchorMap = {};
    this.doc.getElements().forEach(element => {
      if (element.kind !== "node") return;
      const anchors = this.resolveAnchors(element);
      if (anchors.length > 0) {
        anchorMap[element.id] = anchors;
      }
    });
    return anchorMap;
  }

  /** Find the nearest anchor within a hit radius. */
  findAnchorHit(
    point: CanvasPoint,
    exclude?: { elementId: string; anchorId: string }
  ): CanvasAnchorHit | null {
    const anchors = this.getAnchorMap();
    const { zoom } = this.viewport.getState();
    // 逻辑：命中半径随缩放变化，保持屏幕体验一致。
    const hitRadius = 12 / Math.max(zoom, 0.1);
    let closest: CanvasAnchorHit | null = null;
    let closestDistance = hitRadius;

    Object.entries(anchors).forEach(([elementId, anchorList]) => {
      anchorList.forEach(anchor => {
        if (
          exclude &&
          exclude.elementId === elementId &&
          exclude.anchorId === anchor.id
        ) {
          return;
        }
        const distance = Math.hypot(
          point[0] - anchor.point[0],
          point[1] - anchor.point[1]
        );
        if (distance <= closestDistance) {
          closestDistance = distance;
          closest = {
            elementId,
            anchorId: anchor.id,
            point: anchor.point,
          };
        }
      });
    });

    return closest;
  }

  /** Resolve anchors for a node element. */
  private resolveAnchors(element: CanvasNodeElement): CanvasAnchor[] {
    const [x, y, w, h] = element.xywh;
    const bounds: CanvasRect = { x, y, w, h };
    const definition = this.nodes.getDefinition(element.type);
    // 逻辑：优先使用节点定义锚点，缺省时回退到四边中心锚点。
    const anchorDefs =
      definition?.anchors?.(element.props as never, bounds) ?? [];
    const anchors = anchorDefs.map((anchor, index) => {
      if (Array.isArray(anchor)) {
        return { id: `anchor-${index + 1}`, point: anchor };
      }
      return { id: anchor.id, point: anchor.point };
    });

    if (anchors.length > 0) return anchors;

    return [
      { id: "top", point: [x + w / 2, y] },
      { id: "right", point: [x + w, y + h / 2] },
      { id: "bottom", point: [x + w / 2, y + h] },
      { id: "left", point: [x, y + h / 2] },
    ];
  }

  /** Resolve connector endpoints with fallback positions. */
  private resolveConnectorPoint(
    end: CanvasConnectorEnd,
    anchors: CanvasAnchorMap
  ): CanvasPoint | null {
    const resolved = resolveConnectorEndpoint(end, anchors);
    if (resolved) return resolved;
    if ("elementId" in end) {
      const element = this.doc.getElementById(end.elementId);
      if (element && element.kind === "node") {
        const [x, y, w, h] = element.xywh;
        return [x + w / 2, y + h / 2];
      }
    }
    return null;
  }

  /** Compute the viewport center in world coordinates. */
  getViewportCenterWorld(): CanvasPoint {
    const { size } = this.viewport.getState();
    return this.viewport.toWorld([size[0] / 2, size[1] / 2]);
  }

  /** Fit the viewport to include all node elements. */
  fitToElements(padding = 120): void {
    const elements = this.doc
      .getElements()
      .filter(element => element.kind === "node");
    if (elements.length === 0) {
      // 逻辑：无元素时回到默认视口。
      this.viewport.setViewport(1, [0, 0]);
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    elements.forEach(element => {
      const [x, y, w, h] = element.xywh;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    });

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const { size } = this.viewport.getState();
    if (size[0] <= 0 || size[1] <= 0) return;
    const targetWidth = width + padding * 2;
    const targetHeight = height + padding * 2;

    const scaleX = size[0] / targetWidth;
    const scaleY = size[1] / targetHeight;
    const nextZoom = Math.min(scaleX, scaleY);
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;
    const offset: CanvasPoint = [
      size[0] / 2 - centerX * nextZoom,
      size[1] / 2 - centerY * nextZoom,
    ];

    this.viewport.setViewport(nextZoom, offset);
  }

  /** Generate a unique id for canvas elements. */
  generateId(prefix: string): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  /** Pick the top-most element at the given world point. */
  pickElementAt(point: CanvasPoint): CanvasElement | null {
    const nodeHit = this.pickNodeAt(point);
    if (nodeHit) return nodeHit;
    return this.pickConnectorAt(point);
  }

  /** Pick the top-most node at the given world point. */
  private pickNodeAt(point: CanvasPoint): CanvasNodeElement | null {
    const elements = this.getOrderedElements().filter(
      element => element.kind === "node"
    ) as CanvasNodeElement[];

    // 反向遍历保证命中最上层元素。
    for (let i = elements.length - 1; i >= 0; i -= 1) {
      const element = elements[i];
      const [x, y, w, h] = element.xywh;
      const within =
        point[0] >= x &&
        point[0] <= x + w &&
        point[1] >= y &&
        point[1] <= y + h;
      if (within) return element;
    }
    return null;
  }

  /** Pick the top-most connector near the given world point. */
  private pickConnectorAt(point: CanvasPoint): CanvasConnectorElement | null {
    const anchors = this.getAnchorMap();
    const elements = this.getOrderedElements().filter(
      element => element.kind === "connector"
    ) as CanvasConnectorElement[];
    const { zoom } = this.viewport.getState();
    const hitRadius = 8 / Math.max(zoom, 0.1);

    for (let i = elements.length - 1; i >= 0; i -= 1) {
      const element = elements[i];
      const source = this.resolveConnectorPoint(element.source, anchors);
      const target = this.resolveConnectorPoint(element.target, anchors);
      if (!source || !target) continue;
      const style = element.style ?? this.connectorStyle;
      const path = buildConnectorPath(style, source, target);
      const polyline = flattenConnectorPath(path, 20);
      const distance = distanceToPolyline(point, polyline);
      if (distance <= hitRadius) return element;
    }
    return null;
  }

  /** Handle wheel events for zooming and panning. */
  handleWheel(event: WheelEvent): void {
    const container = this.container;
    if (!container) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest?.("[data-canvas-toolbar]") ||
      target?.closest?.("[data-board-controls]")
    ) {
      return;
    }
    event.preventDefault();

    const rect = container.getBoundingClientRect();
    const anchor: CanvasPoint = [
      event.clientX - rect.left,
      event.clientY - rect.top,
    ];

    if (event.ctrlKey || event.metaKey) {
      // 逻辑：按住 Ctrl/Meta 时缩放视图，以指针位置为锚点。
      const { zoom } = this.viewport.getState();
      const nextZoom = zoom * (event.deltaY > 0 ? 0.92 : 1.08);
      this.viewport.setZoom(nextZoom, anchor);
      return;
    }

    // 逻辑：普通滚轮用于平移视口。
    this.viewport.panBy(-event.deltaX, -event.deltaY);
  }

  /** Emit change notifications to subscribers. */
  private emitChange(): void {
    this.listeners.forEach(listener => listener());
  }

  /** Return elements sorted by zIndex with stable fallback. */
  private getOrderedElements(): CanvasElement[] {
    const elements = this.doc.getElements();
    // 按 zIndex 排序，后续渲染与命中均以此顺序为准。
    return elements.slice().sort((a, b) => {
      const az = a.zIndex ?? 0;
      const bz = b.zIndex ?? 0;
      if (az === bz) return 0;
      return az - bz;
    });
  }

  /** Compute the next zIndex based on current elements. */
  private getNextZIndex(): number {
    const elements = this.doc.getElements();
    if (elements.length === 0) return 1;
    return Math.max(...elements.map(element => element.zIndex ?? 0)) + 1;
  }
}
