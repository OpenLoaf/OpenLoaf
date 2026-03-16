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

import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@udecode/cn";
import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasElement, CanvasSnapshot } from "../engine/types";
import { MINIMAP_HIDE_DELAY } from "../engine/constants";
import BoardControls from "../controls/BoardControls";
import AIGenerateToolbar from "../toolbar/AIGenerateToolbar";
import BoardToolbar from "../toolbar/BoardToolbar";
import { ConnectorActionPanel, NodeInspectorPanel } from "../ui/CanvasPanels";
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
  MultiSelectionOutline,
  MultiSelectionToolbar,
  SingleSelectionOutline,
  SingleSelectionToolbar,
} from "./SelectionOverlay";
import { PendingInsertPreview, PENDING_INSERT_DOM_TYPES } from "./PendingInsertPreview";
import { useBoardViewState } from "./useBoardViewState";

export type BoardCanvasRenderProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot for current scene. */
  snapshot: CanvasSnapshot;
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
  snapshot,
  showUi,
  showPerfOverlay,
  containerRef,
  onSyncLog,
  onAutoLayout,
  onEnterGroup,
  minimal,
}: BoardCanvasRenderProps) {
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
  /** Delayed toolbar entrance animation flag. */
  const [toolbarsReady, setToolbarsReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setToolbarsReady(true), 500);
    return () => window.clearTimeout(timer);
  }, []);

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

  const selectedConnector = getSingleSelectedElement(snapshot, "connector");
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
      {showUi && !snapshot.draggingId ? <AnchorOverlay snapshot={snapshot} /> : null}
      {showUi && !minimal ? (
        <div className={cn("pointer-events-none absolute inset-0 z-20 transition-all duration-500 ease-out", toolbarsReady ? "opacity-100 -translate-x-0" : "opacity-0 -translate-x-4")}>
          <BoardControls engine={engine} snapshot={snapshot} onAutoLayout={onAutoLayout} />
        </div>
      ) : null}
      {showUi && !minimal ? (
        <div className={cn("pointer-events-none absolute inset-0 z-20 transition-all duration-500 ease-out", toolbarsReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4")}>
          <BoardToolbar engine={engine} snapshot={snapshot} />
        </div>
      ) : null}
      {showUi && !minimal ? (
        <div className={cn("pointer-events-none absolute inset-0 z-20 transition-all duration-500 ease-out", toolbarsReady ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4")}>
          <AIGenerateToolbar engine={engine} snapshot={snapshot} />
        </div>
      ) : null}
      {showUi && !minimal ? (
        <BoardEmptyGuide engine={engine} visible={snapshot.docRevision > 0 && snapshot.elements.length === 0 && !snapshot.pendingInsert && toolbarsReady} activeToolId={snapshot.activeToolId} />
      ) : null}
      {showUi && selectedConnector ? (
        <ConnectorActionPanel
          snapshot={snapshot}
          connector={selectedConnector}
          onStyleChange={(style) => engine.setConnectorStyle(style)}
          onDelete={() => engine.deleteSelection()}
        />
      ) : null}
      {showUi && !snapshot.draggingId ? <MultiSelectionOutline snapshot={snapshot} engine={engine} /> : null}
      {showUi && !snapshot.draggingId && selectedNode && selectedNode.type !== "image_generate" && selectedNode.type !== "image_prompt_generate" && selectedNode.type !== "video_generate" && selectedNode.type !== "chat_input" && selectedNode.type !== "chat_message" && selectedNode.type !== "stroke" ? (
        <SingleSelectionOutline snapshot={snapshot} engine={engine} element={selectedNode} />
      ) : null}
      {showUi && !snapshot.draggingId && selectedNode && selectedNode.type !== "stroke" ? (
        <SingleSelectionToolbar
          snapshot={snapshot}
          engine={engine}
          element={selectedNode}
          onInspect={(elementId) => setInspectorNodeId(elementId)}
          onEnterGroup={onEnterGroup}
        />
      ) : null}
      {showUi && !snapshot.draggingId ? (
        <MultiSelectionToolbar
          snapshot={snapshot}
          engine={engine}
          onInspect={(elementId) => setInspectorNodeId(elementId)}
          onEnterGroup={onEnterGroup}
        />
      ) : null}
      {showUi && inspectorElement ? (
        <NodeInspectorPanel element={inspectorElement} onClose={() => setInspectorNodeId(null)} />
      ) : null}
    </>
  );
}

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
