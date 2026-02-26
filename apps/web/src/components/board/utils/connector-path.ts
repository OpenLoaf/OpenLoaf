/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type {
  CanvasAnchorMap,
  CanvasConnectorElement,
  CanvasConnectorEnd,
  CanvasConnectorStyle,
  CanvasPoint,
  CanvasRect,
} from "../engine/types";

export type CanvasConnectorPath =
  | {
      /** Polyline path definition. */
      kind: "polyline";
      /** Points for the polyline path. */
      points: CanvasPoint[];
    }
  | {
      /** Bezier curve path definition. */
      kind: "bezier";
      /** Control points for the cubic bezier path. */
      points: [CanvasPoint, CanvasPoint, CanvasPoint, CanvasPoint];
  };

export type ConnectorAxisPreference = {
  axis: "horizontal" | "vertical";
  direction: "left" | "right" | "top" | "bottom";
};

export type ConnectorAxisPreferenceMap = Record<string, ConnectorAxisPreference>;

type ResolveConnectorOptions = {
  /** Optional axis preference map keyed by source element id. */
  sourceAxisPreference?: ConnectorAxisPreferenceMap;
};

/** Resolve a connector endpoint to a world point. */
export function resolveConnectorEndpoint(
  end: CanvasConnectorEnd,
  anchors: CanvasAnchorMap,
  hint?: CanvasPoint | null
): CanvasPoint | null {
  if ("point" in end) return end.point;
  const anchorList = anchors[end.elementId];
  if (!anchorList || anchorList.length === 0) return null;
  if (!end.anchorId) {
    if (!hint) return anchorList[0]?.point ?? null;
    return pickClosestAnchor(anchorList, hint);
  }
  return anchorList.find(anchor => anchor.id === end.anchorId)?.point ?? null;
}

/** Resolve connector endpoints with dynamic anchor selection. */
export function resolveConnectorEndpointsSmart(
  source: CanvasConnectorEnd,
  target: CanvasConnectorEnd,
  anchors: CanvasAnchorMap,
  bounds: Record<string, CanvasRect | undefined>,
  options?: ResolveConnectorOptions
): {
  source: CanvasPoint | null;
  target: CanvasPoint | null;
  sourceAnchorId?: string;
  targetAnchorId?: string;
} {
  const sourceHint = resolveHint(target, bounds);
  const targetHint = resolveHint(source, bounds);
  const sourceAuto = isAutoAnchor(source);
  const targetAuto = isAutoAnchor(target);
  const sourceAnchorId = "elementId" in source ? source.anchorId : undefined;
  const targetAnchorId = "elementId" in target ? target.anchorId : undefined;
  const sourceList = "elementId" in source ? anchors[source.elementId] ?? [] : [];
  const targetList = "elementId" in target ? anchors[target.elementId] ?? [] : [];

  if (!sourceAuto && targetAuto && sourceAnchorId) {
    const requiredTargetId = oppositeAnchorId(sourceAnchorId);
    if (requiredTargetId) {
      const targetAnchor = targetList.find(anchor => anchor.id === requiredTargetId);
      if (targetAnchor) {
        return {
          source: resolveConnectorEndpoint(source, anchors, sourceHint),
          target: targetAnchor.point,
          sourceAnchorId,
          targetAnchorId: requiredTargetId,
        };
      }
    }
  }

  if (sourceAuto && !targetAuto && targetAnchorId) {
    const requiredSourceId = oppositeAnchorId(targetAnchorId);
    if (requiredSourceId) {
      const sourceAnchor = sourceList.find(anchor => anchor.id === requiredSourceId);
      if (sourceAnchor) {
        return {
          source: sourceAnchor.point,
          target: resolveConnectorEndpoint(target, anchors, targetHint),
          sourceAnchorId: requiredSourceId,
          targetAnchorId,
        };
      }
    }
  }

  if (sourceAuto && targetAuto) {
    if ("elementId" in source && options?.sourceAxisPreference) {
      const preference = options.sourceAxisPreference[source.elementId];
      if (preference) {
        const forced = pickForcedAnchorPair(preference, sourceList, targetList);
        if (forced) {
          return {
            source: forced.source,
            target: forced.target,
            sourceAnchorId: forced.sourceId,
            targetAnchorId: forced.targetId,
          };
        }
      }
    }
    const pair = pickAnchorPair(
      sourceList,
      targetList,
      bounds[source.elementId],
      bounds[target.elementId]
    );
    if (pair) {
      const baseResult = {
        source: pair.source,
        target: pair.target,
        sourceAnchorId: pair.sourceId,
        targetAnchorId: pair.targetId,
      };
      return baseResult;
    }
  }

  const result = {
    source: resolveConnectorEndpoint(source, anchors, sourceHint),
    target: resolveConnectorEndpoint(target, anchors, targetHint),
    sourceAnchorId,
    targetAnchorId,
  };
  return result;
}

/** Build an axis preference map for sources with uniform target direction. */
export function buildSourceAxisPreferenceMap(
  connectors: CanvasConnectorElement[],
  getNodeBoundsById: (elementId: string) => CanvasRect | undefined
): ConnectorAxisPreferenceMap {
  const buckets = new Map<
    string,
    {
      sourceBounds: CanvasRect;
      targets: CanvasRect[];
    }
  >();

  connectors.forEach(connector => {
    if (!("elementId" in connector.source)) return;
    if (!("elementId" in connector.target)) return;
    const sourceId = connector.source.elementId;
    const targetId = connector.target.elementId;
    if (!sourceId || !targetId) return;
    const sourceBounds = getNodeBoundsById(sourceId);
    const targetBounds = getNodeBoundsById(targetId);
    if (!sourceBounds || !targetBounds) return;
    const entry = buckets.get(sourceId);
    if (entry) {
      entry.targets.push(targetBounds);
      return;
    }
    buckets.set(sourceId, {
      sourceBounds,
      targets: [targetBounds],
    });
  });

  const preferences: ConnectorAxisPreferenceMap = {};
  buckets.forEach((entry, sourceId) => {
    const { sourceBounds, targets } = entry;
    if (targets.length === 0) return;
    const eps = 1e-3;
    let allRight = true;
    let allLeft = true;
    let allTop = true;
    let allBottom = true;
    targets.forEach(target => {
      // 逻辑：使用包围盒判断是否完全位于某一侧，避免宽度差导致误判。
      const isRight = target.x >= sourceBounds.x + sourceBounds.w - eps;
      const isLeft = target.x + target.w <= sourceBounds.x + eps;
      const isBottom = target.y >= sourceBounds.y + sourceBounds.h - eps;
      const isTop = target.y + target.h <= sourceBounds.y + eps;
      if (!isRight) allRight = false;
      if (!isLeft) allLeft = false;
      if (!isBottom) allBottom = false;
      if (!isTop) allTop = false;
    });

    if (allRight) {
      preferences[sourceId] = { axis: "horizontal", direction: "right" };
      return;
    }
    if (allLeft) {
      preferences[sourceId] = { axis: "horizontal", direction: "left" };
      return;
    }
    if (allTop) {
      preferences[sourceId] = { axis: "vertical", direction: "top" };
      return;
    }
    if (allBottom) {
      preferences[sourceId] = { axis: "vertical", direction: "bottom" };
    }
  });

  return preferences;
}

function isAutoAnchor(end: CanvasConnectorEnd): end is { elementId: string } {
  return "elementId" in end && !end.anchorId;
}

function resolveHint(
  end: CanvasConnectorEnd,
  bounds: Record<string, CanvasRect | undefined>
): CanvasPoint | null {
  if ("point" in end) return end.point;
  const rect = bounds[end.elementId];
  if (!rect) return null;
  return [rect.x + rect.w / 2, rect.y + rect.h / 2];
}

function pickAnchorPair(
  sourceList: { id: string; point: CanvasPoint }[],
  targetList: { id: string; point: CanvasPoint }[],
  sourceRect?: CanvasRect,
  targetRect?: CanvasRect
): { source: CanvasPoint; target: CanvasPoint; sourceId: string; targetId: string } | null {
  if (sourceList.length === 0 || targetList.length === 0) return null;
  let best:
    | { source: CanvasPoint; target: CanvasPoint; sourceId: string; targetId: string }
    | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  const sourceCenter = resolveCenter(sourceList, sourceRect);
  const targetCenter = resolveCenter(targetList, targetRect);

  sourceList.forEach(source => {
    targetList.forEach(target => {
      if (!isCompatibleAnchorPair(source.id, target.id)) return;
      const dx = target.point[0] - source.point[0];
      const dy = target.point[1] - source.point[1];
      const dist = Math.hypot(dx, dy);
      const weight = Math.max(80, dist * 0.25);
      // 逻辑：优先选择朝向对方的锚点组合，减少违和折线。
      const cost =
        dist +
        facingPenalty(source.id, source.point, target.point, weight) +
        facingPenalty(target.id, target.point, source.point, weight) +
        edgeAnglePenalty(source.id, source.point, target.point, weight * 1.4) +
        edgeAnglePenalty(target.id, target.point, source.point, weight * 1.4) +
        centerBiasPenalty(source.id, sourceCenter, targetCenter, weight * 0.35) +
        centerBiasPenalty(target.id, targetCenter, sourceCenter, weight * 0.35);
      if (cost < bestCost) {
        bestCost = cost;
        best = {
          source: source.point,
          target: target.point,
          sourceId: source.id,
          targetId: target.id,
        };
      }
    });
  });

  return best;
}

/** Apply avoidance for auto anchor selection. */

function resolveCenter(
  anchors: { id: string; point: CanvasPoint }[],
  rect?: CanvasRect
): CanvasPoint {
  if (rect) return [rect.x + rect.w / 2, rect.y + rect.h / 2];
  let sumX = 0;
  let sumY = 0;
  anchors.forEach(anchor => {
    sumX += anchor.point[0];
    sumY += anchor.point[1];
  });
  const count = Math.max(1, anchors.length);
  return [sumX / count, sumY / count];
}

/** Pick an anchor pair based on a forced axis preference. */
function pickForcedAnchorPair(
  preference: ConnectorAxisPreference,
  sourceList: { id: string; point: CanvasPoint }[],
  targetList: { id: string; point: CanvasPoint }[]
): { source: CanvasPoint; target: CanvasPoint; sourceId: string; targetId: string } | null {
  let sourceId = "";
  let targetId = "";
  if (preference.axis === "horizontal") {
    sourceId = preference.direction === "right" ? "right" : "left";
    targetId = preference.direction === "right" ? "left" : "right";
  } else {
    sourceId = preference.direction === "bottom" ? "bottom" : "top";
    targetId = preference.direction === "bottom" ? "top" : "bottom";
  }
  const sourceAnchor = sourceList.find(anchor => anchor.id === sourceId);
  const targetAnchor = targetList.find(anchor => anchor.id === targetId);
  if (!sourceAnchor || !targetAnchor) return null;
  return {
    source: sourceAnchor.point,
    target: targetAnchor.point,
    sourceId,
    targetId,
  };
}

function facingPenalty(
  anchorId: string,
  from: CanvasPoint,
  to: CanvasPoint,
  weight: number
): number {
  const dir = anchorDirection(anchorId);
  if (!dir) return 0;
  const vx = to[0] - from[0];
  const vy = to[1] - from[1];
  const len = Math.hypot(vx, vy);
  if (len <= 0.001) return 0;
  const nx = vx / len;
  const ny = vy / len;
  const dot = dir[0] * nx + dir[1] * ny;
  const penalty = Math.max(0, 0.2 - dot);
  return penalty * weight;
}

function centerBiasPenalty(
  anchorId: string,
  fromCenter: CanvasPoint,
  toCenter: CanvasPoint,
  weight: number
): number {
  const dir = anchorDirection(anchorId);
  if (!dir) return 0;
  const vx = toCenter[0] - fromCenter[0];
  const vy = toCenter[1] - fromCenter[1];
  const len = Math.hypot(vx, vy);
  if (len <= 0.001) return 0;
  const nx = vx / len;
  const ny = vy / len;
  const dot = dir[0] * nx + dir[1] * ny;
  const penalty = Math.max(0, 0.35 - dot);
  return penalty * weight;
}

function edgeAnglePenalty(
  anchorId: string,
  from: CanvasPoint,
  to: CanvasPoint,
  weight: number
): number {
  const dir = anchorDirection(anchorId);
  if (!dir) return 0;
  const vx = to[0] - from[0];
  const vy = to[1] - from[1];
  const len = Math.hypot(vx, vy);
  if (len <= 0.001) return 0;
  const dot = (dir[0] * vx + dir[1] * vy) / len;
  const absDot = Math.abs(dot);
  const minDot = Math.cos(Math.PI / 4);
  // 逻辑：当连线方向与边法线夹角过大（接近贴边）时降低优先级。
  if (absDot >= minDot) return 0;
  const penalty = (minDot - absDot) / minDot;
  return penalty * weight;
}

function anchorDirection(anchorId: string): CanvasPoint | null {
  switch (anchorId) {
    case "top":
      return [0, -1];
    case "right":
      return [1, 0];
    case "bottom":
      return [0, 1];
    case "left":
      return [-1, 0];
    default:
      return null;
  }
}

function oppositeAnchorId(anchorId: string): string | null {
  switch (anchorId) {
    case "left":
      return "right";
    case "right":
      return "left";
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    default:
      return null;
  }
}

function isCompatibleAnchorPair(sourceId: string, targetId: string): boolean {
  const sourceOpposite = oppositeAnchorId(sourceId);
  const targetOpposite = oppositeAnchorId(targetId);
  if (!sourceOpposite && !targetOpposite) return true;
  if (sourceOpposite && targetId !== sourceOpposite) return false;
  if (targetOpposite && sourceId !== targetOpposite) return false;
  return true;
}

/** Pick the closest anchor point relative to the hint. */
function pickClosestAnchor(
  anchorList: { id: string; point: CanvasPoint }[],
  hint: CanvasPoint
): CanvasPoint {
  let closest = anchorList[0]?.point ?? null;
  let closestDistance = Number.POSITIVE_INFINITY;
  anchorList.forEach(anchor => {
    const distance = Math.hypot(anchor.point[0] - hint[0], anchor.point[1] - hint[1]);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = anchor.point;
    }
  });
  return closest ?? hint;
}


/** Build a connector path based on style. */
export function buildConnectorPath(
  style: CanvasConnectorStyle,
  source: CanvasPoint,
  target: CanvasPoint,
  options?: { sourceAnchorId?: string; targetAnchorId?: string }
): CanvasConnectorPath {
  switch (style) {
    case "elbow":
      return buildElbowPath(source, target);
    case "curve":
      return buildCurvePath(source, target, options);
    case "hand":
      return buildHandPath(source, target);
    case "fly":
      return buildFlyPath(source, target);
    case "straight":
    default:
      return { kind: "polyline", points: [source, target] };
  }
}

/** Convert a connector path into a polyline for hit testing. */
export function flattenConnectorPath(
  path: CanvasConnectorPath,
  segments = 16
): CanvasPoint[] {
  if (path.kind === "polyline") return path.points;
  const [p0, p1, p2, p3] = path.points;
  const points: CanvasPoint[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    points.push(cubicBezierPoint(p0, p1, p2, p3, t));
  }
  return points;
}

/** Compute the minimum distance from a point to a polyline. */
export function distanceToPolyline(point: CanvasPoint, polyline: CanvasPoint[]): number {
  if (polyline.length < 2) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    const start = polyline[i];
    const end = polyline[i + 1];
    if (!start || !end) continue;
    const dist = distanceToSegment(point, start, end);
    if (dist < min) min = dist;
  }
  return min;
}

/** Compute a bounding rect from a list of points. */
export function computeBounds(points: CanvasPoint[]): CanvasRect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  points.forEach(point => {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  });
  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}

/** Build an elbow connector path. */
function buildElbowPath(source: CanvasPoint, target: CanvasPoint): CanvasConnectorPath {
  const dx = target[0] - source[0];
  const dy = target[1] - source[1];
  const horizontalFirst = Math.abs(dx) >= Math.abs(dy);
  if (horizontalFirst) {
    const midX = source[0] + dx / 2;
    return {
      kind: "polyline",
      points: [source, [midX, source[1]], [midX, target[1]], target],
    };
  }
  const midY = source[1] + dy / 2;
  return {
    kind: "polyline",
    points: [source, [source[0], midY], [target[0], midY], target],
  };
}

/** Build a curved connector path. */
function buildCurvePath(
  source: CanvasPoint,
  target: CanvasPoint,
  options?: { sourceAnchorId?: string; targetAnchorId?: string }
): CanvasConnectorPath {
  const dx = target[0] - source[0];
  const dy = target[1] - source[1];
  const distance = Math.hypot(dx, dy);
  const offset = Math.min(180, Math.max(60, distance * 0.35));
  const horizontal =
    isHorizontalAnchor(options?.sourceAnchorId) ||
    isHorizontalAnchor(options?.targetAnchorId) ||
    (!isVerticalAnchor(options?.sourceAnchorId) &&
      !isVerticalAnchor(options?.targetAnchorId) &&
      Math.abs(dx) >= Math.abs(dy));
  const dirX = dx >= 0 ? 1 : -1;
  const dirY = dy >= 0 ? 1 : -1;
  const ratio = Math.abs(dy) > 0.001 ? Math.abs(dx) / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const sourceHorizontal = isHorizontalAnchor(options?.sourceAnchorId);
  const targetHorizontal = isHorizontalAnchor(options?.targetAnchorId);
  const sourceVertical = isVerticalAnchor(options?.sourceAnchorId);
  const targetVertical = isVerticalAnchor(options?.targetAnchorId);
  const horizontalPair = sourceHorizontal && targetHorizontal;
  const verticalPair = sourceVertical && targetVertical;
  const mixedPair = (sourceHorizontal && targetVertical) || (sourceVertical && targetHorizontal);
  const diagonal = ratio >= 0.6 && ratio <= 1.6 && !horizontalPair && !verticalPair;
  const useParabola = mixedPair || diagonal;
  if (useParabola && distance > 1) {
    const nx = dy / distance;
    const ny = -dx / distance;
    const bulge = Math.min(140, Math.max(40, distance * 0.25));
    const p1: CanvasPoint = [
      source[0] + dx * 0.33 + nx * bulge,
      source[1] + dy * 0.33 + ny * bulge,
    ];
    const p2: CanvasPoint = [
      source[0] + dx * 0.66 + nx * bulge,
      source[1] + dy * 0.66 + ny * bulge,
    ];
    return {
      kind: "bezier",
      points: [source, p1, p2, target],
    };
  }
  const control1: CanvasPoint = horizontal
    ? [source[0] + dirX * offset, source[1]]
    : [source[0], source[1] + dirY * offset];
  const control2: CanvasPoint = horizontal
    ? [target[0] - dirX * offset, target[1]]
    : [target[0], target[1] - dirY * offset];
  return {
    kind: "bezier",
    points: [source, control1, control2, target],
  };
}

function isHorizontalAnchor(anchorId?: string): boolean {
  return anchorId === "left" || anchorId === "right";
}

function isVerticalAnchor(anchorId?: string): boolean {
  return anchorId === "top" || anchorId === "bottom";
}

/** Build a hand-drawn connector path. */
function buildHandPath(source: CanvasPoint, target: CanvasPoint): CanvasConnectorPath {
  const dx = target[0] - source[0];
  const dy = target[1] - source[1];
  const distance = Math.hypot(dx, dy);
  const segments = Math.max(6, Math.min(14, Math.round(distance / 120) + 4));
  const amplitude = Math.min(18, Math.max(4, distance * 0.05));
  const length = distance || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const seed =
    source[0] * 12.9898 +
    source[1] * 78.233 +
    target[0] * 37.719 +
    target[1] * 11.113;
  const points: CanvasPoint[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const baseX = source[0] + dx * t;
    const baseY = source[1] + dy * t;
    const noise = seededRandom(seed + i * 17.17) * 2 - 1;
    const taper = Math.sin(Math.PI * t);
    const offset = noise * amplitude * taper;
    points.push([baseX + nx * offset, baseY + ny * offset]);
  }
  return { kind: "polyline", points };
}

/** Build a fly-track connector path. */
function buildFlyPath(source: CanvasPoint, target: CanvasPoint): CanvasConnectorPath {
  const dx = target[0] - source[0];
  const dy = target[1] - source[1];
  const distance = Math.hypot(dx, dy);
  const segments = Math.max(10, Math.min(20, Math.round(distance / 80) + 6));
  const amplitude = Math.min(28, Math.max(8, distance * 0.12));
  const length = distance || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const waves = Math.max(2, Math.round(distance / 160));
  const seed =
    source[0] * 9.13 + source[1] * 4.77 + target[0] * 6.31 + target[1] * 8.37;
  const phase = seededRandom(seed) * Math.PI;
  const points: CanvasPoint[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const baseX = source[0] + dx * t;
    const baseY = source[1] + dy * t;
    const wave = Math.sin(t * Math.PI * waves + phase) * amplitude;
    const wobble = Math.sin(t * Math.PI * waves * 1.6 + phase) * amplitude * 0.35;
    const offset = wave + wobble;
    points.push([baseX + nx * offset, baseY + ny * offset]);
  }
  return { kind: "polyline", points };
}

/** Compute a point on a cubic bezier curve. */
function cubicBezierPoint(
  p0: CanvasPoint,
  p1: CanvasPoint,
  p2: CanvasPoint,
  p3: CanvasPoint,
  t: number
): CanvasPoint {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  const x =
    uuu * p0[0] +
    3 * uu * t * p1[0] +
    3 * u * tt * p2[0] +
    ttt * p3[0];
  const y =
    uuu * p0[1] +
    3 * uu * t * p1[1] +
    3 * u * tt * p2[1] +
    ttt * p3[1];
  return [x, y];
}

/** Compute the minimum distance between a point and a segment. */
function distanceToSegment(point: CanvasPoint, a: CanvasPoint, b: CanvasPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) {
    return Math.hypot(point[0] - a[0], point[1] - a[1]);
  }
  const t =
    ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const clamped = Math.min(1, Math.max(0, t));
  const px = a[0] + clamped * dx;
  const py = a[1] + clamped * dy;
  return Math.hypot(point[0] - px, point[1] - py);
}

/** Generate a deterministic random value based on a seed. */
function seededRandom(seed: number): number {
  const value = Math.sin(seed) * 43758.5453123;
  return value - Math.floor(value);
}
