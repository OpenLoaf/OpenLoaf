import { LayoutGrid, Layers, ArrowDown, ArrowUp, Copy, Lock, Trash2, Unlock, Maximize2 } from "lucide-react";
import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  CanvasElement,
  CanvasNodeElement,
  CanvasPoint,
  CanvasRect,
  CanvasSnapshot,
} from "../engine/types";
import { CanvasEngine } from "../engine/CanvasEngine";
import {
  MULTI_SELECTION_HANDLE_SIZE,
  MULTI_SELECTION_OUTLINE_PADDING,
} from "../engine/constants";
import { SelectionToolbarContainer, ToolbarGroup } from "../ui/SelectionToolbar";
import { useBoardContext } from "./BoardProvider";

type SingleSelectionToolbarProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Target node element. */
  element: CanvasNodeElement;
  /** Snapshot for positioning. */
  snapshot: CanvasSnapshot;
  /** Open node inspector. */
  onInspect: (elementId: string) => void;
};

/** Render a toolbar for a single selected node. */
export function SingleSelectionToolbar({
  engine,
  element,
  snapshot,
  onInspect,
}: SingleSelectionToolbarProps) {
  const { fileContext } = useBoardContext();
  // 逻辑：画布锁定时隐藏节点工具条。
  if (snapshot.locked) return null;
  const definition = engine.nodes.getDefinition(element.type);
  const items = definition?.toolbar?.({
    element,
    selected: true,
    fileContext,
    openInspector: onInspect,
    updateNodeProps: patch => {
      engine.doc.updateNodeProps(element.id, patch);
      engine.commitHistory();
    },
    ungroupSelection: () => engine.ungroupSelection(),
    uniformGroupSize: groupId => engine.uniformGroupSize(groupId),
    layoutGroup: (groupId, direction) => engine.layoutGroup(groupId, direction),
    getGroupLayoutAxis: groupId => engine.getGroupLayoutAxis(groupId),
  });

  const hasOverlap = hasNodeOverlap(element, snapshot.elements);
  const isTopMost = isNodeTopMost(element, snapshot.elements);
  const isBottomMost = isNodeBottomMost(element, snapshot.elements);
  const commonItems = buildCommonToolbarItems(engine, element, {
    showBringToFront: hasOverlap && !isTopMost,
    showSendToBack: hasOverlap && isTopMost && !isBottomMost,
  });
  const customItems = items ?? [];
  if (customItems.length === 0 && commonItems.length === 0) return null;

  const bounds = computeSelectionBounds([element]);

  return (
    <SelectionToolbarContainer
      snapshot={snapshot}
      bounds={bounds}
      offsetClass="-translate-y-full -mt-3"
      onPointerDown={event => {
        // 逻辑：避免拖拽节点时误触工具条。
        event.stopPropagation();
      }}
    >
      <div className="flex items-center gap-1">
        <ToolbarGroup
          items={customItems}
          showDivider={customItems.length > 0 && commonItems.length > 0}
        />
        <ToolbarGroup items={commonItems} />
      </div>
    </SelectionToolbarContainer>
  );
}

type MultiSelectionToolbarProps = {
  /** Snapshot used for selection state. */
  snapshot: CanvasSnapshot;
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Open inspector handler. */
  onInspect: (elementId: string) => void;
};

/** Render a toolbar for multi-selected nodes. */
export function MultiSelectionToolbar({
  snapshot,
  engine,
  onInspect,
}: MultiSelectionToolbarProps) {
  const { fileContext } = useBoardContext();
  // 逻辑：画布锁定时隐藏节点工具条。
  if (snapshot.locked) return null;
  const selectedNodes = snapshot.selectedIds
    .map(id => snapshot.elements.find(element => element.id === id))
    .filter((element): element is CanvasNodeElement => element?.kind === "node");
  if (selectedNodes.length <= 1) return null;

  const firstNode = selectedNodes[0];
  if (!firstNode) return null;
  const sameType = selectedNodes.every(node => node.type === firstNode.type);
  const definition = sameType ? engine.nodes.getDefinition(firstNode.type) : null;
  const customItems = definition?.toolbar
    ? definition.toolbar({
      element: firstNode,
      selected: true,
      fileContext,
      openInspector: onInspect,
      updateNodeProps: patch => {
        engine.doc.updateNodeProps(firstNode.id, patch);
        engine.commitHistory();
      },
      ungroupSelection: () => engine.ungroupSelection(),
      uniformGroupSize: groupId => engine.uniformGroupSize(groupId),
      layoutGroup: (groupId, direction) => engine.layoutGroup(groupId, direction),
      getGroupLayoutAxis: groupId => engine.getGroupLayoutAxis(groupId),
    })
    : [];

  const bounds = computeSelectionBounds(selectedNodes);

  return (
    <SelectionToolbarContainer
      snapshot={snapshot}
      bounds={bounds}
      offsetClass="-translate-y-full -mt-3"
      onPointerDown={event => {
        // 逻辑：避免多选工具条触发画布拖拽。
        event.stopPropagation();
      }}
    >
      <div className="flex items-center gap-1">
        <ToolbarGroup
          items={customItems}
          showDivider={customItems.length > 0}
        />
        <ToolbarGroup
          items={[
            {
              id: "group",
              label: "编组",
              icon: <Layers size={14} />,
              onSelect: () => engine.groupSelection(),
            },
            {
              id: "layout",
              label: "布局",
              icon: <LayoutGrid size={14} />,
              onSelect: () => engine.layoutSelection(),
            },
            {
              id: "delete",
              label: "删除",
              icon: <Trash2 size={14} />,
              onSelect: () => engine.deleteSelection(),
            },
          ]}
        />
      </div>
    </SelectionToolbarContainer>
  );
}

type MultiSelectionOutlineProps = {
  /** Snapshot used for selection state. */
  snapshot: CanvasSnapshot;
  /** Canvas engine instance. */
  engine: CanvasEngine;
};

/** Render outline box for multi-selected nodes. */
export function MultiSelectionOutline({ snapshot, engine }: MultiSelectionOutlineProps) {
  const selectedElements = snapshot.selectedIds
    .map(id => snapshot.elements.find(element => element.id === id))
    .filter((element): element is CanvasElement =>
      Boolean(element && element.kind === "node")
    );
  if (selectedElements.length <= 1) return null;
  const selectedNodes = selectedElements.filter(
    (element): element is CanvasNodeElement => element.kind === "node"
  );
  // 逻辑：仅允许可缩放节点参与多选缩放，避免笔迹等节点被拉伸。
  const resizableNodes = selectedNodes.filter(node => {
    const definition = engine.nodes.getDefinition(node.type);
    return definition?.capabilities?.resizable !== false;
  });

  const bounds = computeSelectionBounds(selectedElements);
  const { zoom, offset } = snapshot.viewport;
  const left = bounds.x * zoom + offset[0];
  const top = bounds.y * zoom + offset[1];
  const width = bounds.w * zoom;
  const height = bounds.h * zoom;
  const padding = MULTI_SELECTION_OUTLINE_PADDING;
  const handleSize = MULTI_SELECTION_HANDLE_SIZE;

  return (
    <>
      <div
        data-board-selection-outline
        className="pointer-events-none absolute z-10 rounded-lg border border-dashed border-slate-400/70 dark:border-slate-300/60"
        style={{
          left: left - padding,
          top: top - padding,
          width: width + padding * 2,
          height: height + padding * 2,
        }}
      />
      {resizableNodes.length > 0 ? (
        <MultiSelectionResizeHandle
          engine={engine}
          nodes={resizableNodes}
          bounds={bounds}
          viewport={snapshot.viewport}
          size={handleSize}
          padding={padding}
        />
      ) : null}
    </>
  );
}

type MultiSelectionResizeHandleProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Selected node elements. */
  nodes: CanvasNodeElement[];
  /** Selection bounds in world space. */
  bounds: CanvasRect;
  /** Viewport state for positioning. */
  viewport: CanvasSnapshot["viewport"];
  /** Handle size in px. */
  size: number;
  /** Outline padding in px. */
  padding: number;
};

/** Render and handle multi-selection resize control. */
function MultiSelectionResizeHandle({
  engine,
  nodes,
  bounds,
  viewport,
  size,
  padding,
}: MultiSelectionResizeHandleProps) {
  /** Drag state captured on pointer down. */
  const startRef = useRef<{
    startWorld: CanvasPoint;
    startBounds: CanvasRect;
    startRects: Map<string, [number, number, number, number]>;
  } | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (engine.isLocked()) return;
    event.preventDefault();
    event.stopPropagation();

    const container = engine.getContainer();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const screenPoint: [number, number] = [
      event.clientX - rect.left,
      event.clientY - rect.top,
    ];
    const startWorld = engine.screenToWorld(screenPoint);
    const startRects = new Map<string, [number, number, number, number]>();
    nodes.forEach(node => {
      startRects.set(node.id, [...node.xywh]);
    });
    startRef.current = {
      startWorld,
      startBounds: { ...bounds },
      startRects,
    };

    engine.setDraggingElementId(nodes[0]?.id ?? null);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!startRef.current) return;
      const nextScreen: [number, number] = [
        moveEvent.clientX - rect.left,
        moveEvent.clientY - rect.top,
      ];
      const nextWorld = engine.screenToWorld(nextScreen);
      const dx = nextWorld[0] - startRef.current.startWorld[0];
      const dy = nextWorld[1] - startRef.current.startWorld[1];
      const startBounds = startRef.current.startBounds;
      const nextW = Math.max(40, startBounds.w + dx);
      const nextH = Math.max(40, startBounds.h + dy);
      let scaleX = nextW / Math.max(startBounds.w, 1);
      let scaleY = nextH / Math.max(startBounds.h, 1);

      // 逻辑：根据节点最小/最大尺寸约束缩放比例。
      const scaleLimits = getGroupScaleLimits(engine, nodes, startRef.current.startRects);
      scaleX = clamp(scaleX, scaleLimits.minX, scaleLimits.maxX);
      scaleY = clamp(scaleY, scaleLimits.minY, scaleLimits.maxY);

      engine.doc.transact(() => {
        startRef.current?.startRects.forEach((rectValue, id) => {
          const [x, y, w, h] = rectValue;
          const nextX = startBounds.x + (x - startBounds.x) * scaleX;
          const nextY = startBounds.y + (y - startBounds.y) * scaleY;
          const nextWidth = w * scaleX;
          const nextHeight = h * scaleY;
          engine.doc.updateElement(id, {
            xywh: [nextX, nextY, nextWidth, nextHeight],
          });
        });
      });
    };

    const handlePointerUp = () => {
      engine.setDraggingElementId(null);
      engine.commitHistory();
      startRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleLeft = bounds.x * viewport.zoom + viewport.offset[0] - padding;
  const handleTop = bounds.y * viewport.zoom + viewport.offset[1] - padding;
  const handleWidth = bounds.w * viewport.zoom + padding * 2;
  const handleHeight = bounds.h * viewport.zoom + padding * 2;
  const x = handleLeft + handleWidth - size / 2;
  const y = handleTop + handleHeight - size / 2;

  return (
    <button
      type="button"
      aria-label="Resize selection"
      data-multi-resize-handle
      onPointerDown={handlePointerDown}
      className="pointer-events-auto absolute z-20 flex items-center justify-center rounded-md border border-slate-400/70 bg-background/90 text-slate-500 shadow-[0_6px_12px_rgba(15,23,42,0.12)] transition hover:text-slate-800 dark:border-slate-300/60 dark:text-slate-200"
      style={{ left: x, top: y, width: size, height: size }}
    >
      <Maximize2 size={14} className="pointer-events-none rotate-90" />
    </button>
  );
}

/** Clamp a value between bounds. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Compute scale limits for a multi-selection resize. */
function getGroupScaleLimits(
  engine: CanvasEngine,
  nodes: CanvasNodeElement[],
  startRects: Map<string, [number, number, number, number]>
) {
  let minX = 0.1;
  let minY = 0.1;
  let maxX = 6;
  let maxY = 6;
  nodes.forEach(node => {
    const definition = engine.nodes.getDefinition(node.type);
    const minSize = definition?.capabilities?.minSize;
    const maxSize = definition?.capabilities?.maxSize;
    const rect = startRects.get(node.id);
    if (!rect) return;
    const [, , w, h] = rect;
    if (minSize) {
      minX = Math.max(minX, minSize.w / Math.max(w, 1));
      minY = Math.max(minY, minSize.h / Math.max(h, 1));
    }
    if (maxSize) {
      maxX = Math.min(maxX, maxSize.w / Math.max(w, 1));
      maxY = Math.min(maxY, maxSize.h / Math.max(h, 1));
    }
  });
  return { minX, minY, maxX, maxY };
}

/** Build shared toolbar items for every node. */
function buildCommonToolbarItems(
  engine: CanvasEngine,
  element: CanvasNodeElement,
  options?: { showBringToFront?: boolean; showSendToBack?: boolean }
) {
  // 逻辑：确保操作目标锁定到当前节点。
  const focusSelection = () => {
    engine.selection.setSelection([element.id]);
  };
  const isLocked = element.locked === true;
  const items = [
    {
      id: "duplicate",
      label: "复制",
      icon: <Copy size={14} />,
      onSelect: () => {
        focusSelection();
        engine.copySelection();
        engine.pasteClipboard();
      },
    },
    ...(options?.showBringToFront
      ? [
          {
            id: "bring-to-front",
            label: "置顶",
            icon: <ArrowUp size={14} />,
            onSelect: () => {
              focusSelection();
              engine.bringNodeToFront(element.id);
            },
          },
        ]
      : []),
    ...(options?.showSendToBack
      ? [
          {
            id: "send-to-back",
            label: "置底",
            icon: <ArrowDown size={14} />,
            onSelect: () => {
              focusSelection();
              engine.sendNodeToBack(element.id);
            },
          },
        ]
      : []),
    {
      id: "lock",
      label: isLocked ? "解锁" : "锁定",
      icon: isLocked ? <Unlock size={14} /> : <Lock size={14} />,
      onSelect: () => {
        focusSelection();
        engine.setElementLocked(element.id, !isLocked);
      },
    },
    ...(!isLocked
      ? [
          {
            id: "delete",
            label: "删除",
            icon: <Trash2 size={14} />,
            onSelect: () => {
              focusSelection();
              engine.deleteSelection();
            },
          },
        ]
      : []),
  ];
  return items;
}

/** Compute bounds for a list of selected elements. */
function computeSelectionBounds(elements: CanvasElement[]): CanvasRect {
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
  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Check whether the selected node overlaps any other node. */
function hasNodeOverlap(target: CanvasNodeElement, elements: CanvasElement[]): boolean {
  const [tx, ty, tw, th] = target.xywh;
  const tRight = tx + tw;
  const tBottom = ty + th;
  return elements.some(element => {
    if (element.kind !== "node" || element.id === target.id) return false;
    const [x, y, w, h] = element.xywh;
    const right = x + w;
    const bottom = y + h;
    return tx < right && tRight > x && ty < bottom && tBottom > y;
  });
}

/** Check whether the node is already on top. */
function isNodeTopMost(target: CanvasNodeElement, elements: CanvasElement[]): boolean {
  const maxZ = elements
    .filter(element => element.kind === "node")
    .reduce((current, element) => Math.max(current, element.zIndex ?? 0), 0);
  return (target.zIndex ?? 0) >= maxZ;
}

/** Check whether the node is already at the bottom. */
function isNodeBottomMost(target: CanvasNodeElement, elements: CanvasElement[]): boolean {
  const minZ = elements
    .filter(element => element.kind === "node")
    .reduce((current, element) => Math.min(current, element.zIndex ?? 0), 0);
  return (target.zIndex ?? 0) <= minZ;
}
