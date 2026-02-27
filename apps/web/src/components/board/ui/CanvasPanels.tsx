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
import { cn } from "@udecode/cn";
import {
  ArrowRight,
  ChartSpline,
  CornerRightDown,
  PencilLine,
  Sparkles,
  Trash2,
} from "lucide-react";

import type {
  CanvasConnectorElement,
  CanvasConnectorStyle,
  CanvasNodeElement,
  CanvasPoint,
  CanvasSnapshot,
  CanvasRect,
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
import { MINDMAP_BRANCH_COLORS } from "../engine/constants";

type ConnectorActionPanelProps = {
  /** Snapshot used for positioning. */
  snapshot: CanvasSnapshot;
  /** Selected connector element. */
  connector: CanvasConnectorElement;
  /** Apply a new connector style. */
  onStyleChange: (style: CanvasConnectorStyle) => void;
  /** Apply a new connector color. */
  onColorChange: (color: string) => void;
  /** Toggle connector dashed style. */
  onDashedChange: (dashed: boolean) => void;
  /** Delete the selected connector. */
  onDelete: () => void;
};

/** Render a style panel when a connector is selected. */
function ConnectorActionPanel({
  snapshot,
  connector,
  onStyleChange,
  onColorChange,
  onDashedChange,
  onDelete,
}: ConnectorActionPanelProps) {
  // 逻辑：面板位置随视口变化实时更新。
  const engine = useBoardEngine();
  const viewState = useBoardViewState(engine);
  const center = resolveConnectorCenter(connector, snapshot, viewState.viewport);
  const screen = toScreenPoint(center, viewState);
  // 逻辑：工具栏上移，避免遮挡水平连线。
  const offsetScreenY = 26;
  const currentStyle = connector.style ?? snapshot.connectorStyle;
  const currentDashed = connector.dashed ?? false;

  return (
    <div
      data-connector-action
      className="pointer-events-auto absolute z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-slate-200/40 bg-background/90 px-2 py-1 shadow-[0_12px_28px_rgba(15,23,42,0.18)] backdrop-blur"
      style={{ left: screen[0], top: screen[1] - offsetScreenY }}
      onPointerDown={event => {
        // 逻辑：避免面板交互触发画布选择。
        event.stopPropagation();
      }}
    >
      <div className="flex items-center gap-3">
        <ConnectorStyleButton
          title="直线"
          active={currentStyle === "straight"}
          onPointerDown={() => onStyleChange("straight")}
        >
          <ArrowRight size={14} />
        </ConnectorStyleButton>
        <ConnectorStyleButton
          title="折线"
          active={currentStyle === "elbow"}
          onPointerDown={() => onStyleChange("elbow")}
        >
          <CornerRightDown size={14} />
        </ConnectorStyleButton>
        <ConnectorStyleButton
          title="曲线"
          active={currentStyle === "curve"}
          onPointerDown={() => onStyleChange("curve")}
        >
          <ChartSpline size={14} />
        </ConnectorStyleButton>
        <ConnectorStyleButton
          title="手绘"
          active={currentStyle === "hand"}
          onPointerDown={() => onStyleChange("hand")}
        >
          <PencilLine size={14} />
        </ConnectorStyleButton>
        <ConnectorStyleButton
          title="飞行"
          active={currentStyle === "fly"}
          onPointerDown={() => onStyleChange("fly")}
        >
          <Sparkles size={14} />
        </ConnectorStyleButton>
      </div>
      <span className="mx-1 h-4 w-px bg-border" />
      <div className="flex items-center gap-1">
        {MINDMAP_BRANCH_COLORS.map(color => {
          const isActive = connector.color === color;
          return (
            <button
              key={color}
              type="button"
              onPointerDown={event => {
                event.preventDefault();
                event.stopPropagation();
                onColorChange(color);
              }}
              className={cn(
                "h-6 w-6 rounded-full border border-slate-200/60",
                isActive ? "ring-2 ring-slate-400/70 ring-offset-2 ring-offset-background" : ""
              )}
              style={{ backgroundColor: color }}
              title={`连线颜色 ${color}`}
            />
          );
        })}
        <button
          type="button"
          onPointerDown={event => {
            event.preventDefault();
            event.stopPropagation();
            onDashedChange(!currentDashed);
          }}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/60 text-slate-600",
            currentDashed
              ? "bg-slate-100 text-slate-900 ring-2 ring-slate-400/70 ring-offset-2 ring-offset-background"
              : "hover:bg-slate-100/70"
          )}
          title="虚线"
        >
          <span className="block w-4 border-t-2 border-dashed border-current" />
        </button>
      </div>
      <span className="mx-1 h-4 w-px bg-border" />
      <button
        type="button"
        onPointerDown={event => {
          event.preventDefault();
          event.stopPropagation();
          onDelete();
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-destructive/10 hover:text-destructive"
        title="删除连线"
      >
        <Trash2 size={14} />
      </button>
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

type ConnectorStyleButtonProps = {
  /** Button label for tooltip. */
  title: string;
  /** Whether the button is active. */
  active: boolean;
  /** Pointer down handler. */
  onPointerDown: () => void;
  /** Icon content. */
  children: ReactNode;
};

/** Render a connector style control button. */
function ConnectorStyleButton({
  title,
  active,
  onPointerDown,
  children,
}: ConnectorStyleButtonProps) {
  return (
    <button
      type="button"
      onPointerDown={event => {
        event.preventDefault();
        event.stopPropagation();
        onPointerDown();
      }}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition",
        active
          ? "bg-slate-900 text-white shadow-[0_0_0_1px_rgba(15,23,42,0.2)]"
          : "hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800/70 dark:hover:text-slate-100"
      )}
      title={title}
    >
      {children}
    </button>
  );
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
  // 逻辑：使用独立视图订阅计算面板位置，避免依赖全量快照更新。
  const engine = useBoardEngine();
  const viewState = useBoardViewState(engine);
  const { zoom, offset, size } = viewState.viewport;
  const nodeTop = y * zoom + offset[1];
  const showBelow = nodeTop <= size[1] * 0.15;
  const anchor: CanvasPoint = showBelow ? [x + w / 2, y + h] : [x + w / 2, y];
  const screen = toScreenPoint(anchor, viewState);

  const details = extractNodeDetails(element);

  return (
    <div
      data-node-inspector
      className={cn(
        "pointer-events-auto absolute z-30 min-w-[220px] -translate-x-1/2 rounded-xl",
        "border border-slate-200/70 bg-background/95 px-3 py-2 text-xs text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.18)] backdrop-blur",
        "dark:border-slate-700/70 dark:text-slate-200",
        showBelow ? "mt-3" : "mb-3"
      )}
      style={{ left: screen[0], top: screen[1] }}
      onPointerDown={event => {
        // 逻辑：面板交互不触发画布选择。
        event.stopPropagation();
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">
          节点详情
        </span>
        <button
          type="button"
          onPointerDown={event => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
          className="rounded-full px-1 py-0.5 text-[11px] text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-100"
        >
          关闭
        </button>
      </div>
      <div className="space-y-1">
        {details.map(detail => (
          <div key={detail.label} className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {detail.label}
            </span>
            <span className="text-[11px] font-medium text-slate-800 dark:text-slate-100">
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
function extractNodeDetails(element: CanvasNodeElement): NodeDetailItem[] {
  const [x, y, w, h] = element.xywh;
  const details: NodeDetailItem[] = [
    { label: "类型", value: element.type },
    { label: "ID", value: element.id },
    { label: "位置", value: `${Math.round(x)}, ${Math.round(y)}` },
    { label: "尺寸", value: `${Math.round(w)} × ${Math.round(h)}` },
  ];

  if (element.props && typeof element.props === "object") {
    const props = element.props as Record<string, unknown>;
    if (typeof props.title === "string") {
      details.push({ label: "标题", value: props.title });
    }
    if (typeof props.description === "string") {
      details.push({ label: "描述", value: props.description });
    }
  }

  return details;
}

export { ConnectorActionPanel, NodeInspectorPanel };
