/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type {
  CanvasConnectorElement,
  CanvasPoint,
  CanvasRect,
  CanvasSnapshot,
  CanvasViewState,
} from "../engine/types";
import { useBoardEngine } from "../core/BoardProvider";
import { applyGroupAnchorPadding } from "../engine/anchors";
import { getGroupOutlinePadding, isGroupNodeType } from "../engine/grouping";
import { MINDMAP_META } from "../engine/mindmap-layout";
import {
  buildConnectorPath,
  buildSourceAxisPreferenceMap,
  flattenConnectorPath,
  resolveConnectorEndpointsSmart,
} from "../utils/connector-path";

const CONNECTOR_STROKE = 4.5;
const CONNECTOR_STROKE_SELECTED = 6;
const CONNECTOR_STROKE_HOVER = 5.5;
const CONNECTOR_ARROW_SIZE = 10;
const CONNECTOR_ARROW_ANGLE = Math.PI / 7;

type SvgConnectorLayerProps = {
  /** Snapshot for connector rendering. */
  snapshot: CanvasSnapshot;
};

/** Render connector strokes with SVG for precise selection visuals. */
export const SvgConnectorLayer = memo(function SvgConnectorLayer({
  snapshot,
}: SvgConnectorLayerProps) {
  const engine = useBoardEngine();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const pendingViewRef = useRef<CanvasViewState | null>(null);
  const rafRef = useRef<number | null>(null);
  const initialView = engine.getViewState();
  const viewport = initialView.viewport;
  const {
    elements,
    selectedIds,
    connectorHoverId,
    connectorDraft,
    connectorStyle,
    connectorDashed,
  } = snapshot;

  const { boundsMap, connectorElements } = useMemo(() => {
    const groupPadding = getGroupOutlinePadding(1);
    const bounds: Record<string, CanvasRect | undefined> = {};
    elements.forEach((element) => {
      if (element.kind !== "node") return;
      bounds[element.id] = getNodeBounds(element, groupPadding);
    });
    return {
      boundsMap: bounds,
      connectorElements: elements.filter(
        (element): element is CanvasConnectorElement => element.kind === "connector"
      ),
    };
  }, [elements]);

  const anchors = useMemo(() => {
    const groupPadding = getGroupOutlinePadding(1);
    return applyGroupAnchorPadding(snapshot.anchors, elements, groupPadding);
  }, [elements, snapshot.anchors]);

  const branchColorMap = useMemo(() => {
    const map = new Map<string, string>();
    elements.forEach(element => {
      if (element.kind !== "node") return;
      const meta = element.meta as Record<string, unknown> | undefined;
      const color = meta?.[MINDMAP_META.branchColor];
      if (typeof color === "string") {
        map.set(element.id, color);
      }
    });
    return map;
  }, [elements]);

  const sourceAxisPreference = useMemo(() => {
    // 逻辑：当同源所有目标处于单侧时统一连线方向。
    return buildSourceAxisPreferenceMap(connectorElements, elementId => boundsMap[elementId]);
  }, [boundsMap, connectorElements]);

  const connectorItems = connectorElements.map((connector) => {
    const resolved = resolveConnectorEndpointsSmart(
      connector.source,
      connector.target,
      anchors,
      boundsMap,
      { sourceAxisPreference }
    );
    if (!resolved.source || !resolved.target) return null;
    const style = connector.style ?? connectorStyle;
    const path = buildConnectorPath(style, resolved.source, resolved.target, {
      sourceAnchorId: resolved.sourceAnchorId,
      targetAnchorId: resolved.targetAnchorId,
    });
    const points = flattenConnectorPath(path);
    const inheritedColor =
      "elementId" in connector.source
        ? branchColorMap.get(connector.source.elementId)
        : undefined;
    return {
      id: connector.id,
      path: pathToSvg(path),
      arrowPath: buildArrowPath(points),
      selected: selectedIds.includes(connector.id),
      hovered: connectorHoverId === connector.id,
      color: connector.color ?? inheritedColor,
      dashed: connector.dashed ?? false,
    };
  });

  const draftItem = useMemo(() => {
    if (!connectorDraft) return null;
    const resolved = resolveConnectorEndpointsSmart(
      connectorDraft.source,
      connectorDraft.target,
      anchors,
      boundsMap,
      { sourceAxisPreference }
    );
    if (!resolved.source || !resolved.target) return null;
    const style = connectorDraft.style ?? connectorStyle;
    const path = buildConnectorPath(style, resolved.source, resolved.target, {
      sourceAnchorId: resolved.sourceAnchorId,
      targetAnchorId: resolved.targetAnchorId,
    });
    return {
      path: pathToSvg(path),
      dashed: connectorDraft.dashed ?? connectorDashed,
    };
  }, [anchors, boundsMap, connectorDashed, connectorDraft, connectorStyle]);

  const applyView = useCallback((view: CanvasViewState) => {
    const svg = svgRef.current;
    const group = groupRef.current;
    if (!svg || !group) return;
    const { size, offset, zoom } = view.viewport;
    svg.setAttribute("width", `${size[0]}`);
    svg.setAttribute("height", `${size[1]}`);
    svg.setAttribute("viewBox", `0 0 ${size[0]} ${size[1]}`);
    group.setAttribute(
      "transform",
      `translate(${offset[0]} ${offset[1]}) scale(${zoom})`
    );
  }, []);

  const scheduleViewUpdate = useCallback(
    (view: CanvasViewState) => {
      pendingViewRef.current = view;
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        if (!pendingViewRef.current) return;
        applyView(pendingViewRef.current);
      });
    },
    [applyView]
  );

  useEffect(() => {
    const handleViewChange = () => {
      // 逻辑：视图变化仅更新 SVG transform/尺寸，避免连线路径重算。
      scheduleViewUpdate(engine.getViewState());
    };
    handleViewChange();
    const unsubscribe = engine.subscribeView(handleViewChange);
    return () => {
      unsubscribe();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [engine, scheduleViewUpdate]);

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0"
      width={viewport.size[0]}
      height={viewport.size[1]}
      viewBox={`0 0 ${viewport.size[0]} ${viewport.size[1]}`}
      aria-hidden="true"
    >
      <g
        ref={groupRef}
        transform={`translate(${viewport.offset[0]} ${viewport.offset[1]}) scale(${viewport.zoom})`}
      >
        {connectorItems.map((item) => {
          if (!item) return null;
          const baseStroke = item.selected ? CONNECTOR_STROKE_SELECTED : CONNECTOR_STROKE;
          const hoverStroke =
            item.hovered && !item.selected ? CONNECTOR_STROKE_HOVER : undefined;
          const baseColor = item.color ?? "var(--canvas-connector)";
          const strokeColor = item.selected
            ? "var(--canvas-connector-selected)"
            : item.hovered
              ? "var(--canvas-connector-selected)"
              : baseColor;
          const dashPattern = item.dashed ? "6 6" : undefined;
          return (
            <g key={item.id}>
              {hoverStroke ? (
                <path
                  d={item.path}
                  fill="none"
                  stroke="var(--canvas-connector-selected)"
                  strokeOpacity={0.5}
                  strokeWidth={hoverStroke}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={dashPattern}
                />
              ) : null}
              <path
                d={item.path}
                fill="none"
                stroke={strokeColor}
                strokeWidth={baseStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={dashPattern}
              />
              {item.arrowPath ? (
                <path
                  d={item.arrowPath}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={baseStroke}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={dashPattern}
                />
              ) : null}
            </g>
          );
        })}
        {draftItem ? (
          <path
            d={draftItem.path}
            fill="none"
            stroke="var(--canvas-connector-draft)"
            strokeWidth={CONNECTOR_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={draftItem.dashed ? "6 6" : undefined}
          />
        ) : null}
      </g>
    </svg>
  );
});

/** Compute the bounding rect for a node element. */
function getNodeBounds(
  element: Extract<CanvasSnapshot["elements"][number], { kind: "node" }>,
  groupPadding: number
): CanvasRect {
  const [x, y, w, h] = element.xywh;
  const padding = isGroupNodeType(element.type) ? groupPadding : 0;
  const paddedX = x - padding;
  const paddedY = y - padding;
  const paddedW = w + padding * 2;
  const paddedH = h + padding * 2;
  if (!element.rotate) {
    return { x: paddedX, y: paddedY, w: paddedW, h: paddedH };
  }
  const rad = (element.rotate * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // 逻辑：旋转节点转成包围盒，避免连线锚点裁剪。
  const halfW = (Math.abs(paddedW * cos) + Math.abs(paddedH * sin)) / 2;
  const halfH = (Math.abs(paddedW * sin) + Math.abs(paddedH * cos)) / 2;
  const cx = paddedX + paddedW / 2;
  const cy = paddedY + paddedH / 2;
  return {
    x: cx - halfW,
    y: cy - halfH,
    w: halfW * 2,
    h: halfH * 2,
  };
}

/** Convert a connector path into SVG path data. */
function pathToSvg(path: ReturnType<typeof buildConnectorPath>): string {
  if (path.kind === "polyline") {
    return path.points.reduce(
      (acc, point, index) =>
        `${acc}${index === 0 ? "M" : "L"}${point[0]} ${point[1]} `,
      ""
    );
  }
  const [p0, p1, p2, p3] = path.points;
  return `M${p0[0]} ${p0[1]} C${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} ${p3[0]} ${p3[1]}`;
}

/** Build SVG path data for the connector arrow head. */
function buildArrowPath(points: CanvasPoint[]): string | null {
  if (points.length < 2) return null;
  const end = points[points.length - 1]!;
  const prev = points[points.length - 2]!;
  const dx = end[0] - prev[0];
  const dy = end[1] - prev[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const sin = Math.sin(CONNECTOR_ARROW_ANGLE);
  const cos = Math.cos(CONNECTOR_ARROW_ANGLE);
  const lx = ux * cos - uy * sin;
  const ly = ux * sin + uy * cos;
  const rx = ux * cos + uy * sin;
  const ry = -ux * sin + uy * cos;
  const leftX = end[0] - lx * CONNECTOR_ARROW_SIZE;
  const leftY = end[1] - ly * CONNECTOR_ARROW_SIZE;
  const rightX = end[0] - rx * CONNECTOR_ARROW_SIZE;
  const rightY = end[1] - ry * CONNECTOR_ARROW_SIZE;
  return `M${end[0]} ${end[1]} L${leftX} ${leftY} M${end[0]} ${end[1]} L${rightX} ${rightY}`;
}
