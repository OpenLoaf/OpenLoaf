import { STROKE_NODE_TYPE } from "./types";
import type {
  CanvasAnchorHit,
  CanvasAnchorMap,
  CanvasConnectorElement,
  CanvasConnectorEndpointHit,
  CanvasConnectorEndpointRole,
  CanvasConnectorEnd,
  CanvasConnectorStyle,
  CanvasElement,
  CanvasNodeElement,
  CanvasPoint,
  StrokeNodeProps,
} from "./types";
import {
  ANCHOR_HIT_RADIUS,
  CONNECTOR_ENDPOINT_HIT_RADIUS,
  CONNECTOR_HIT_RADIUS,
  EDGE_ANCHOR_CENTER_RANGE,
  EDGE_ANCHOR_HIT_RADIUS,
  MIN_ZOOM,
  STROKE_HIT_RADIUS,
} from "./constants";
import type { NodeRegistry } from "../NodeRegistry";
import { resolveConnectorEndpointsWithBounds } from "./connector-resolve";
import {
  buildConnectorPath,
  computeBounds,
  distanceToPolyline,
  flattenConnectorPath,
  resolveConnectorEndpoint,
} from "../utils/connector-path";

/** Find the top-most node element at the given world point. */
function findNodeAt(point: CanvasPoint, nodes: CanvasNodeElement[]): CanvasNodeElement | null {
  // 反向遍历保证命中最上层元素。
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const element = nodes[i];
    if (!element) continue;
    const [x, y, w, h] = element.xywh;
    const within =
      point[0] >= x &&
      point[0] <= x + w &&
      point[1] >= y &&
      point[1] <= y + h;
    if (within) return element;
  }
  return null;
}

/** Resolve the nearest edge-center anchor for a node. */
function getNearestEdgeAnchorHit(
  element: CanvasNodeElement,
  nodes: NodeRegistry,
  hint: CanvasPoint
): CanvasAnchorHit | null {
  const definition = nodes.getDefinition(element.type);
  const connectable = definition?.capabilities?.connectable ?? "auto";
  if (connectable === "none") return null;
  if (connectable !== "auto" && connectable !== "anchors") return null;
  const [x, y, w, h] = element.xywh;
  const edges = [
    { id: "top", point: [x + w / 2, y] as CanvasPoint },
    { id: "right", point: [x + w, y + h / 2] as CanvasPoint },
    { id: "bottom", point: [x + w / 2, y + h] as CanvasPoint },
    { id: "left", point: [x, y + h / 2] as CanvasPoint },
  ];
  const firstEdge = edges[0];
  if (!firstEdge) return null;
  let closest = firstEdge;
  let closestDistance = Number.POSITIVE_INFINITY;
  edges.forEach(edge => {
    const distance = Math.hypot(edge.point[0] - hint[0], edge.point[1] - hint[1]);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = edge;
    }
  });
  return {
    elementId: element.id,
    anchorId: closest.id,
    point: closest.point,
  };
}

/** Find the nearest connector endpoint hit. */
function findConnectorEndpointHit(
  point: CanvasPoint,
  connectors: CanvasConnectorElement[],
  anchors: CanvasAnchorMap,
  zoom: number,
  getNodeBoundsById: (elementId: string) => { x: number; y: number; w: number; h: number } | undefined,
  connectorIds?: string[]
): CanvasConnectorEndpointHit | null {
  const filtered = connectorIds
    ? connectors.filter(connector => connectorIds.includes(connector.id))
    : connectors;
  // 逻辑：端点命中半径按缩放换算。
  const hitRadius = CONNECTOR_ENDPOINT_HIT_RADIUS / Math.max(zoom, MIN_ZOOM);
  let closest: CanvasConnectorEndpointHit | null = null;
  let closestDistance = hitRadius;

  filtered.forEach(connector => {
    const { source, target } = resolveConnectorEndpointsWithBounds(
      connector.source,
      connector.target,
      anchors,
      getNodeBoundsById
    );
    if (source) {
      const dist = Math.hypot(point[0] - source[0], point[1] - source[1]);
      if (dist <= closestDistance) {
        closestDistance = dist;
        closest = {
          connectorId: connector.id,
          role: "source",
          point: source,
        };
      }
    }
    if (target) {
      const dist = Math.hypot(point[0] - target[0], point[1] - target[1]);
      if (dist <= closestDistance) {
        closestDistance = dist;
        closest = {
          connectorId: connector.id,
          role: "target",
          point: target,
        };
      }
    }
  });

  return closest;
}

/** Find the nearest anchor within a hit radius. */
function findAnchorHit(
  point: CanvasPoint,
  anchors: CanvasAnchorMap,
  zoom: number,
  exclude?: { elementId: string; anchorId: string }
): CanvasAnchorHit | null {
  // 逻辑：命中半径随缩放变化，保持屏幕体验一致。
  const hitRadius = ANCHOR_HIT_RADIUS / Math.max(zoom, MIN_ZOOM);
  let closest: CanvasAnchorHit | null = null;
  let closestDistance = hitRadius;

  Object.entries(anchors).forEach(([elementId, anchorList]) => {
    anchorList.forEach(anchor => {
      if (
        exclude &&
        exclude.elementId === elementId &&
        exclude.anchorId === anchor.id
      ) {
        return;
      }
      const distance = Math.hypot(
        point[0] - anchor.point[0],
        point[1] - anchor.point[1]
      );
      if (distance <= closestDistance) {
        closestDistance = distance;
        closest = {
          elementId,
          anchorId: anchor.id,
          point: anchor.point,
        };
      }
    });
  });

  return closest;
}

/** Find the closest edge-center anchor hit for nodes. */
function findEdgeAnchorHit(
  point: CanvasPoint,
  elements: CanvasNodeElement[],
  nodes: NodeRegistry,
  zoom: number,
  exclude?: { elementId: string; anchorId: string }
): CanvasAnchorHit | null {
  // 逻辑：边缘命中半径随缩放换算，保证交互手感稳定。
  const hitRadius = EDGE_ANCHOR_HIT_RADIUS / Math.max(zoom, MIN_ZOOM);
  const centerRange = EDGE_ANCHOR_CENTER_RANGE / Math.max(zoom, MIN_ZOOM);

  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const element = elements[i];
    if (!element) continue;
    const definition = nodes.getDefinition(element.type);
    const connectable = definition?.capabilities?.connectable ?? "auto";
    if (connectable === "auto" || connectable === "anchors") {
      const [x, y, w, h] = element.xywh;
      const withinX = point[0] >= x - hitRadius && point[0] <= x + w + hitRadius;
      const withinY = point[1] >= y - hitRadius && point[1] <= y + h + hitRadius;
      if (!withinX || !withinY) continue;

      const edgeHits: Array<{ id: string; distance: number; point: CanvasPoint }> = [];
      const centerY = y + h / 2;
      const centerX = x + w / 2;
      if (
        point[0] >= x - hitRadius &&
        point[0] <= x + hitRadius &&
        Math.abs(point[1] - centerY) <= centerRange
      ) {
        edgeHits.push({ id: "left", distance: Math.abs(point[0] - x), point: [x, centerY] });
      }
      if (
        point[0] >= x + w - hitRadius &&
        point[0] <= x + w + hitRadius &&
        Math.abs(point[1] - centerY) <= centerRange
      ) {
        edgeHits.push({
          id: "right",
          distance: Math.abs(point[0] - (x + w)),
          point: [x + w, centerY],
        });
      }
      if (
        point[1] >= y - hitRadius &&
        point[1] <= y + hitRadius &&
        Math.abs(point[0] - centerX) <= centerRange
      ) {
        edgeHits.push({ id: "top", distance: Math.abs(point[1] - y), point: [centerX, y] });
      }
      if (
        point[1] >= y + h - hitRadius &&
        point[1] <= y + h + hitRadius &&
        Math.abs(point[0] - centerX) <= centerRange
      ) {
        edgeHits.push({
          id: "bottom",
          distance: Math.abs(point[1] - (y + h)),
          point: [centerX, y + h],
        });
      }

      if (edgeHits.length === 0) continue;
      edgeHits.sort((a, b) => a.distance - b.distance);
      const hit = edgeHits[0];
      if (!hit) continue;
      if (hit.distance > hitRadius) continue;
      if (exclude && exclude.elementId === element.id && exclude.anchorId === hit.id) {
        continue;
      }
      return {
        elementId: element.id,
        anchorId: hit.id,
        point: hit.point,
      };
    }
  }

  return null;
}

/** Pick the top-most element at the given world point. */
function pickElementAt(
  point: CanvasPoint,
  elements: CanvasElement[],
  anchors: CanvasAnchorMap,
  zoom: number,
  connectorStyle: CanvasConnectorStyle,
  getNodeBoundsById: (elementId: string) => { x: number; y: number; w: number; h: number } | undefined
): CanvasElement | null {
  if (elements.length === 0) return null;
  const nodeHitRadius = 0;
  const connectorHitRadius = CONNECTOR_HIT_RADIUS / Math.max(zoom, MIN_ZOOM);
  const strokeHitRadius = STROKE_HIT_RADIUS / Math.max(zoom, MIN_ZOOM);

  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const element = elements[i];
    if (!element) continue;
    if (element.kind === "node") {
      if (element.type === STROKE_NODE_TYPE) {
        // 逻辑：笔迹节点需要按路径距离命中，避免仅用包围盒。
        const strokeProps = element.props as StrokeNodeProps;
        const [x, y, w, h] = element.xywh;
        const padding = Math.max(strokeProps.size / 2, strokeHitRadius);
        if (
          point[0] < x - padding ||
          point[0] > x + w + padding ||
          point[1] < y - padding ||
          point[1] > y + h + padding
        ) {
          continue;
        }
        const points = strokeProps.points;
        if (points.length === 0) {
          continue;
        }
        if (points.length === 1) {
          const [px, py] = points[0];
          const distance = Math.hypot(point[0] - (px + x), point[1] - (py + y));
          if (distance <= padding) return element;
          continue;
        }
        const distance = distanceToPolyline(
          point,
          points.map(pt => [pt[0] + x, pt[1] + y])
        );
        if (distance <= padding) return element;
        continue;
      }
      const [x, y, w, h] = element.xywh;
      const within =
        point[0] >= x - nodeHitRadius &&
        point[0] <= x + w + nodeHitRadius &&
        point[1] >= y - nodeHitRadius &&
        point[1] <= y + h + nodeHitRadius;
      if (within) return element;
      continue;
    }
    if (element.kind === "connector") {
      const { source, target, sourceAnchorId, targetAnchorId } =
        resolveConnectorEndpointsWithBounds(
          element.source,
          element.target,
          anchors,
          getNodeBoundsById
        );
      if (!source || !target) continue;
      const style = element.style ?? connectorStyle;
      const path = buildConnectorPath(style, source, target, {
        sourceAnchorId,
        targetAnchorId,
      });
      const polyline = flattenConnectorPath(path, 20);
      const distance = distanceToPolyline(point, polyline);
      if (distance <= connectorHitRadius) return element;
    }
  }
  return null;
}

/** Resolve connector endpoints with fallback positions. */
function resolveConnectorPoint(
  end: CanvasConnectorEnd,
  anchors: CanvasAnchorMap,
  getNodeById: (elementId: string) => CanvasNodeElement | undefined,
  hint?: CanvasPoint | null
): CanvasPoint | null {
  const resolved = resolveConnectorEndpoint(end, anchors, hint ?? null);
  if (resolved) return resolved;
  if ("elementId" in end) {
    const element = getNodeById(end.elementId);
    if (element) {
      const [x, y, w, h] = element.xywh;
      return [x + w / 2, y + h / 2];
    }
  }
  return null;
}

/** Compute bounds for a connector based on resolved endpoints. */
function computeConnectorBounds(
  source: CanvasPoint,
  target: CanvasPoint,
  style: "curve" | "elbow",
  sourceAnchorId?: string,
  targetAnchorId?: string
): { x: number; y: number; w: number; h: number } {
  const path = buildConnectorPath(style, source, target, {
    sourceAnchorId,
    targetAnchorId,
  });
  const polyline = flattenConnectorPath(path, 20);
  const bounds = computeBounds(polyline);
  return bounds;
}

export {
  findNodeAt,
  getNearestEdgeAnchorHit,
  findConnectorEndpointHit,
  findAnchorHit,
  findEdgeAnchorHit,
  pickElementAt,
  resolveConnectorPoint,
  computeConnectorBounds,
};
