/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { ArrowDown, ArrowUp, Download, Info, LayoutGrid, Layers, Lock, Trash2, Unlock } from "lucide-react";
import {
  BOARD_TOOLBAR_ITEM_BLUE,
  BOARD_TOOLBAR_ITEM_AMBER,
  BOARD_TOOLBAR_ITEM_DEFAULT,
  BOARD_TOOLBAR_ITEM_GREEN,
  BOARD_TOOLBAR_ITEM_RED,
} from "../ui/board-style-system";
import { batchDownloadNodes, hasMediaNodes } from "../utils/batch-download";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SVGProps } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type {
  CanvasElement,
  CanvasNodeElement,
  CanvasRect,
  CanvasSnapshot,
  CanvasToolbarItem,
} from "../engine/types";
import { cn } from "@udecode/cn";
import { CanvasEngine } from "../engine/CanvasEngine";
import {
  MULTI_SELECTION_OUTLINE_PADDING,
  MIN_ZOOM,
} from "../engine/constants";
import { MINDMAP_META } from "../engine/mindmap-layout";
import { getGroupOutlinePadding, isGroupNodeType } from "../engine/grouping";
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
  /** Currently inspected node id (for active state). */
  inspectorNodeId?: string | null;
  /** Enter group editing dialog. */
  onEnterGroup?: (groupId: string) => void;
};

/** Render a toolbar for a single selected node. */
export function SingleSelectionToolbar({
  engine,
  element,
  snapshot,
  onInspect,
  inspectorNodeId,
  onEnterGroup,
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
    inspectorActive: inspectorNodeId === element.id,
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
    enterGroup: onEnterGroup,
  });

  const commonItems = buildCommonToolbarItems(t, engine, element, snapshot, {
    onInspect,
    inspectorActive: inspectorNodeId === element.id,
  });
  const customItems = items ?? [];
  const allItems = [...customItems, ...commonItems];
  toolbarItemsRef.current = allItems;
  if (
    customItems.length === 0
    && commonItems.length === 0
  ) {
    return null;
  }

  const zoom = snapshot.viewport.zoom;
  const bounds = computeSelectionBounds([element], zoom);

  return (
    <SelectionToolbarContainer
      bounds={bounds}
      offsetClass="-translate-y-full -mt-6"
      worldMode
      zoom={zoom}
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
          showDivider={customItems.length > 0 && commonItems.length > 0}
        />
        <ToolbarGroup
          items={commonItems}
          openPanelId={openPanelId}
          setOpenPanelId={setOpenPanelId}
          compact
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
  /** Enter group editing dialog. */
  onEnterGroup?: (groupId: string) => void;
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
  onEnterGroup,
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
      enterGroup: onEnterGroup,
    })
    : [];
  multiToolbarItemsRef.current = customItems;

  // 逻辑：全部是笔画节点时隐藏自动布局按钮，笔画无法参与网格布局。
  const allStrokes = selectedNodes.every(node => node.type === "stroke");
  const showBatchDownload = hasMediaNodes(selectedNodes);
  const layoutLabel = t('selection.toolbar.autoLayout');
  const layoutIcon = <LayoutGrid size={14} />;
  const bounds = computeSelectionBounds(selectedNodes, snapshot.viewport.zoom);

  const builtinItems: CanvasToolbarItem[] = [];
  if (showBatchDownload) {
    builtinItems.push({
      id: "batch-download",
      label: t('selection.toolbar.batchDownload'),
      icon: <Download size={14} />,
      className: BOARD_TOOLBAR_ITEM_GREEN,
      onSelect: () => batchDownloadNodes(selectedNodes, fileContext),
    });
  }
  builtinItems.push({
    id: "group",
    label: t('selection.toolbar.group'),
    icon: <Layers size={14} />,
    className: BOARD_TOOLBAR_ITEM_BLUE,
    onSelect: () => engine.groupSelection(),
  });
  if (!allStrokes) {
    builtinItems.push({
      id: "layout",
      label: layoutLabel,
      icon: layoutIcon,
      className: BOARD_TOOLBAR_ITEM_BLUE,
      onSelect: () => engine.layoutSelection(),
    });
  }
  // 逻辑：全部锁定时点击解锁，否则全部锁定；与单选工具条语义一致。
  const allLocked = selectedNodes.every(node => node.locked === true);
  const commonItems: CanvasToolbarItem[] = [
    {
      id: "lock-selection",
      label: allLocked ? t('selection.toolbar.unlock') : t('selection.toolbar.lock'),
      showLabel: false,
      icon: allLocked ? <Unlock size={14} /> : <Lock size={14} />,
      active: allLocked,
      className: allLocked
        ? 'bg-foreground/10 text-ol-amber dark:bg-foreground/15 hover:bg-foreground/10 dark:hover:bg-foreground/15'
        : BOARD_TOOLBAR_ITEM_AMBER,
      onSelect: () => {
        engine.doc.transact(() => {
          selectedNodes.forEach(node => engine.setElementLocked(node.id, !allLocked));
        });
        engine.commitHistory();
      },
    },
    {
      id: "delete-selection",
      label: t('selection.toolbar.delete'),
      showLabel: false,
      icon: <Trash2 size={14} />,
      className: BOARD_TOOLBAR_ITEM_RED,
      onSelect: () => engine.deleteSelection(),
    },
  ];

  return (
    <SelectionToolbarContainer
      bounds={bounds}
      offsetClass="-translate-y-full -mt-5"
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
          showDivider={customItems.length > 0 && (builtinItems.length > 0 || commonItems.length > 0)}
        />
        <ToolbarGroup
          items={builtinItems}
          openPanelId={openPanelId}
          setOpenPanelId={setOpenPanelId}
          showDivider={builtinItems.length > 0 && commonItems.length > 0}
        />
        <ToolbarGroup
          items={commonItems}
          openPanelId={openPanelId}
          setOpenPanelId={setOpenPanelId}
          compact
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

  // 逻辑：stroke 节点没有 DOM 表示，通过 PixiOverlayLayer 绘制选中路径高亮。
  // DOM 多选框仅包含有 DOM 元素的节点，避免 useMultiDomBoundsSync 找不到 DOM 导致残留幽灵边框。
  const domElements = selectedElements.filter(e => e.type !== "stroke");

  const padding = MULTI_SELECTION_OUTLINE_PADDING;
  const outlineRef = useRef<HTMLDivElement>(null);
  const domIds = domElements.map(e => e.id);

  // 逻辑：通过 DOM 测量同步多选边框位置，消除 store 与 DOM 之间的帧延迟不一致。
  useMultiDomBoundsSync(
    engine,
    domIds,
    !isMoving && domElements.length > 1,
    outlineRef,
    padding,
  );

  if (domElements.length <= 1) return null;
  // 逻辑：平移或缩放画布时隐藏选区框，避免 React 状态与 DOM transform 帧差导致位置偏移。
  if (isMoving) return null;

  const bounds = computeSelectionBounds(domElements, viewState.viewport.zoom);
  const { zoom, offset } = viewState.viewport;
  const left = bounds.x * zoom + offset[0];
  const top = bounds.y * zoom + offset[1];
  const width = bounds.w * zoom;
  const height = bounds.h * zoom;

  return (
    <div
      ref={outlineRef}
      data-board-selection-outline
      className="pointer-events-none absolute z-10 overflow-visible"
      style={{
        left: left - padding,
        top: top - padding,
        width: width + padding * 2,
        height: height + padding * 2,
      }}
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <rect
          x="0.5" y="0.5"
          width="calc(100% - 1px)" height="calc(100% - 1px)"
          rx="8" ry="8"
          fill="var(--canvas-selection-fill)" fillOpacity="0.06"
          stroke="var(--canvas-selection-border)" strokeWidth="1" strokeOpacity="0.7"
          strokeDasharray="6 4"
        />
      </svg>
    </div>
  );
}

type SingleSelectionOutlineProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Target node element. */
  element: CanvasNodeElement;
  /** Snapshot for positioning. */
  snapshot: CanvasSnapshot;
  /** @deprecated No longer used — resize handles removed. */
  hidden?: boolean;
};

/** Render selection outline for a single node (resize handles removed). */
export function SingleSelectionOutline(_props: SingleSelectionOutlineProps) {
  return null;
}

/** Check whether a node has no meaningful content. */
function isNodeContentEmpty(element: CanvasNodeElement): boolean {
  const props = (element.props ?? {}) as Record<string, unknown>
  switch (element.type) {
    case 'text': {
      const value = props.value
      if (!value || !Array.isArray(value) || value.length === 0) return true
      return (value as Array<Record<string, unknown>>).every(node => {
        const children = node.children as Array<{ text?: string }> | undefined
        if (!children) return true
        return children.every(child => !child.text || child.text.trim().length === 0)
      })
    }
    case 'image':
      return !props.originalSrc && !props.previewSrc
    case 'video':
    case 'audio':
      return !props.sourcePath
    default:
      return false
  }
}

/** Build shared toolbar items for every node, keeping destructive actions in the shared right-side group. */
function buildCommonToolbarItems(
  t: TFunction,
  engine: CanvasEngine,
  element: CanvasNodeElement,
  snapshot: CanvasSnapshot,
  options?: { onInspect?: (id: string) => void; inspectorActive?: boolean },
): CanvasToolbarItem[] {
  const isLocked = element.locked === true
  // 只有当前节点与其他节点存在重叠时，才显示上移/下移按钮
  const [ex, ey, ew, eh] = element.xywh
  const hasOverlap = snapshot.elements.some(el => {
    if (el.id === element.id || el.kind !== 'node') return false
    const [ox, oy, ow, oh] = el.xywh
    return ex < ox + ow && ex + ew > ox && ey < oy + oh && ey + eh > oy
  })
  const items: CanvasToolbarItem[] = [
    ...(hasOverlap ? [
      {
        id: 'bring-forward',
        label: t('selection.toolbar.bringToFront'),
        showLabel: false,
        icon: <ArrowUp size={14} />,
        className: BOARD_TOOLBAR_ITEM_BLUE,
        onSelect: () => {
          engine.bringNodeToFront(element.id)
        },
      },
      {
        id: 'send-backward',
        label: t('selection.toolbar.sendToBack'),
        showLabel: false,
        icon: <ArrowDown size={14} />,
        className: BOARD_TOOLBAR_ITEM_BLUE,
        onSelect: () => {
          engine.sendNodeToBack(element.id)
        },
      },
    ] : []),
    ...(options?.onInspect && element.type !== 'file-attachment' && !isNodeContentEmpty(element) ? [{
      id: 'inspect',
      label: t('selection.toolbar.detail', { defaultValue: '详情' }),
      showLabel: false,
      icon: <Info size={14} />,
      active: options.inspectorActive,
      className: options.inspectorActive
        ? 'bg-foreground/10 text-ol-blue dark:bg-foreground/15 hover:bg-foreground/10 dark:hover:bg-foreground/15'
        : BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => options.onInspect!(element.id),
    }] : []),
    {
      id: 'lock-node',
      label: isLocked ? t('selection.toolbar.unlock') : t('selection.toolbar.lock'),
      showLabel: false,
      icon: isLocked ? <Unlock size={14} /> : <Lock size={14} />,
      active: isLocked,
      className: isLocked
        ? 'bg-foreground/10 text-ol-amber dark:bg-foreground/15 hover:bg-foreground/10 dark:hover:bg-foreground/15'
        : BOARD_TOOLBAR_ITEM_AMBER,
      onSelect: () => {
        engine.setElementLocked(element.id, !isLocked)
        engine.commitHistory()
      },
    },
    {
      id: 'delete-node',
      label: t('selection.toolbar.delete'),
      showLabel: false,
      icon: <Trash2 size={14} />,
      className: BOARD_TOOLBAR_ITEM_RED,
      onSelect: () => {
        engine.deleteSelection()
      },
    },
  ]
  return items
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
  if (element.kind === "node" && isGroupNodeType(element.type)) {
    // 逻辑：组节点使用屏幕像素外扩，保证缩放下交互一致。
    const padding = getGroupOutlinePadding(zoom);
    return {
      x: x - padding,
      y: y - padding,
      w: w + padding * 2,
      h: h + padding * 2,
    };
  }
  if (element.kind === "node" && element.type === "stroke") {
    // 逻辑：笔画线宽会超出 xywh 包围盒，需要外扩半个线宽，与 PixiOverlayLayer 单选边框一致。
    const props = element.props as { size?: number; tool?: string };
    const strokeSize = props.size ?? 2;
    const lineWidth = props.tool === "highlighter" ? strokeSize * 3 : strokeSize;
    const pad = lineWidth / 2 + 4;
    return {
      x: x - pad,
      y: y - pad,
      w: w + pad * 2,
      h: h + pad * 2,
    };
  }
  return { x, y, w, h };
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

// ── Connector drop-target highlight ──

type ConnectorDropTargetHighlightProps = {
  engine: CanvasEngine;
  snapshot: CanvasSnapshot;
};

/**
 * 连线拖拽时，在目标节点周围渲染轻微放大 + 高亮边框动画。
 * 通过 DOM 测量节点位置，与 SingleSelectionOutline 保持相同的同步策略。
 */
export function ConnectorDropTargetHighlight({ engine, snapshot }: ConnectorDropTargetHighlightProps) {
  const draft = snapshot.connectorDraft;
  const targetId = draft && "elementId" in draft.target ? draft.target.elementId : null;
  const validation = snapshot.connectorValidation;
  const isValid = !validation || validation.valid;

  const outlineRef = useRef<HTMLDivElement>(null);
  const prevTargetId = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = outlineRef.current;
    if (!el) return;

    if (!targetId) {
      // 逻辑：目标消失 → 淡出缩回。
      if (prevTargetId.current) {
        el.style.transition = 'transform 200ms ease, opacity 200ms ease';
        el.style.opacity = '0';
        el.style.transform = 'scale(1)';
      }
      prevTargetId.current = null;
      return;
    }

    const container = engine.getContainer();
    const nodeEl = engine.getNodeDomElement(targetId);
    if (!container || !nodeEl) return;

    const sync = () => {
      if (!outlineRef.current) return;
      const containerRect = container.getBoundingClientRect();
      const nodeRect = nodeEl.getBoundingClientRect();
      const pad = 4;
      outlineRef.current.style.left = `${nodeRect.left - containerRect.left - pad}px`;
      outlineRef.current.style.top = `${nodeRect.top - containerRect.top - pad}px`;
      outlineRef.current.style.width = `${nodeRect.width + pad * 2}px`;
      outlineRef.current.style.height = `${nodeRect.height + pad * 2}px`;
    };

    sync();

    // 逻辑：新目标出现 → 淡入 + 轻微放大。
    if (prevTargetId.current !== targetId) {
      el.style.transition = 'none';
      el.style.opacity = '0';
      el.style.transform = 'scale(0.98)';
      el.getBoundingClientRect(); // force reflow
      el.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
      el.style.opacity = '1';
      el.style.transform = 'scale(1)';
    }

    prevTargetId.current = targetId;

    const observer = new ResizeObserver(sync);
    observer.observe(nodeEl);
    return () => observer.disconnect();
  }, [engine, targetId]);

  if (!draft) return null;

  return (
    <div
      ref={outlineRef}
      className={cn(
        "pointer-events-none absolute z-10 rounded-2xl",
        isValid
          ? "ring-2 ring-[var(--canvas-selection-border)] shadow-[0_0_12px_rgba(59,130,246,0.25)]"
          : "ring-2 ring-red-400 shadow-[0_0_12px_rgba(248,113,113,0.25)]",
      )}
      style={{ opacity: 0 }}
    />
  );
}
