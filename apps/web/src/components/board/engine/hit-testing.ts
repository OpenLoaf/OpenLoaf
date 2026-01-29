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
  SELECTED_ANCHOR_EDGE_SIZE,
  SELECTED_ANCHOR_GAP,
  SELECTED_ANCHOR_SIDE_SIZE,
  STROKE_HIT_RADIUS,
} from "./constants";
import { LARGE_ANCHOR_NODE_TYPES } from "./anchorTypes";
import type { NodeRegistry } from "./NodeRegistry";
import { getGroupOutlinePadding, getNodeGroupId, isGroupNodeType } from "./grouping";
import { resolveConnectorEndpointsWithBounds } from "./connector-resolve";
import {
  buildConnectorPath,
  buildSourceAxisPreferenceMap,
  computeBounds,
  distanceToPolyline,
  flattenConnectorPath,
  resolveConnectorEndpoint,
} from "../utils/connector-path";

/** Find the top-most node element at the given world point. */
function findNodeAt(
  point: CanvasPoint,
  nodes: CanvasNodeElement[],
  zoom: number
): CanvasNodeElement | null {
  const groupPadding = getGroupOutlinePadding(zoom);
  // 反向遍历保证命中最上层元素。
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const element = nodes[i];
    if (!element) continue;
    const [x, y, w, h] = element.xywh;
    const padding = isGroupNodeType(element.type) ? groupPadding : 0;
    const within =
      point[0] >= x - padding &&
      point[0] <= x + w + padding &&
      point[1] >= y - padding &&
      point[1] <= y + h + padding;
    if (within) return element;
  }
  return null;
}

/** Resolve the nearest edge-center anchor for a node. */
function getNearestEdgeAnchorHit(
  element: CanvasNodeElement,
  nodes: NodeRegistry,
  hint: CanvasPoint,
  zoom: number
): CanvasAnchorHit | null {
  const definition = nodes.getDefinition(element.type);
  const connectable = definition?.capabilities?.connectable ?? "auto";
  if (connectable === "none") return null;
  if (connectable !== "auto" && connectable !== "anchors") return null;
  const [x, y, w, h] = element.xywh;
  const padding = isGroupNodeType(element.type)
    ? getGroupOutlinePadding(zoom)
    : 0;
  const edges = [
    { id: "top", point: [x + w / 2, y - padding] as CanvasPoint },
    { id: "right", point: [x + w + padding, y + h / 2] as CanvasPoint },
    { id: "bottom", point: [x + w / 2, y + h + padding] as CanvasPoint },
    { id: "left", point: [x - padding, y + h / 2] as CanvasPoint },
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
  // 逻辑：连线方向统一策略需在命中阶段保持一致。
  const sourceAxisPreference = buildSourceAxisPreferenceMap(
    filtered,
    getNodeBoundsById
  );

  filtered.forEach(connector => {
    const { source, target } = resolveConnectorEndpointsWithBounds(
      connector.source,
      connector.target,
      anchors,
      getNodeBoundsById,
      { sourceAxisPreference }
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
  exclude?: { elementId: string; anchorId: string },
  selectedIds: string[] = []
): CanvasAnchorHit | null {
  // 逻辑：边缘命中半径随缩放换算，保证交互手感稳定。
  const hitRadius = EDGE_ANCHOR_HIT_RADIUS / Math.max(zoom, MIN_ZOOM);
  const centerRange = EDGE_ANCHOR_CENTER_RANGE / Math.max(zoom, MIN_ZOOM);
  const selectedIdSet = selectedIds.length > 0 ? new Set(selectedIds) : null;
  const zoomSafe = Math.max(zoom, MIN_ZOOM);
  const selectedEdgeRadius = (SELECTED_ANCHOR_EDGE_SIZE / 2) / zoomSafe;
  const selectedSideRadius = (SELECTED_ANCHOR_SIDE_SIZE / 2) / zoomSafe;
  const selectedEdgeOffset = (SELECTED_ANCHOR_EDGE_SIZE / 2 + SELECTED_ANCHOR_GAP) / zoomSafe;
  const selectedSideOffset = (SELECTED_ANCHOR_SIDE_SIZE / 2 + SELECTED_ANCHOR_GAP) / zoomSafe;

  const groupPadding = getGroupOutlinePadding(zoom);
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const element = elements[i];
    if (!element) continue;
    const definition = nodes.getDefinition(element.type);
    const connectable = definition?.capabilities?.connectable ?? "auto";
    if (connectable === "auto" || connectable === "anchors") {
      const isLargeAnchorNode = LARGE_ANCHOR_NODE_TYPES.has(element.type);
      if (!isLargeAnchorNode || !selectedIdSet?.has(element.id)) {
        // 逻辑：仅允许大锚点节点参与边缘命中，隐藏小锚点交互。
        continue;
      }
      const isActiveLargeAnchor = true;
      // 逻辑：选中图片节点使用偏移锚点，命中区域跟随视觉锚点位置。
      const [x, y, w, h] = element.xywh;
      const padding = isGroupNodeType(element.type) ? groupPadding : 0;
      const sideOffset = isActiveLargeAnchor ? selectedSideOffset : 0;
      const edgeOffset = isActiveLargeAnchor ? selectedEdgeOffset : 0;
      const sideHitRadius = isActiveLargeAnchor
        ? Math.max(hitRadius, selectedSideRadius)
        : hitRadius;
      const edgeHitRadius = isActiveLargeAnchor
        ? Math.max(hitRadius, selectedEdgeRadius)
        : hitRadius;
      const leftX = x - padding - sideOffset;
      const rightX = x + w + padding + sideOffset;
      const topY = y - padding - edgeOffset;
      const bottomY = y + h + padding + edgeOffset;
      const withinX =
        point[0] >= leftX - sideHitRadius && point[0] <= rightX + sideHitRadius;
      const withinY =
        point[1] >= topY - edgeHitRadius && point[1] <= bottomY + edgeHitRadius;
      if (!withinX || !withinY) continue;

      const edgeHits: Array<{ id: string; distance: number; point: CanvasPoint }> = [];
      const centerY = y + h / 2;
      const centerX = x + w / 2;
      if (
        point[0] >= leftX - sideHitRadius &&
        point[0] <= leftX + sideHitRadius &&
        Math.abs(point[1] - centerY) <= centerRange
      ) {
        edgeHits.push({
          id: "left",
          distance: Math.abs(point[0] - leftX),
          point: [leftX, centerY],
        });
      }
      if (
        point[0] >= rightX - sideHitRadius &&
        point[0] <= rightX + sideHitRadius &&
        Math.abs(point[1] - centerY) <= centerRange
      ) {
        edgeHits.push({
          id: "right",
          distance: Math.abs(point[0] - rightX),
          point: [rightX, centerY],
        });
      }
      // 逻辑：选中图片节点仅保留左右锚点，禁用上下锚点命中。
      if (!isActiveLargeAnchor) {
        if (
          point[1] >= topY - edgeHitRadius &&
          point[1] <= topY + edgeHitRadius &&
          Math.abs(point[0] - centerX) <= centerRange
        ) {
          edgeHits.push({
            id: "top",
            distance: Math.abs(point[1] - topY),
            point: [centerX, topY],
          });
        }
        if (
          point[1] >= bottomY - edgeHitRadius &&
          point[1] <= bottomY + edgeHitRadius &&
          Math.abs(point[0] - centerX) <= centerRange
        ) {
          edgeHits.push({
            id: "bottom",
            distance: Math.abs(point[1] - bottomY),
            point: [centerX, bottomY],
          });
        }
      }

      if (edgeHits.length === 0) continue;
      edgeHits.sort((a, b) => a.distance - b.distance);
      const hit = edgeHits[0];
      if (!hit) continue;
      const maxRadius = hit.id === "left" || hit.id === "right" ? sideHitRadius : edgeHitRadius;
      if (hit.distance > maxRadius) continue;
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
  const connectorElements = elements.filter(
    (element): element is CanvasConnectorElement => element.kind === "connector"
  );
  // 逻辑：统一连线方向后，命中计算需同步使用同一偏好。
  const sourceAxisPreference = buildSourceAxisPreferenceMap(
    connectorElements,
    getNodeBoundsById
  );
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
      if (isGroupNodeType(element.type)) {
        const [x, y, w, h] = element.xywh;
        const padding = getGroupOutlinePadding(zoom);
        const within =
          point[0] >= x - padding &&
          point[0] <= x + w + padding &&
          point[1] >= y - padding &&
          point[1] <= y + h + padding;
        if (within) {
          const childHit = findGroupChildAt(point, elements, i - 1, element.id);
          if (childHit) {
            // 逻辑：命中组内子节点时优先返回子节点，避免组选中遮挡预览。
            return childHit;
          }
          return element;
        }
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
          getNodeBoundsById,
          { sourceAxisPreference }
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

/** Find the top-most child node inside a group at the given point. */
function findGroupChildAt(
  point: CanvasPoint,
  elements: CanvasElement[],
  startIndex: number,
  groupId: string
): CanvasNodeElement | null {
  for (let i = startIndex; i >= 0; i -= 1) {
    const element = elements[i];
    if (!element || element.kind !== "node") continue;
    if (getNodeGroupId(element) !== groupId) continue;
    const [x, y, w, h] = element.xywh;
    const within =
      point[0] >= x && point[0] <= x + w && point[1] >= y && point[1] <= y + h;
    if (within) return element;
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
  style: CanvasConnectorStyle,
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
