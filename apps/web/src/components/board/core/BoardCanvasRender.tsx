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
import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasElement, CanvasSnapshot } from "../engine/types";
import { MINIMAP_HIDE_DELAY } from "../engine/constants";
import BoardControls from "../controls/BoardControls";
import BoardToolbar from "../toolbar/BoardToolbar";
import { ConnectorActionPanel, NodeInspectorPanel } from "../ui/CanvasPanels";
import { CanvasSurface } from "../render/CanvasSurface";
import { SvgConnectorLayer } from "../render/SvgConnectorLayer";
import { CanvasDomLayer } from "./CanvasDomLayer";
import { BoardPerfOverlay } from "./BoardPerfOverlay";
import { AnchorOverlay } from "./AnchorOverlay";
import { MiniMap } from "./MiniMap";
import {
  MultiSelectionOutline,
  MultiSelectionToolbar,
  SingleSelectionOutline,
  SingleSelectionToolbar,
} from "./SelectionOverlay";
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
      {showUi ? <MiniMapLayer engine={engine} snapshot={snapshot} /> : null}
      <CanvasSurface
        snapshot={snapshot}
        onStats={showPerfOverlay ? setGpuStats : undefined}
      />
      <SvgConnectorLayer snapshot={snapshot} />
      {showUi ? (
        <CanvasDomLayer
          engine={engine}
          snapshot={snapshot}
          onCullingStatsChange={showPerfOverlay ? setCullingStats : undefined}
        />
      ) : null}
      {showPerfOverlay ? (
        <BoardPerfOverlay
          stats={cullingStats}
          gpuStats={gpuStats}
          onSyncLog={onSyncLog}
        />
      ) : null}
      {showUi ? <AnchorOverlay snapshot={snapshot} /> : null}
      {showUi ? (
        <BoardControls engine={engine} snapshot={snapshot} onAutoLayout={onAutoLayout} />
      ) : null}
      {showUi ? <BoardToolbar engine={engine} snapshot={snapshot} /> : null}
      {showUi && selectedConnector ? (
        <ConnectorActionPanel
          snapshot={snapshot}
          connector={selectedConnector}
          onStyleChange={(style) => engine.setConnectorStyle(style)}
          onColorChange={(color) => engine.setConnectorColor(color)}
          onDashedChange={(dashed) => engine.setConnectorDashed(dashed)}
          onDelete={() => engine.deleteSelection()}
        />
      ) : null}
      {showUi ? <MultiSelectionOutline snapshot={snapshot} engine={engine} /> : null}
      {showUi && selectedNode && selectedNode.type !== "image_generate" ? (
        <SingleSelectionOutline snapshot={snapshot} engine={engine} element={selectedNode} />
      ) : null}
      {showUi && selectedNode ? (
        <SingleSelectionToolbar
          snapshot={snapshot}
          engine={engine}
          element={selectedNode}
          onInspect={(elementId) => setInspectorNodeId(elementId)}
        />
      ) : null}
      {showUi ? (
        <MultiSelectionToolbar
          snapshot={snapshot}
          engine={engine}
          onInspect={(elementId) => setInspectorNodeId(elementId)}
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
