import type {
  CanvasAnchorMap,
  CanvasConnectorEnd,
  CanvasConnectorStyle,
  CanvasPoint,
  CanvasRect,
} from "../CanvasTypes";

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
  target: CanvasPoint
): CanvasConnectorPath {
  switch (style) {
    case "elbow":
      return buildElbowPath(source, target);
    case "curve":
      return buildCurvePath(source, target);
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
    const dist = distanceToSegment(point, polyline[i], polyline[i + 1]);
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
function buildCurvePath(source: CanvasPoint, target: CanvasPoint): CanvasConnectorPath {
  const dx = target[0] - source[0];
  const dy = target[1] - source[1];
  const distance = Math.hypot(dx, dy);
  const offset = Math.min(180, Math.max(60, distance * 0.35));
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const dirX = dx >= 0 ? 1 : -1;
  const dirY = dy >= 0 ? 1 : -1;
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
