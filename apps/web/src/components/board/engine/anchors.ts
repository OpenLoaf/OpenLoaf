import type {
  CanvasAnchor,
  CanvasAnchorMap,
  CanvasElement,
  CanvasNodeElement,
  CanvasPoint,
  CanvasRect,
} from "./types";
import type { NodeRegistry } from "./NodeRegistry";
import { isGroupNodeType } from "./grouping";
/** Resolve anchors for a node element. */
function resolveAnchors(element: CanvasNodeElement, nodes: NodeRegistry): CanvasAnchor[] {
  const [x, y, w, h] = element.xywh;
  const bounds: CanvasRect = { x, y, w, h };
  const definition = nodes.getDefinition(element.type);
  // 逻辑：节点锚点合并自定义锚点与默认四边中心锚点，保证连线锚点稳定。
  const anchorDefs =
    definition?.anchors?.(element.props as never, bounds) ?? [];
  const anchors = anchorDefs.map((anchor, index) => {
    if (Array.isArray(anchor)) {
      return { id: `anchor-${index + 1}`, point: anchor };
    }
    return { id: anchor.id, point: anchor.point };
  });

  const edgeAnchors: CanvasAnchor[] = [
    { id: "top", point: [x + w / 2, y] },
    { id: "right", point: [x + w, y + h / 2] },
    { id: "bottom", point: [x + w / 2, y + h] },
    { id: "left", point: [x, y + h / 2] },
  ];
  if (anchors.length === 0) return edgeAnchors;
  const anchorIds = new Set(anchors.map(anchor => anchor.id));
  edgeAnchors.forEach(anchor => {
    if (!anchorIds.has(anchor.id)) {
      anchors.push(anchor);
    }
  });
  return anchors;
}

/** Build anchor positions for all connectable nodes. */
function buildAnchorMap(elements: CanvasNodeElement[], nodes: NodeRegistry): CanvasAnchorMap {
  const anchorMap: CanvasAnchorMap = {};
  elements.forEach(element => {
    const definition = nodes.getDefinition(element.type);
    const connectable = definition?.capabilities?.connectable ?? "auto";
    if (connectable === "none") return;
    const anchors = resolveAnchors(element, nodes);
    if (anchors.length > 0) {
      anchorMap[element.id] = anchors;
    }
  });
  return anchorMap;
}

/** Apply outline padding to group anchors in world units. */
function applyGroupAnchorPadding(
  anchors: CanvasAnchorMap,
  elements: CanvasElement[],
  padding: number
): CanvasAnchorMap {
  if (padding <= 0) return anchors;
  const groupIds = new Set(
    elements
      .filter((element): element is CanvasNodeElement => element.kind === "node")
      .filter(element => isGroupNodeType(element.type))
      .map(element => element.id)
  );
  if (groupIds.size === 0) return anchors;
  const next: CanvasAnchorMap = { ...anchors };
  groupIds.forEach(groupId => {
    const list = anchors[groupId];
    if (!list || list.length === 0) return;
    // 逻辑：组节点锚点按外扩偏移，保持连线与边框一致。
    next[groupId] = list.map(anchor => {
      const offset = resolveGroupAnchorOffset(anchor.id, padding);
      return {
        ...anchor,
        point: [anchor.point[0] + offset[0], anchor.point[1] + offset[1]],
      };
    });
  });
  return next;
}

/** Resolve the world-space offset for group anchors. */
function resolveGroupAnchorOffset(anchorId: string, padding: number): CanvasPoint {
  switch (anchorId) {
    case "top":
      return [0, -padding];
    case "right":
      return [padding, 0];
    case "bottom":
      return [0, padding];
    case "left":
      return [-padding, 0];
    default:
      return [0, 0];
  }
}

export { resolveAnchors, buildAnchorMap, applyGroupAnchorPadding };
