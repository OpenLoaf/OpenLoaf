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

import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { cn } from "@udecode/cn";
import {
  ArrowRight,
  ChartSpline,
  CornerRightDown,
  Trash2,
} from "lucide-react";

import type {
  CanvasConnectorElement,
  CanvasConnectorStyle,
  CanvasNodeElement,
  CanvasPoint,
  CanvasSnapshot,
  CanvasRect,
  CanvasToolbarItem,
} from "../engine/types";
import { toScreenPoint } from "../utils/coordinates";
import {
  buildConnectorPath,
  buildSourceAxisPreferenceMap,
  flattenConnectorPath,
  resolveConnectorEndpointsSmart,
} from "../utils/connector-path";
import { useBoardEngine } from "../core/BoardProvider";
import { useBoardViewState } from "../core/useBoardViewState";
import { applyGroupAnchorPadding } from "../engine/anchors";
import { getGroupOutlinePadding, isGroupNodeType } from "../engine/grouping";
import { toolbarSurfaceClassName, PanelItem } from "./ToolbarParts";
import {
  BOARD_TOOLBAR_ITEM_DEFAULT,
  BOARD_TOOLBAR_ITEM_RED,
} from "./board-style-system";
import { ToolbarGroup } from "./SelectionToolbar";

type ConnectorActionPanelProps = {
  /** Snapshot used for positioning. */
  snapshot: CanvasSnapshot;
  /** Selected connector element. */
  connector: CanvasConnectorElement;
  /** Apply a new connector style. */
  onStyleChange: (style: CanvasConnectorStyle) => void;
  /** Delete the selected connector. */
  onDelete: () => void;
};

/** Build toolbar items for a selected connector. */
function buildConnectorToolbarItems(
  t: (key: string) => string,
  currentStyle: CanvasConnectorStyle,
  onStyleChange: (style: CanvasConnectorStyle) => void,
  onDelete: () => void,
): CanvasToolbarItem[] {
  return [
    {
      id: 'style-straight',
      label: t('connector.straight'),
      icon: <ArrowRight size={14} />,
      active: currentStyle === 'straight',
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => onStyleChange('straight'),
    },
    {
      id: 'style-elbow',
      label: t('connector.elbow'),
      icon: <CornerRightDown size={14} />,
      active: currentStyle === 'elbow',
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => onStyleChange('elbow'),
    },
    {
      id: 'style-curve',
      label: t('connector.curve'),
      icon: <ChartSpline size={14} />,
      active: currentStyle === 'curve',
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => onStyleChange('curve'),
    },
    {
      id: 'delete',
      label: t('connector.deleteConnector'),
      icon: <Trash2 size={14} />,
      className: BOARD_TOOLBAR_ITEM_RED,
      onSelect: onDelete,
    },
  ];
}

/** Render a style panel when a connector is selected. */
function ConnectorActionPanel({
  snapshot,
  connector,
  onStyleChange,
  onDelete,
}: ConnectorActionPanelProps) {
  const { t } = useTranslation('board');
  const engine = useBoardEngine();
  const viewState = useBoardViewState(engine);
  // 逻辑：优先使用鼠标点击位置定位工具栏，回退到路径中点。
  const clickPoint = snapshot.selectionClickPoint;
  const center = clickPoint ?? resolveConnectorCenter(connector, snapshot, viewState.viewport);
  const screen = toScreenPoint(center, viewState);
  const offsetScreenY = 34;
  const currentStyle = connector.style ?? snapshot.connectorStyle;
  const [openPanelId, setOpenPanelId] = useState<string | null>(null);

  const items = buildConnectorToolbarItems(t, currentStyle, onStyleChange, onDelete);

  return (
    <div
      data-node-toolbar
      className={cn(
        "pointer-events-auto absolute z-30 -translate-x-1/2 rounded-full",
        "px-2 py-1.5",
        toolbarSurfaceClassName,
      )}
      style={{ left: screen[0], top: screen[1] - offsetScreenY }}
      onPointerDown={event => {
        event.stopPropagation();
      }}
      onMouseDown={event => event.preventDefault()}
    >
      <div className="flex items-center gap-1">
        <ToolbarGroup
          items={items}
          openPanelId={openPanelId}
          setOpenPanelId={setOpenPanelId}
        />
      </div>
    </div>
  );
}

/** Compute the center point of a connector path. */
function resolveConnectorCenter(
  connector: CanvasConnectorElement,
  snapshot: CanvasSnapshot,
  viewport: CanvasSnapshot["viewport"]
): CanvasPoint {
  const [x, y, w, h] = connector.xywh;
  const fallback: CanvasPoint = [x + w / 2, y + h / 2];
  const groupPadding = getGroupOutlinePadding(viewport.zoom);
  const anchors = applyGroupAnchorPadding(snapshot.anchors, snapshot.elements, groupPadding);
  const boundsMap: Record<string, CanvasRect | undefined> = {};

  snapshot.elements.forEach((element) => {
    if (element.kind !== "node") return;
    const [nx, ny, nw, nh] = element.xywh;
    const padding = isGroupNodeType(element.type) ? groupPadding : 0;
    boundsMap[element.id] = {
      x: nx - padding,
      y: ny - padding,
      w: nw + padding * 2,
      h: nh + padding * 2,
    };
  });

  // 逻辑：同源子节点统一方向时，连接中心应保持一致。
  const sourceAxisPreference = buildSourceAxisPreferenceMap(
    snapshot.elements.filter(
      (element): element is CanvasConnectorElement => element.kind === "connector"
    ),
    elementId => boundsMap[elementId]
  );

  const resolved = resolveConnectorEndpointsSmart(
    connector.source,
    connector.target,
    anchors,
    boundsMap,
    { sourceAxisPreference }
  );
  if (!resolved.source || !resolved.target) return fallback;
  const style = connector.style ?? snapshot.connectorStyle;
  const path = buildConnectorPath(style, resolved.source, resolved.target, {
    sourceAnchorId: resolved.sourceAnchorId,
    targetAnchorId: resolved.targetAnchorId,
  });
  const polyline = flattenConnectorPath(path, 20);
  const midpoint = resolvePolylineMidpoint(polyline);
  return midpoint ?? fallback;
}

/** Resolve the midpoint of a polyline by length. */
function resolvePolylineMidpoint(points: CanvasPoint[]): CanvasPoint | null {
  if (points.length < 2) return null;
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  if (total <= 0) return points[0] ?? null;
  const target = total / 2;
  let traveled = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const segment = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (traveled + segment >= target) {
      const t = segment > 0 ? (target - traveled) / segment : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    traveled += segment;
  }
  return points[points.length - 1] ?? null;
}

type NodeInspectorPanelProps = {
  /** Target node element. */
  element: CanvasNodeElement;
  /** Close handler. */
  onClose: () => void;
};

/** Render a compact inspector panel for a node. */
function NodeInspectorPanel({ element, onClose }: NodeInspectorPanelProps) {
  const [x, y, w, h] = element.xywh;
  const { t } = useTranslation('board');
  // 逻辑：使用独立视图订阅计算面板位置，避免依赖全量快照更新。
  const engine = useBoardEngine();
  const viewState = useBoardViewState(engine);
  const { zoom, offset, size } = viewState.viewport;
  const nodeTop = y * zoom + offset[1];
  const showBelow = nodeTop <= size[1] * 0.15;
  const anchor: CanvasPoint = showBelow ? [x + w / 2, y + h] : [x + w / 2, y];
  const screen = toScreenPoint(anchor, viewState);

  const details = extractNodeDetails(element, t);

  return (
    <div
      data-node-inspector
      className={cn(
        "pointer-events-auto absolute z-30 min-w-[220px] -translate-x-1/2 rounded-3xl",
        "border border-ol-divider bg-background/95 px-3 py-2 text-xs text-ol-text-auxiliary shadow-[0_12px_28px_rgba(15,23,42,0.18)] backdrop-blur",
        showBelow ? "mt-3" : "mb-3"
      )}
      style={{ left: screen[0], top: screen[1] }}
      onPointerDown={event => {
        // 逻辑：面板交互不触发画布选择。
        event.stopPropagation();
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-ol-text-auxiliary">
          {t('nodeInspector.panelTitle')}
        </span>
        <button
          type="button"
          onPointerDown={event => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
          className="rounded-3xl px-1 py-0.5 text-[11px] text-ol-text-auxiliary transition-colors duration-150 hover:text-ol-text-primary"
        >
          {t('nodeInspector.close')}
        </button>
      </div>
      <div className="space-y-1">
        {details.map(detail => (
          <div key={detail.label} className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-ol-text-auxiliary">
              {detail.label}
            </span>
            <span className="text-[11px] font-medium text-ol-text-primary">
              {detail.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type NodeDetailItem = {
  /** Detail label. */
  label: string;
  /** Detail value. */
  value: string;
};

/** Extract basic details from the node for the inspector. */
function extractNodeDetails(
  element: CanvasNodeElement,
  t: (key: string) => string
): NodeDetailItem[] {
  const [x, y, w, h] = element.xywh;
  const details: NodeDetailItem[] = [
    { label: t('nodeInspector.type'), value: element.type },
    { label: "ID", value: element.id },
    { label: t('nodeInspector.position'), value: `${Math.round(x)}, ${Math.round(y)}` },
    { label: t('nodeInspector.size'), value: `${Math.round(w)} × ${Math.round(h)}` },
  ];

  if (element.props && typeof element.props === "object") {
    const props = element.props as Record<string, unknown>;
    if (typeof props.title === "string") {
      details.push({ label: t('nodeInspector.titleLabel'), value: props.title });
    }
    if (typeof props.description === "string") {
      details.push({ label: t('nodeInspector.description'), value: props.description });
    }
  }

  return details;
}

export { ConnectorActionPanel, NodeInspectorPanel };
