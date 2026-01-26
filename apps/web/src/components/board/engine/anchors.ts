import type { CanvasAnchor, CanvasAnchorMap, CanvasNodeElement, CanvasRect } from "./types";
import type { NodeRegistry } from "./NodeRegistry";
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

export { resolveAnchors, buildAnchorMap };
