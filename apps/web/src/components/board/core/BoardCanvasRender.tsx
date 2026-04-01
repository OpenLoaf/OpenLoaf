/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@udecode/cn";
import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasElement, CanvasSnapshot } from "../engine/types";
import { MINIMAP_HIDE_DELAY } from "../engine/constants";
import BoardToolbar from "../toolbar/BoardToolbar";
import LeftToolbar from "../toolbar/LeftToolbar";
import FloatingInsertMenu from "../toolbar/FloatingInsertMenu";
import BottomBar from "../toolbar/BottomBar";
import { NodeInspectorPanel } from "../ui/CanvasPanels";
import { ConnectorHoverScissors } from "./ConnectorHoverScissors";
import { NodeSearchPanel } from "../ui/NodeSearchPanel";
import dynamic from "next/dynamic";

const PixiCanvas = dynamic(
  () => import("../render/pixi").then((m) => m.PixiCanvas),
  { ssr: false },
);
import { DomNodeLayer } from "../render/pixi/DomNodeLayer";
import { AnchorOverlay } from "./AnchorOverlay";
import BoardEmptyGuide from "./BoardEmptyGuide";
import { BoardPerfOverlay } from "./BoardPerfOverlay";
import { MiniMap } from "./MiniMap";
import {
  ConnectorDropTargetHighlight,
  MultiSelectionOutline,
  MultiSelectionToolbar,
  SingleSelectionOutline,
  SingleSelectionToolbar,
} from "./SelectionOverlay";
import { PendingInsertPreview, PENDING_INSERT_DOM_TYPES } from "./PendingInsertPreview";
import { useBoardViewState } from "./useBoardViewState";
import { useBoardSnapshot } from "./useBoardSnapshot";

export type BoardCanvasRenderProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Whether the UI is visible. */
  showUi: boolean;
  /** Whether the performance overlay is visible. */
  showPerfOverlay: boolean;
  /** Container ref for export events. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Manual log sync callback. */
  onSyncLog?: () => void;
  /** Auto layout callback. */
  onAutoLayout?: () => void;
  /** Enter group editing dialog. */
  onEnterGroup?: (groupId: string) => void;
  /** Minimal mode hides toolbars, minimap, and empty guide (used in sub-canvas dialogs). */
  minimal?: boolean;
};

/** Render board layers and overlays. */
export function BoardCanvasRender({
  engine,
  showUi,
  showPerfOverlay,
  containerRef,
  onSyncLog,
  onAutoLayout,
  onEnterGroup,
  minimal,
}: BoardCanvasRenderProps) {
  const snapshot = useBoardSnapshot(engine);
  /** Culling stats for the performance overlay. */
  const [cullingStats, setCullingStats] = useState({
    totalNodes: 0,
    visibleNodes: 0,
    culledNodes: 0,
  });
  /** GPU stats for the performance overlay. */
  const [gpuStats, setGpuStats] = useState({
    imageTextures: 0,
  });
  /** Node inspector target id. */
  const [inspectorNodeId, setInspectorNodeId] = useState<string | null>(null);
  /** Whether the node search panel is visible. */
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  /** Delayed toolbar entrance animation flag. */
  const [toolbarsReady, setToolbarsReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setToolbarsReady(true), 500);
    return () => window.clearTimeout(timer);
  }, []);

  // 逻辑：拖拽结束后 UI（边框、工具栏、面板）延迟 500ms 再浮现，避免松手瞬间闪烁。
  // 使用 useLayoutEffect 在浏览器绘制前同步设置 recentlyDropped，
  // 避免 useEffect 的一帧延迟导致 AnchorOverlay 短暂挂载后又卸载的闪烁。
  const DROP_SETTLE_DELAY = 500;
  const [recentlyDropped, setRecentlyDropped] = useState(false);
  const prevDraggingRef = useRef(snapshot.draggingId);
  useLayoutEffect(() => {
    const wasDragging = prevDraggingRef.current != null;
    const isDragging = snapshot.draggingId != null;
    prevDraggingRef.current = snapshot.draggingId;
    if (wasDragging && !isDragging) {
      setRecentlyDropped(true);
      const timer = window.setTimeout(() => setRecentlyDropped(false), DROP_SETTLE_DELAY);
      return () => window.clearTimeout(timer);
    }
  }, [snapshot.draggingId]);
  const isDragging = !!snapshot.draggingId || recentlyDropped;

  // 逻辑：Cmd+F / Ctrl+F 打开节点搜索面板，Escape 关闭。
  const closeSearchPanel = useCallback(() => setShowSearchPanel(false), []);
  const showSearchPanelRef = useRef(showSearchPanel);
  showSearchPanelRef.current = showSearchPanel;
  useEffect(() => {
    if (minimal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "f") {
        event.preventDefault();
        event.stopPropagation();
        setShowSearchPanel((prev) => !prev);
        return;
      }
      // 逻辑：capture 阶段拦截 Escape，确保搜索面板优先关闭（不被 CanvasEngine 吞掉）。
      if (event.key === "Escape" && showSearchPanelRef.current) {
        event.preventDefault();
        event.stopPropagation();
        setShowSearchPanel(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [minimal]);

  useEffect(() => {
    // 逻辑：主题切换时强制刷新画布渲染，确保连线颜色同步更新。
    const root = document.documentElement;
    const refresh = () => engine.refreshView();
    const observer = new MutationObserver(() => refresh());
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (media) {
      const handler = () => refresh();
      media.addEventListener?.("change", handler);
      return () => {
        observer.disconnect();
        media.removeEventListener?.("change", handler);
      };
    }
    return () => {
      observer.disconnect();
    };
  }, [engine]);

  // 逻辑：选中有 inlinePanel 配置的节点时自动展开，切换选区时自动收起上一个。
  // 延迟展开防止「选中后立刻拖动」时面板闪烁：如果在延迟内开始拖动，portal 不会渲染。
  // 框选进行中（selectionBox 非 null）时不展开内联面板，避免拖拽过程中面板闪烁。
  useEffect(() => {
    const selectedIds = snapshot.selectedIds;
    if (selectedIds.length !== 1 || snapshot.selectionBox) {
      engine.setExpandedNodeId(null);
      return;
    }
    const selectedId = selectedIds[0];
    const element = engine.doc.getElementById(selectedId);
    if (!element || element.kind !== "node") {
      engine.setExpandedNodeId(null);
      return;
    }
    const definition = engine.nodes.getDefinition(element.type);
    if (definition?.inlinePanel && definition.inlinePanel.autoExpand !== false) {
      const timer = window.setTimeout(() => {
        engine.setExpandedNodeId(selectedId);
      }, FADE_ENTER_DELAY);
      return () => window.clearTimeout(timer);
    }
    engine.setExpandedNodeId(null);
  }, [engine, snapshot.selectedIds, snapshot.selectionBox]);

  const selectedNode = getSingleSelectedElement(snapshot, "node");
  const inspectorElement = inspectorNodeId
    ? snapshot.elements.find(
        (element): element is Extract<CanvasElement, { kind: "node" }> =>
          element.kind === "node" && element.id === inspectorNodeId
      ) ?? null
    : null;

  useEffect(() => {
    if (!inspectorNodeId) return;
    // 逻辑：节点被删除或取消选择时收起详情面板。
    if (!snapshot.selectedIds.includes(inspectorNodeId) || !inspectorElement) {
      setInspectorNodeId(null);
    }
  }, [inspectorElement, inspectorNodeId, snapshot.selectedIds]);

  return (
    <>
      {showUi && !minimal && snapshot.elements.length > 0 ? <MiniMapLayer engine={engine} snapshot={snapshot} /> : null}
      {/* 逻辑：minimal 模式（子画布对话框）不加载 PixiJS，避免销毁时破坏全局 PixiJS 共享状态。 */}
      {minimal ? <DomNodeLayer engine={engine} snapshot={snapshot} /> : <PixiCanvas engine={engine} snapshot={snapshot} />}
      {/* 剪刀放在 PixiCanvas 之后（DOM 顺序更高），确保剪刀在连接线之上 */}
      {showUi && !isDragging && !snapshot.connectorDraft ? (
        <ConnectorHoverScissorsLayer engine={engine}>
          <ConnectorHoverScissors snapshot={snapshot} engine={engine} />
        </ConnectorHoverScissorsLayer>
      ) : null}
      {showUi && !minimal && snapshot.pendingInsert && snapshot.pendingInsertPoint && PENDING_INSERT_DOM_TYPES.has(snapshot.pendingInsert.type) ? (
        <PendingInsertPreview
          engine={engine}
          pendingInsert={snapshot.pendingInsert}
          pendingInsertPoint={snapshot.pendingInsertPoint}
        />
      ) : null}
      {showPerfOverlay ? (
        <BoardPerfOverlay
          stats={cullingStats}
          gpuStats={gpuStats}
        />
      ) : null}
      {/* AnchorOverlay 已移入下方 WorldToolbarLayer 内渲染 */}
      {showUi && !minimal ? (
        <div className={cn("pointer-events-none absolute inset-0 z-[10001] transition-all duration-500 ease-out", toolbarsReady ? "opacity-100 -translate-x-0" : "opacity-0 -translate-x-4")}>
          <LeftToolbar engine={engine} snapshot={snapshot} />
        </div>
      ) : null}
      {showUi && !minimal ? (
        <FloatingInsertMenu engine={engine} snapshot={snapshot} containerRef={containerRef} />
      ) : null}
      {showUi && !minimal ? (
        <div className={cn("pointer-events-none absolute inset-0 z-[10001] transition-all duration-500 ease-out", toolbarsReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4")}>
          <BottomBar engine={engine} snapshot={snapshot} />
        </div>
      ) : null}
      {/*
        * Legacy BoardToolbar – kept mounted (but invisible) because it hosts the
        * ProjectFilePickerDialog that opens in response to the custom
        * "openloaf:board-open-file-picker" DOM event dispatched by LeftToolbar's
        * insert buttons (image / video / audio / file).
        *
        * The container uses pointer-events-none + opacity-0 so it never
        * intercepts clicks or appears visually.  The dialog itself (a portal)
        * still receives pointer events normally.
        *
        * TODO: Extract ProjectFilePickerDialog into a standalone component so
        * BoardToolbar can be fully removed.
        */}
      {showUi && !minimal ? (
        <div className="pointer-events-none absolute inset-0 z-10 opacity-0" aria-hidden="true">
          <BoardToolbar engine={engine} snapshot={snapshot} containerRef={containerRef} />
        </div>
      ) : null}
      {showUi && !minimal ? (
        <BoardEmptyGuide engine={engine} visible={snapshot.docRevision > 0 && snapshot.elements.length === 0 && !snapshot.pendingInsert && toolbarsReady} activeToolId={snapshot.activeToolId} />
      ) : null}
      {/* ConnectorActionPanel removed — scissors-on-hover replaces it */}
      {showUi ? <MultiSelectionOutline snapshot={snapshot} engine={engine} /> : null}
      {showUi && selectedNode && selectedNode.type !== "stroke" ? (
        <SingleSelectionOutline snapshot={snapshot} engine={engine} element={selectedNode} hidden={isDragging} />
      ) : null}
      {showUi && snapshot.connectorDraft ? <ConnectorDropTargetHighlight engine={engine} snapshot={snapshot} /> : null}
      <WorldToolbarLayer engine={engine}>
        {showUi && !isDragging && !snapshot.selectionBox ? <AnchorOverlay snapshot={snapshot} engine={engine} /> : null}
        {showUi && !isDragging && !snapshot.selectionBox && selectedNode && selectedNode.type !== "stroke" ? (
          <SingleSelectionToolbar
            snapshot={snapshot}
            engine={engine}
            element={selectedNode}
            onInspect={(elementId) => setInspectorNodeId(prev => prev === elementId ? null : elementId)}
            inspectorNodeId={inspectorNodeId}
            onEnterGroup={onEnterGroup}
          />
        ) : null}
      </WorldToolbarLayer>
      <BoardDragFade visible={showUi && !isDragging && !snapshot.selectionBox}>
        <MultiSelectionToolbar
          snapshot={snapshot}
          engine={engine}
          onInspect={(elementId) => setInspectorNodeId(prev => prev === elementId ? null : elementId)}
          onEnterGroup={onEnterGroup}
        />
      </BoardDragFade>
      <BoardDragFade visible={showUi && !!inspectorElement && !isDragging && !snapshot.selectionBox}>
        {inspectorElement ? (
          <NodeInspectorPanel element={inspectorElement} onClose={() => setInspectorNodeId(null)} />
        ) : null}
      </BoardDragFade>
      {showUi && !minimal && showSearchPanel ? (
        <NodeSearchPanel
          engine={engine}
          elements={snapshot.elements}
          onClose={closeSearchPanel}
        />
      ) : null}
    </>
  );
}

/**
 * 世界坐标工具栏层。
 * 与 DomNodeLayer 共享相同的 RAF transform 更新，确保工具栏与节点零帧差同步。
 */
function WorldToolbarLayer({ engine, children }: { engine: CanvasEngine; children: React.ReactNode }) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const handler = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const layer = layerRef.current;
        if (!layer) return;
        const { zoom, offset } = engine.getViewState().viewport;
        layer.style.transform = `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`;
      });
    };
    handler();
    const unsub = engine.subscribeView(handler);
    return () => {
      unsub();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [engine]);

  const { zoom, offset } = engine.getViewState().viewport;

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0 z-20 origin-top-left"
      style={{ transform: `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})` }}
    >
      {children}
    </div>
  );
}

/**
 * Scissors layer: same viewport transform as WorldToolbarLayer but at a lower
 * z-index so scissors hide behind nodes instead of floating above them.
 */
function ConnectorHoverScissorsLayer({ engine, children }: { engine: CanvasEngine; children: React.ReactNode }) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const handler = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const layer = layerRef.current;
        if (!layer) return;
        const { zoom, offset } = engine.getViewState().viewport;
        layer.style.transform = `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`;
      });
    };
    handler();
    const unsub = engine.subscribeView(handler);
    return () => {
      unsub();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [engine]);

  const { zoom, offset } = engine.getViewState().viewport;

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0 origin-top-left"
      style={{ transform: `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})` }}
    >
      {children}
    </div>
  );
}

/** Fade-in wrapper: delayed entrance prevents flash; exit is instant (no ghost). */
const FADE_ENTER_DELAY = 80;
const FADE_IN_DURATION = 150;
const BoardDragFade = memo(function BoardDragFade({ visible, children }: {
  visible: boolean;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      const enterTimer = window.setTimeout(() => {
        setMounted(true);
        requestAnimationFrame(() => setShow(true));
      }, FADE_ENTER_DELAY);
      return () => window.clearTimeout(enterTimer);
    }
    // 退场：立刻卸载，不留残影
    setMounted(false);
    setShow(false);
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      style={{
        opacity: show ? 1 : 0,
        transition: `opacity ${FADE_IN_DURATION}ms ease`,
      }}
    >
      {children}
    </div>
  );
}, (prev, next) => prev.visible === next.visible);

type MiniMapLayerProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot for minimap contents. */
  snapshot: CanvasSnapshot;
};

/** Render the minimap hover zone and overlay. */
function MiniMapLayer({ engine, snapshot }: MiniMapLayerProps) {
  /** Latest view state for minimap visibility rules. */
  const viewState = useBoardViewState(engine);
  /** Whether the minimap should stay visible. */
  const [showMiniMap, setShowMiniMap] = useState(false);
  /** Whether the minimap hover zone is active. */
  const [hoverMiniMap, setHoverMiniMap] = useState(false);
  /** Timeout id for hiding the minimap. */
  const miniMapTimeoutRef = useRef<number | null>(null);
  /** Last viewport snapshot for change detection. */
  const lastViewportRef = useRef(viewState.viewport);
  /** Last panning state for change detection. */
  const lastPanningRef = useRef(viewState.panning);

  useEffect(() => {
    const lastViewport = lastViewportRef.current;
    const viewportChanged =
      lastViewport.zoom !== viewState.viewport.zoom ||
      lastViewport.offset[0] !== viewState.viewport.offset[0] ||
      lastViewport.offset[1] !== viewState.viewport.offset[1] ||
      lastViewport.size[0] !== viewState.viewport.size[0] ||
      lastViewport.size[1] !== viewState.viewport.size[1];
    const wasPanning = lastPanningRef.current;

    lastViewportRef.current = viewState.viewport;
    lastPanningRef.current = viewState.panning;

    // 逻辑：视口变化或拖拽时保持小地图可见。
    if (viewState.panning || viewportChanged) {
      setShowMiniMap(true);
    }

    if (viewState.panning) {
      if (miniMapTimeoutRef.current) {
        window.clearTimeout(miniMapTimeoutRef.current);
        miniMapTimeoutRef.current = null;
      }
      return;
    }

    if (viewportChanged || wasPanning) {
      if (miniMapTimeoutRef.current) {
        window.clearTimeout(miniMapTimeoutRef.current);
      }
      // 逻辑：视图停止后延迟隐藏小地图，避免闪烁。
      miniMapTimeoutRef.current = window.setTimeout(() => {
        setShowMiniMap(false);
      }, MINIMAP_HIDE_DELAY);
    }
  }, [viewState]);

  useEffect(() => {
    return () => {
      if (miniMapTimeoutRef.current) {
        window.clearTimeout(miniMapTimeoutRef.current);
      }
    };
  }, []);

  const shouldShowMiniMap = showMiniMap || hoverMiniMap;

  return (
    <>
      <div
        className="absolute left-0 top-0 z-20 h-24 w-24"
        onPointerEnter={() => {
          if (miniMapTimeoutRef.current) {
            window.clearTimeout(miniMapTimeoutRef.current);
            miniMapTimeoutRef.current = null;
          }
          setHoverMiniMap(true);
          setShowMiniMap(true);
        }}
        onPointerLeave={() => {
          setHoverMiniMap(false);
          if (!viewState.panning) {
            setShowMiniMap(false);
          }
        }}
      />
      <MiniMap snapshot={snapshot} viewport={viewState.viewport} visible={shouldShowMiniMap} />
    </>
  );
}

/** Resolve a single selected element by kind. */
function getSingleSelectedElement<TKind extends CanvasElement["kind"]>(
  snapshot: CanvasSnapshot,
  kind: TKind
): Extract<CanvasElement, { kind: TKind }> | null {
  const selectedIds = snapshot.selectedIds;
  if (selectedIds.length !== 1) return null;
  const selectedId = selectedIds[0];
  const element = snapshot.elements.find((item) => item.id === selectedId);
  if (!element || element.kind !== kind) return null;
  return element as Extract<CanvasElement, { kind: TKind }>;
}

export const _snapshotSubscribedInternally = true
