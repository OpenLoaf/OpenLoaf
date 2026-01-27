"use client";

import { memo, useMemo } from "react";
import type {
  CanvasConnectorElement,
  CanvasPoint,
  CanvasRect,
  CanvasSnapshot,
} from "../engine/types";
import { useBoardEngine } from "../core/BoardProvider";
import { useBoardViewState } from "../core/useBoardViewState";
import { applyGroupAnchorPadding } from "../engine/anchors";
import { getGroupOutlinePadding, isGroupNodeType } from "../engine/grouping";
import {
  buildConnectorPath,
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
  const viewState = useBoardViewState(engine);
  // 逻辑：视口更新必须即时驱动 SVG，避免平移/缩放时连线延迟。
  const viewport = viewState.viewport;
  const { elements, selectedIds, connectorHoverId, connectorDraft, connectorStyle } = snapshot;

  const { boundsMap, connectorElements } = useMemo(() => {
    const groupPadding = getGroupOutlinePadding(viewport.zoom);
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
  }, [elements, viewport.zoom]);

  const anchors = useMemo(() => {
    const groupPadding = getGroupOutlinePadding(viewport.zoom);
    return applyGroupAnchorPadding(snapshot.anchors, elements, groupPadding);
  }, [elements, snapshot.anchors, viewport.zoom]);

  const connectorItems = connectorElements.map((connector) => {
    const avoidRects = getConnectorAvoidRects(connector, connectorElements, boundsMap);
    const resolved = resolveConnectorEndpointsSmart(
      connector.source,
      connector.target,
      anchors,
      boundsMap,
      { avoidRects, connectorStyle: connector.style ?? connectorStyle }
    );
    if (!resolved.source || !resolved.target) return null;
    const style = connector.style ?? connectorStyle;
    const path = buildConnectorPath(style, resolved.source, resolved.target, {
      sourceAnchorId: resolved.sourceAnchorId,
      targetAnchorId: resolved.targetAnchorId,
    });
    const points = flattenConnectorPath(path);
    return {
      id: connector.id,
      path: pathToSvg(path),
      arrowPath: buildArrowPath(points),
      selected: selectedIds.includes(connector.id),
      hovered: connectorHoverId === connector.id,
    };
  });

  const draftItem = useMemo(() => {
    if (!connectorDraft) return null;
    const resolved = resolveConnectorEndpointsSmart(
      connectorDraft.source,
      connectorDraft.target,
      anchors,
      boundsMap
    );
    if (!resolved.source || !resolved.target) return null;
    const style = connectorDraft.style ?? connectorStyle;
    const path = buildConnectorPath(style, resolved.source, resolved.target, {
      sourceAnchorId: resolved.sourceAnchorId,
      targetAnchorId: resolved.targetAnchorId,
    });
    return pathToSvg(path);
  }, [anchors, boundsMap, connectorDraft, connectorStyle]);

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={viewport.size[0]}
      height={viewport.size[1]}
      viewBox={`0 0 ${viewport.size[0]} ${viewport.size[1]}`}
      aria-hidden="true"
    >
      <g transform={`translate(${viewport.offset[0]} ${viewport.offset[1]}) scale(${viewport.zoom})`}>
        {connectorItems.map((item) => {
          if (!item) return null;
          const baseStroke = item.selected ? CONNECTOR_STROKE_SELECTED : CONNECTOR_STROKE;
          const hoverStroke =
            item.hovered && !item.selected ? CONNECTOR_STROKE_HOVER : undefined;
          const baseColor = item.selected
            ? "var(--canvas-connector-selected)"
            : "var(--canvas-connector)";
          const hoverColor = "var(--canvas-connector-selected)";
          return (
            <g key={item.id}>
              {hoverStroke ? (
                <path
                  d={item.path}
                  fill="none"
                  stroke={hoverColor}
                  strokeOpacity={0.5}
                  strokeWidth={hoverStroke}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              <path
                d={item.path}
                fill="none"
                stroke={baseColor}
                strokeWidth={baseStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {item.arrowPath ? (
                <path
                  d={item.arrowPath}
                  fill="none"
                  stroke={baseColor}
                  strokeWidth={baseStroke}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </g>
          );
        })}
        {draftItem ? (
          <path
            d={draftItem}
            fill="none"
            stroke="var(--canvas-connector-draft)"
            strokeWidth={CONNECTOR_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
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

/** Collect bounds for nodes connected from the same source node. */
function getConnectorAvoidRects(
  connector: CanvasConnectorElement,
  connectors: CanvasConnectorElement[],
  boundsMap: Record<string, CanvasRect | undefined>
): CanvasRect[] {
  if (!("elementId" in connector.source)) return [];
  const sourceId = connector.source.elementId;
  const targetId = "elementId" in connector.target ? connector.target.elementId : undefined;
  const avoidRects: CanvasRect[] = [];
  connectors.forEach((other) => {
    if (other.id === connector.id) return;
    if (!("elementId" in other.source)) return;
    if (other.source.elementId !== sourceId) return;
    if (!("elementId" in other.target)) return;
    const otherTargetId = other.target.elementId;
    if (!otherTargetId || otherTargetId === targetId) return;
    const bounds = boundsMap[otherTargetId];
    if (bounds) avoidRects.push(bounds);
  });
  return avoidRects;
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
