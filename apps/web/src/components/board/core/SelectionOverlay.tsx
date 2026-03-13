/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { LayoutGrid, Layers, ArrowDown, ArrowUp, Copy, Lock, Trash2, Unlock, Maximize2 } from "lucide-react";
import {
  BOARD_TOOLBAR_ITEM_BLUE,
  BOARD_TOOLBAR_ITEM_AMBER,
  BOARD_TOOLBAR_ITEM_RED,
} from "../ui/board-style-system";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SVGProps } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  CanvasElement,
  CanvasNodeElement,
  CanvasPoint,
  CanvasRect,
  CanvasSnapshot,
  CanvasToolbarItem,
  CanvasViewportState,
} from "../engine/types";
import { resolveNodeMinSize } from "../engine/types";
import { CanvasEngine } from "../engine/CanvasEngine";
import {
  MULTI_SELECTION_HANDLE_SIZE,
  MULTI_SELECTION_OUTLINE_PADDING,
  GUIDE_MARGIN,
  MIN_ZOOM,
  SNAP_PIXEL,
} from "../engine/constants";
import { MINDMAP_META } from "../engine/mindmap-layout";
import { getGroupOutlinePadding, isGroupNodeType } from "../engine/grouping";
import { snapResizeRectSE } from "../utils/alignment-guides";
import { SelectionToolbarContainer, ToolbarGroup } from "../ui/SelectionToolbar";
import { PanelItem } from "../ui/ToolbarParts";
import { useBoardContext } from "./BoardProvider";
import { useBoardViewState } from "./useBoardViewState";

/** Detect whether the viewport is actively panning or zooming. */
function useIsViewportMoving(engine: CanvasEngine) {
  const viewState = useBoardViewState(engine);
  const [zooming, setZooming] = useState(false);
  const timerRef = useRef<number | null>(null);
  const initialRef = useRef(true);

  useEffect(() => {
    // 逻辑：初始化时不标记缩放，仅后续变化才触发。
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }
    setZooming(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setZooming(false);
    }, 100);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [viewState.viewport.zoom]);

  return { isMoving: viewState.panning || zooming, viewState };
}

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
  const { t } = useTranslation('board');
  const { fileContext } = useBoardContext();
  // 逻辑：Hook 必须在条件 return 之前调用，避免 Hook 顺序变化。
  const [openPanelId, setOpenPanelId] = useState<string | null>(null);
  const prevPanelIdRef = useRef<string | null>(null);
  const toolbarItemsRef = useRef<CanvasToolbarItem[]>([]);
  useEffect(() => {
    if (!openPanelId) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-node-toolbar]")) return;
      // 逻辑：点击工具条外部时收起二级面板。
      setOpenPanelId(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [openPanelId]);
  // 逻辑：面板关闭时触发 onPanelClose，用于保存颜色历史等延迟操作。
  useEffect(() => {
    const prev = prevPanelIdRef.current;
    prevPanelIdRef.current = openPanelId;
    if (prev && prev !== openPanelId) {
      const closedItem = toolbarItemsRef.current.find(i => i.id === prev);
      closedItem?.onPanelClose?.();
    }
  }, [openPanelId]);

  // 逻辑：画布锁定时隐藏节点工具条。
  if (snapshot.locked) return null;
  const definition = engine.nodes.getDefinition(element.type);
  const items = definition?.toolbar?.({
    element,
    selected: true,
    fileContext,
    engine,
    openInspector: onInspect,
    updateNodeProps: patch => {
      engine.doc.updateNodeProps(element.id, patch);
      engine.commitHistory();
    },
    ungroupSelection: () => engine.ungroupSelection(),
    uniformGroupSize: groupId => engine.uniformGroupSize(groupId),
    layoutGroup: (groupId, direction) => engine.layoutGroup(groupId, direction),
    getGroupLayoutAxis: groupId => engine.getGroupLayoutAxis(groupId),
    colorHistory: engine.getColorHistory(),
    addColorHistory: color => engine.addColorHistory(color),
  });

  const hasOverlap = hasNodeOverlap(element, snapshot.elements);
  const isTopMost = isNodeTopMost(element, snapshot.elements);
  const isBottomMost = isNodeBottomMost(element, snapshot.elements);
  const commonItems = buildCommonToolbarItems(t, engine, element, {
    showBringToFront: hasOverlap && !isTopMost,
    showSendToBack: hasOverlap && isTopMost && !isBottomMost,
  });
  const mindmapLayoutItems = buildMindmapLayoutItems(t, engine, element, snapshot);
  const customItems = items ?? [];
  const allItems = [...customItems, ...mindmapLayoutItems, ...commonItems];
  toolbarItemsRef.current = allItems;
  if (
    customItems.length === 0
    && commonItems.length === 0
    && mindmapLayoutItems.length === 0
  ) {
    return null;
  }

  const bounds = computeSelectionBounds([element], snapshot.viewport.zoom);

  return (
    <SelectionToolbarContainer
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
          openPanelId={openPanelId}
          setOpenPanelId={setOpenPanelId}
          showDivider={
            customItems.length > 0 && mindmapLayoutItems.length > 0
          }
        />
        <ToolbarGroup
          items={mindmapLayoutItems}
          openPanelId={openPanelId}
          setOpenPanelId={setOpenPanelId}
          showDivider={
            mindmapLayoutItems.length > 0 && commonItems.length > 0
          }
        />
        <ToolbarGroup
          items={commonItems}
          openPanelId={openPanelId}
          setOpenPanelId={setOpenPanelId}
        />
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

type MindmapLayoutDirection = "right" | "left" | "balanced";
/** Render the mindmap right layout icon. */
function RightLayoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      style={{ userSelect: "none", flexShrink: 0 }}
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M11.25 8.5a4.25 4.25 0 0 1 4.25-4.25H21a.75.75 0 0 1 0 1.5h-5.5a2.75 2.75 0 0 0-2.75 2.75c0 1.049-.38 2.009-1.01 2.75H21a.75.75 0 0 1 0 1.5h-9.26a4.23 4.23 0 0 1 1.01 2.75 2.75 2.75 0 0 0 2.75 2.75H21a.75.75 0 0 1 0 1.5h-5.5a4.25 4.25 0 0 1-4.25-4.25 2.75 2.75 0 0 0-2.75-2.75H3a.75.75 0 0 1 0-1.5h5.5a2.75 2.75 0 0 0 2.75-2.75"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Render the mindmap left layout icon. */
function LeftLayoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      style={{ userSelect: "none", flexShrink: 0 }}
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M11.25 8.5a4.25 4.25 0 0 1 4.25-4.25H21a.75.75 0 0 1 0 1.5h-5.5a2.75 2.75 0 0 0-2.75 2.75c0 1.049-.38 2.009-1.01 2.75H21a.75.75 0 0 1 0 1.5h-9.26a4.23 4.23 0 0 1 1.01 2.75 2.75 2.75 0 0 0 2.75 2.75H21a.75.75 0 0 1 0 1.5h-5.5a4.25 4.25 0 0 1-4.25-4.25 2.75 2.75 0 0 0-2.75-2.75H3a.75.75 0 0 1 0-1.5h5.5a2.75 2.75 0 0 0 2.75-2.75"
        clipRule="evenodd"
        transform="rotate(180 12 12)"
      />
    </svg>
  );
}

/** Render the mindmap balanced layout icon. */
function RadiantIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      style={{ userSelect: "none", flexShrink: 0 }}
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M2.25 5A.75.75 0 0 1 3 4.25h1A4.25 4.25 0 0 1 8.25 8.5 2.75 2.75 0 0 0 11 11.25h2a2.75 2.75 0 0 0 2.75-2.75A4.25 4.25 0 0 1 20 4.25h1a.75.75 0 0 1 0 1.5h-1a2.75 2.75 0 0 0-2.75 2.75c0 1.049-.38 2.009-1.01 2.75H21a.75.75 0 0 1 0 1.5h-4.76a4.23 4.23 0 0 1 1.01 2.75A2.75 2.75 0 0 0 20 18.25h1a.75.75 0 0 1 0 1.5h-1a4.25 4.25 0 0 1-4.25-4.25A2.75 2.75 0 0 0 13 12.75h-2a2.75 2.75 0 0 0-2.75 2.75A4.25 4.25 0 0 1 4 19.75H3a.75.75 0 0 1 0-1.5h1a2.75 2.75 0 0 0 2.75-2.75c0-1.049.38-2.009 1.01-2.75H3a.75.75 0 0 1 0-1.5h4.76A4.23 4.23 0 0 1 6.75 8.5 2.75 2.75 0 0 0 4 5.75H3A.75.75 0 0 1 2.25 5"
        clipRule="evenodd"
      />
    </svg>
  );
}

type MindmapLayoutItem = {
  id: MindmapLayoutDirection;
  title: string;
  icon: ReactNode;
};

function buildMindmapLayoutItems_data(t: TFunction): MindmapLayoutItem[] {
  return [
    { id: 'left', title: t('selection.mindmapLayout.left'), icon: <LeftLayoutIcon className="h-3.5 w-3.5" /> },
    { id: 'balanced', title: t('selection.mindmapLayout.balanced'), icon: <RadiantIcon className="h-3.5 w-3.5" /> },
    { id: 'right', title: t('selection.mindmapLayout.right'), icon: <RightLayoutIcon className="h-3.5 w-3.5" /> },
  ];
}

/** Render the mindmap toolbar icon. */
function MindmapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      style={{ userSelect: "none", flexShrink: 0 }}
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M10.458 5.95H8.5c-.69 0-1.25.56-1.25 1.25V10c0 .45-.108.875-.3 1.25h3.467a2.5 2.5 0 0 1 2.333-1.6h5.5a2.5 2.5 0 0 1 0 5h-5.5a2.5 2.5 0 0 1-2.427-1.9H6.95c.192.375.3.8.3 1.25v2.809c0 .69.56 1.25 1.25 1.25h1.914a2.5 2.5 0 0 1 2.336-1.609h5.5a2.5 2.5 0 0 1 0 5h-5.5a2.5 2.5 0 0 1-2.425-1.891H8.5a2.75 2.75 0 0 1-2.75-2.75V14c0-.69-.56-1.25-1.25-1.25H2v-1.5h2.512A1.25 1.25 0 0 0 5.75 10V7.2A2.75 2.75 0 0 1 8.5 4.45h1.8a2.5 2.5 0 0 1 2.45-2h5.5a2.5 2.5 0 0 1 0 5h-5.5a2.5 2.5 0 0 1-2.292-1.5m1.292-1a1 1 0 0 1 1-1h5.5a1 1 0 1 1 0 2h-5.5a1 1 0 0 1-1-1m0 7.2a1 1 0 0 1 1-1h5.5a1 1 0 1 1 0 2h-5.5a1 1 0 0 1-1-1m1 5.8a1 1 0 1 0 0 2h5.5a1 1 0 1 0 0-2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Render a toolbar for multi-selected nodes. */
export function MultiSelectionToolbar({
  snapshot,
  engine,
  onInspect,
}: MultiSelectionToolbarProps) {
  const { t } = useTranslation('board');
  const { fileContext } = useBoardContext();
  // 逻辑：Hook 必须在条件 return 之前调用，避免 Hook 顺序变化。
  const [openPanelId, setOpenPanelId] = useState<string | null>(null);
  const prevMultiPanelIdRef = useRef<string | null>(null);
  const multiToolbarItemsRef = useRef<CanvasToolbarItem[]>([]);
  useEffect(() => {
    if (!openPanelId) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-node-toolbar]")) return;
      // 逻辑：点击工具条外部时收起二级面板。
      setOpenPanelId(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [openPanelId]);
  // 逻辑：面板关闭时触发 onPanelClose。
  useEffect(() => {
    const prev = prevMultiPanelIdRef.current;
    prevMultiPanelIdRef.current = openPanelId;
    if (prev && prev !== openPanelId) {
      const closedItem = multiToolbarItemsRef.current.find(i => i.id === prev);
      closedItem?.onPanelClose?.();
    }
  }, [openPanelId]);

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
      multiSelect: true,
      fileContext,
      engine,
      openInspector: onInspect,
      updateNodeProps: patch => {
        engine.doc.transact(() => {
          // 逻辑：多选同类节点时批量更新样式，确保一次操作同步所有节点。
          selectedNodes.forEach(node => {
            engine.doc.updateNodeProps(node.id, patch);
          });
        });
        engine.commitHistory();
      },
      ungroupSelection: () => engine.ungroupSelection(),
      uniformGroupSize: groupId => engine.uniformGroupSize(groupId),
      layoutGroup: (groupId, direction) => engine.layoutGroup(groupId, direction),
      getGroupLayoutAxis: groupId => engine.getGroupLayoutAxis(groupId),
      colorHistory: engine.getColorHistory(),
      addColorHistory: color => engine.addColorHistory(color),
    })
    : [];
  multiToolbarItemsRef.current = customItems;

  const layoutLabel = t('selection.toolbar.autoLayout');
  const layoutIcon = <LayoutGrid size={14} />;
  const bounds = computeSelectionBounds(selectedNodes, snapshot.viewport.zoom);

  return (
    <SelectionToolbarContainer
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
          openPanelId={openPanelId}
          setOpenPanelId={setOpenPanelId}
          showDivider={customItems.length > 0}
        />
        <ToolbarGroup
          items={[
            {
              id: "group",
              label: t('selection.toolbar.group'),
              icon: <Layers size={14} />,
              className: BOARD_TOOLBAR_ITEM_BLUE,
              onSelect: () => engine.groupSelection(),
            },
            {
              id: "layout",
              label: layoutLabel,
              icon: layoutIcon,
              className: BOARD_TOOLBAR_ITEM_BLUE,
              onSelect: () => engine.layoutSelection(),
            },
            {
              id: "delete",
              label: t('selection.toolbar.delete'),
              icon: <Trash2 size={14} />,
              className: BOARD_TOOLBAR_ITEM_RED,
              onSelect: () => engine.deleteSelection(),
            },
          ]}
          openPanelId={openPanelId}
          setOpenPanelId={setOpenPanelId}
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

/** Sync a multi-selection outline with the DOM rects of all selected nodes. */
function useMultiDomBoundsSync(
  engine: CanvasEngine,
  elementIds: string[],
  enabled: boolean,
  outlineRef: React.RefObject<HTMLDivElement | null>,
  padding: number,
): void {
  // 逻辑：用 join 生成稳定 key，仅选区变化时重建 ResizeObserver。
  const idsKey = elementIds.join(",");

  useLayoutEffect(() => {
    if (!enabled || elementIds.length === 0) return;
    const container = engine.getContainer();
    if (!container || !outlineRef.current) return;

    const nodeEls: HTMLElement[] = [];
    for (const id of elementIds) {
      const el = engine.getNodeDomElement(id);
      if (el) nodeEls.push(el);
    }
    if (nodeEls.length === 0) return;

    const sync = () => {
      const outline = outlineRef.current;
      if (!outline) return;
      const containerRect = container.getBoundingClientRect();
      let minLeft = Number.POSITIVE_INFINITY;
      let minTop = Number.POSITIVE_INFINITY;
      let maxRight = Number.NEGATIVE_INFINITY;
      let maxBottom = Number.NEGATIVE_INFINITY;

      for (const nodeEl of nodeEls) {
        const nodeRect = nodeEl.getBoundingClientRect();
        const l = nodeRect.left - containerRect.left;
        const t = nodeRect.top - containerRect.top;
        minLeft = Math.min(minLeft, l);
        minTop = Math.min(minTop, t);
        maxRight = Math.max(maxRight, l + nodeRect.width);
        maxBottom = Math.max(maxBottom, t + nodeRect.height);
      }

      if (!Number.isFinite(minLeft)) return;
      outline.style.left = `${minLeft - padding}px`;
      outline.style.top = `${minTop - padding}px`;
      outline.style.width = `${maxRight - minLeft + padding * 2}px`;
      outline.style.height = `${maxBottom - minTop + padding * 2}px`;
    };

    sync();
    const observer = new ResizeObserver(sync);
    for (const nodeEl of nodeEls) observer.observe(nodeEl);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, idsKey, enabled, padding]);
}

/** Render outline box for multi-selected nodes. */
export function MultiSelectionOutline({ snapshot, engine }: MultiSelectionOutlineProps) {
  // 逻辑：视图状态单独订阅，避免多选框跟随缩放时触发全局渲染。
  const { isMoving, viewState } = useIsViewportMoving(engine);
  const selectedElements = snapshot.selectedIds
    .map(id => snapshot.elements.find(element => element.id === id))
    .filter((element): element is CanvasElement =>
      Boolean(element && element.kind === "node")
    );

  const selectedNodes = selectedElements.filter(
    (element): element is CanvasNodeElement => element.kind === "node"
  );
  // 逻辑：仅允许可缩放节点参与多选缩放，避免笔迹等节点被拉伸。
  const resizableNodes = selectedNodes.filter(node => {
    const definition = engine.nodes.getDefinition(node.type);
    return definition?.capabilities?.resizable !== false;
  });

  const padding = MULTI_SELECTION_OUTLINE_PADDING;
  const outlineRef = useRef<HTMLDivElement>(null);
  const selectedIds = selectedElements.map(e => e.id);

  // 逻辑：通过 DOM 测量同步多选边框位置，消除 store 与 DOM 之间的帧延迟不一致。
  useMultiDomBoundsSync(
    engine,
    selectedIds,
    !isMoving && selectedElements.length > 1,
    outlineRef,
    padding,
  );

  if (selectedElements.length <= 1) return null;
  // 逻辑：平移或缩放画布时隐藏选区框，避免 React 状态与 DOM transform 帧差导致位置偏移。
  if (isMoving) return null;

  const bounds = computeSelectionBounds(selectedElements, viewState.viewport.zoom);
  const { zoom, offset } = viewState.viewport;
  const left = bounds.x * zoom + offset[0];
  const top = bounds.y * zoom + offset[1];
  const width = bounds.w * zoom;
  const height = bounds.h * zoom;
  const handleSize = MULTI_SELECTION_HANDLE_SIZE;

  return (
    <>
      <div
        ref={outlineRef}
        data-board-selection-outline
        className="pointer-events-none absolute z-10 rounded-xl border border-dashed border-muted-foreground/40"
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
          viewport={viewState.viewport}
          size={handleSize}
          padding={padding}
        />
      ) : null}
    </>
  );
}

type SingleSelectionOutlineProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Target node element. */
  element: CanvasNodeElement;
  /** Snapshot for positioning. */
  snapshot: CanvasSnapshot;
};

type ResizeCorner = "top-left" | "top-right" | "bottom-right" | "bottom-left";

/** Corner handle size in screen pixels. */
const SINGLE_SELECTION_HANDLE_SIZE = 10;
/** Corner handle metadata for single selection resizing. */
const SINGLE_SELECTION_CORNERS: Array<{ id: ResizeCorner; cursorClass: string }> = [
  { id: "top-left", cursorClass: "cursor-nwse-resize" },
  { id: "top-right", cursorClass: "cursor-nesw-resize" },
  { id: "bottom-right", cursorClass: "cursor-nwse-resize" },
  { id: "bottom-left", cursorClass: "cursor-nesw-resize" },
];

/** Cached anchor data for a corner resize gesture. */
type CornerMeta = {
  /** Anchor x position in world space. */
  anchorX: number;
  /** Anchor y position in world space. */
  anchorY: number;
  /** Whether handle is on the right side. */
  isRight: boolean;
  /** Whether handle is on the bottom side. */
  isBottom: boolean;
};

/** Resolve anchor and direction metadata for a corner resize. */
function resolveCornerMeta(
  corner: ResizeCorner,
  rect: { x: number; y: number; w: number; h: number }
): CornerMeta {
  const isRight = corner === "top-right" || corner === "bottom-right";
  const isBottom = corner === "bottom-left" || corner === "bottom-right";
  return {
    isRight,
    isBottom,
    anchorX: isRight ? rect.x : rect.x + rect.w,
    anchorY: isBottom ? rect.y : rect.y + rect.h,
  };
}

/** Sync a selection outline (and optional corner handles) with the actual node DOM rect.
 *  Uses useLayoutEffect to correct positions before paint and a ResizeObserver
 *  for ongoing size-change corrections (e.g. auto-resize of text nodes). */
function useDomBoundsSync(
  engine: CanvasEngine,
  elementId: string,
  enabled: boolean,
  outlineRef: React.RefObject<HTMLDivElement | null>,
  handleRefsMap: React.MutableRefObject<Record<string, HTMLButtonElement | null>>,
): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    const container = engine.getContainer();
    if (!container || !outlineRef.current) return;
    const nodeEl = engine.getNodeDomElement(elementId);
    if (!nodeEl) return;

    const sync = () => {
      const outline = outlineRef.current;
      if (!outline) return;
      const containerRect = container.getBoundingClientRect();
      const nodeRect = nodeEl.getBoundingClientRect();
      const l = nodeRect.left - containerRect.left;
      const t = nodeRect.top - containerRect.top;
      const w = nodeRect.width;
      const h = nodeRect.height;

      outline.style.left = `${l}px`;
      outline.style.top = `${t}px`;
      outline.style.width = `${w}px`;
      outline.style.height = `${h}px`;

      const corners: Record<string, { x: number; y: number }> = {
        "top-left": { x: l, y: t },
        "top-right": { x: l + w, y: t },
        "bottom-right": { x: l + w, y: t + h },
        "bottom-left": { x: l, y: t + h },
      };
      for (const [id, pos] of Object.entries(corners)) {
        const btn = handleRefsMap.current[id];
        if (btn) {
          btn.style.left = `${pos.x}px`;
          btn.style.top = `${pos.y}px`;
        }
      }
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(nodeEl);
    return () => observer.disconnect();
  }, [engine, elementId, enabled]);
}

/** Render selection outline and resize handles for a single node. */
export function SingleSelectionOutline({
  engine,
  element,
  snapshot,
}: SingleSelectionOutlineProps) {
  const definition = engine.nodes.getDefinition(element.type);
  const canResize = definition?.capabilities?.resizable !== false;

  // 逻辑：视图变化时单独更新控制柄位置，避免全量快照渲染。
  const { isMoving, viewState } = useIsViewportMoving(engine);

  // Refs for DOM-based position sync.
  const outlineRef = useRef<HTMLDivElement>(null);
  const handleRefsMap = useRef<Record<string, HTMLButtonElement | null>>({});

  // 逻辑：通过 DOM 测量同步选区边框位置，消除 store 与 DOM 之间的帧延迟不一致。
  useDomBoundsSync(engine, element.id, !isMoving, outlineRef, handleRefsMap);

  // 逻辑：平移或缩放画布时隐藏选中框，避免 React 状态与 DOM transform 帧差导致位置偏移。
  if (isMoving) return null;
  const { zoom, offset } = viewState.viewport;
  const bounds = computeSelectionBounds([element], viewState.viewport.zoom);
  const left = bounds.x * zoom + offset[0];
  const top = bounds.y * zoom + offset[1];
  const width = bounds.w * zoom;
  const height = bounds.h * zoom;
  const allowHandles = canResize && !snapshot.locked && !element.locked;

  const handlePointerDown = (corner: ResizeCorner) => {
    return (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (engine.isLocked()) return;
      event.stopPropagation();
      event.preventDefault();

      const container = engine.getContainer();
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const startPoint: [number, number] = [
        event.clientX - rect.left,
        event.clientY - rect.top,
      ];
      const startWorld = engine.screenToWorld(startPoint);
      const [startX, startY, startW, startH] = element.xywh;
      const minSize = resolveNodeMinSize(definition, element);
      const maxSize = definition?.capabilities?.maxSize;
      const resizeMode = definition?.capabilities?.resizeMode ?? "free";
      const useRatioRange = resizeMode === "ratio-range" && Boolean(maxSize);
      const useUniformResize =
        resizeMode === "uniform" || (resizeMode === "ratio-range" && !maxSize);
      const meta = resolveCornerMeta(corner, { x: startX, y: startY, w: startW, h: startH });

      engine.setAlignmentGuides([]);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextPoint: [number, number] = [
          moveEvent.clientX - rect.left,
          moveEvent.clientY - rect.top,
        ];
        const nextWorld = engine.screenToWorld(nextPoint);
        const dx = nextWorld[0] - startWorld[0];
        const dy = nextWorld[1] - startWorld[1];
        const useWidth = Math.abs(dx) >= Math.abs(dy);
        const horizontalSign = meta.isRight ? 1 : -1;
        const verticalSign = meta.isBottom ? 1 : -1;
        let nextW = startW + dx * horizontalSign;
        let nextH = startH + dy * verticalSign;
        if (useUniformResize) {
          // 逻辑：等比例缩放时按统一比例计算，确保宽高比不变。
          const rawScale = useWidth
            ? nextW / startW
            : nextH / startH;
          const minScale = Math.max(
            minSize.w / startW,
            minSize.h / startH
          );
          const maxScale = maxSize
            ? Math.min(maxSize.w / startW, maxSize.h / startH)
            : Number.POSITIVE_INFINITY;
          const scale = Math.min(maxScale, Math.max(minScale, rawScale));
          nextW = startW * scale;
          nextH = startH * scale;
        } else if (useRatioRange && maxSize) {
          // 逻辑：按拖拽主轴在 min/max 区间线性插值宽高比。
          const minRatio = minSize.w / Math.max(minSize.h, 1);
          const maxRatio = maxSize.w / Math.max(maxSize.h, 1);
          if (useWidth) {
            const clampedW = Math.min(maxSize.w, Math.max(minSize.w, nextW));
            const widthRange = maxSize.w - minSize.w;
            const t = widthRange === 0 ? 0 : (clampedW - minSize.w) / widthRange;
            const ratio = minRatio + (maxRatio - minRatio) * t;
            nextW = clampedW;
            nextH = clampedW / Math.max(ratio, 0.001);
          } else {
            const clampedH = Math.min(maxSize.h, Math.max(minSize.h, nextH));
            const heightRange = maxSize.h - minSize.h;
            const t = heightRange === 0 ? 0 : (clampedH - minSize.h) / heightRange;
            const ratio = minRatio + (maxRatio - minRatio) * t;
            nextH = clampedH;
            nextW = clampedH * ratio;
          }
        }
        // 逻辑：保持最小尺寸，避免节点缩放到不可操作。
        const baseRect = {
          w: Math.max(minSize.w, nextW),
          h: Math.max(minSize.h, nextH),
        };
        const clampedRect = maxSize
          ? {
              w: Math.min(maxSize.w, baseRect.w),
              h: Math.min(maxSize.h, baseRect.h),
            }
          : baseRect;
        const nextX = meta.isRight ? meta.anchorX : meta.anchorX - clampedRect.w;
        const nextY = meta.isBottom ? meta.anchorY : meta.anchorY - clampedRect.h;

        if (useUniformResize || useRatioRange) {
          // 逻辑：等比例/比例区间缩放时不参与吸附，避免破坏比例。
          engine.doc.updateElement(element.id, {
            xywh: [nextX, nextY, clampedRect.w, clampedRect.h],
          });
          engine.setAlignmentGuides([]);
          return;
        }
        if (corner === "bottom-right") {
          const { zoom: currentZoom } = engine.viewport.getState();
          // 逻辑：缩放下按屏幕像素换算吸附阈值。
          const threshold = SNAP_PIXEL / Math.max(currentZoom, MIN_ZOOM);
          const margin = GUIDE_MARGIN / Math.max(currentZoom, MIN_ZOOM);
          const others = engine.doc
            .getElements()
            .filter(
              current => current.kind === "node" && current.id !== element.id
            )
            .map(current => {
              const [x, y, widthValue, heightValue] = current.xywh;
              return { x, y, w: widthValue, h: heightValue };
            });
          const snapped = snapResizeRectSE(
            { x: nextX, y: nextY, w: clampedRect.w, h: clampedRect.h },
            others,
            threshold,
            margin,
            minSize
          );
          engine.doc.updateElement(element.id, {
            xywh: [snapped.rect.x, snapped.rect.y, snapped.rect.w, snapped.rect.h],
          });
          engine.setAlignmentGuides(snapped.guides);
          return;
        }
        engine.doc.updateElement(element.id, {
          xywh: [nextX, nextY, clampedRect.w, clampedRect.h],
        });
        engine.setAlignmentGuides([]);
      };

      const handlePointerUp = () => {
        engine.setAlignmentGuides([]);
        engine.commitHistory();
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    };
  };

  const cornerPoints: Record<ResizeCorner, { x: number; y: number }> = {
    "top-left": { x: left, y: top },
    "top-right": { x: left + width, y: top },
    "bottom-right": { x: left + width, y: top + height },
    "bottom-left": { x: left, y: top + height },
  };

  return (
    <>
      <div
        ref={outlineRef}
        data-board-selection-outline
        className="pointer-events-none absolute z-10 box-border rounded-none border-2 border-[#1E96EB]"
        style={{ left, top, width, height }}
      />
      {allowHandles
        ? SINGLE_SELECTION_CORNERS.map((corner) => {
            const point = cornerPoints[corner.id];
            return (
              <button
                key={corner.id}
                ref={(el) => { handleRefsMap.current[corner.id] = el; }}
                type="button"
                aria-label={`Resize ${corner.id}`}
                data-resize-handle
                onPointerDown={handlePointerDown(corner.id)}
                className={[
                  "pointer-events-auto absolute z-20 box-border rounded-[2px] border-2 border-[#1E96EB] bg-background",
                  "touch-none -translate-x-1/2 -translate-y-1/2",
                  corner.cursorClass,
                ].join(" ")}
                style={{
                  left: point.x,
                  top: point.y,
                  width: SINGLE_SELECTION_HANDLE_SIZE,
                  height: SINGLE_SELECTION_HANDLE_SIZE,
                }}
              />
            );
          })
        : null}
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
  viewport: CanvasViewportState;
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
      className="pointer-events-auto absolute z-20 flex items-center justify-center rounded-md border border-ol-divider bg-background/90 text-ol-text-auxiliary shadow-[0_6px_12px_rgba(15,23,42,0.12)] transition-colors duration-150 hover:text-ol-text-primary"
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
    const minSize = resolveNodeMinSize(definition, node, undefined);
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

/** Node types that should not show the duplicate button. */
const DUPLICATE_EXCLUDED_TYPES = new Set([
  "chat_input",
  "chat_message",
]);

/** Build shared toolbar items for every node. */
function buildCommonToolbarItems(
  t: TFunction,
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
    ...(!DUPLICATE_EXCLUDED_TYPES.has(element.type)
      ? [
          {
            id: 'duplicate',
            label: t('selection.toolbar.copy'),
            icon: <Copy size={14} />,
            className: BOARD_TOOLBAR_ITEM_BLUE,
            onSelect: () => {
              focusSelection();
              engine.copySelection();
              engine.pasteClipboard();
            },
          },
        ]
      : []),
    ...(options?.showBringToFront
      ? [
          {
            id: 'bring-to-front',
            label: t('selection.toolbar.bringToFront'),
            icon: <ArrowUp size={14} />,
            className: BOARD_TOOLBAR_ITEM_BLUE,
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
            id: 'send-to-back',
            label: t('selection.toolbar.sendToBack'),
            icon: <ArrowDown size={14} />,
            className: BOARD_TOOLBAR_ITEM_BLUE,
            onSelect: () => {
              focusSelection();
              engine.sendNodeToBack(element.id);
            },
          },
        ]
      : []),
    {
      id: 'lock',
      label: isLocked ? t('selection.toolbar.unlock') : t('selection.toolbar.lock'),
      icon: isLocked ? <Unlock size={14} /> : <Lock size={14} />,
      className: BOARD_TOOLBAR_ITEM_AMBER,
      onSelect: () => {
        focusSelection();
        engine.setElementLocked(element.id, !isLocked);
      },
    },
    ...(!isLocked
      ? [
          {
            id: 'delete',
            label: t('selection.toolbar.delete'),
            icon: <Trash2 size={14} />,
            className: BOARD_TOOLBAR_ITEM_RED,
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
function computeSelectionBounds(elements: CanvasElement[], zoom: number): CanvasRect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  elements.forEach(element => {
    const bounds = resolveSelectionBounds(element, zoom);
    const [x, y, w, h] = [bounds.x, bounds.y, bounds.w, bounds.h];
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

/** Resolve bounds for selection calculations. */
function resolveSelectionBounds(element: CanvasElement, zoom: number): CanvasRect {
  const [x, y, w, h] = element.xywh;
  if (element.kind !== "node" || !isGroupNodeType(element.type)) {
    return { x, y, w, h };
  }
  // 逻辑：组节点使用屏幕像素外扩，保证缩放下交互一致。
  const padding = getGroupOutlinePadding(zoom);
  return {
    x: x - padding,
    y: y - padding,
    w: w + padding * 2,
    h: h + padding * 2,
  };
}

/** Build mindmap layout controls for text nodes connected to other text nodes. */
function buildMindmapLayoutItems(
  t: TFunction,
  engine: CanvasEngine,
  element: CanvasNodeElement,
  snapshot: CanvasSnapshot
): CanvasToolbarItem[] {
  // 逻辑：仅 textNode 类型显示方向按钮。
  if (element.type !== "text") return [];
  const meta = element.meta as Record<string, unknown> | undefined;
  if (Boolean(meta?.[MINDMAP_META.ghost])) return [];
  const inbound = snapshot.elements.filter(item => {
    if (item.kind !== "connector") return false;
    if (!("elementId" in item.target)) return false;
    return item.target.elementId === element.id;
  });
  // 逻辑：仅根节点（无入边）显示布局切换按钮。
  if (inbound.length > 0) return [];
  // 逻辑：检查是否有连线指向其他 textNode，没有则不显示。
  const elementMap = new Map(
    snapshot.elements
      .filter((el): el is CanvasNodeElement => el.kind === "node")
      .map(el => [el.id, el])
  );
  const hasTextToTextConnector = snapshot.elements.some(item => {
    if (item.kind !== "connector") return false;
    if (!("elementId" in item.source) || !("elementId" in item.target)) return false;
    if (item.source.elementId !== element.id) return false;
    const targetNode = elementMap.get(item.target.elementId);
    return targetNode?.type === "text";
  });
  if (!hasTextToTextConnector) return [];

  const active = engine.getMindmapLayoutDirectionForRoot(element.id);
  const layoutItems = buildMindmapLayoutItems_data(t);
  return [
    {
      id: 'mindmap-layout',
      label: t('selection.mindmapLayout.label'),
      showLabel: true,
      icon: <MindmapIcon className="h-3.5 w-3.5" />,
      panel: ({ closePanel }) => (
        <div className="flex items-center gap-1">
          {layoutItems.map(option => (
            <PanelItem
              key={option.id}
              title={option.title}
              active={active === option.id}
              size="sm"
              showLabel={false}
              onClick={() => {
                engine.setMindmapLayoutDirectionForRoot(element.id, option.id);
                closePanel();
              }}
            >
              {option.icon}
            </PanelItem>
          ))}
        </div>
      ),
    },
  ];
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
