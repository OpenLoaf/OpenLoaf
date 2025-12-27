import type { CanvasAnchorMap, CanvasConnectorEnd, CanvasPoint, CanvasRect } from "./types";
import { resolveConnectorEndpointsSmart } from "../utils/connector-path";

type NodeBoundsProvider = (id: string) => CanvasRect | undefined;

/** Resolve connector endpoints with dynamic anchor hints. */
function resolveConnectorEndpointsWithBounds(
  source: CanvasConnectorEnd,
  target: CanvasConnectorEnd,
  anchors: CanvasAnchorMap,
  getNodeBounds: NodeBoundsProvider
): {
  source: CanvasPoint | null;
  target: CanvasPoint | null;
  sourceAnchorId?: string;
  targetAnchorId?: string;
} {
  const boundsMap: Record<string, CanvasRect | undefined> = {};
  if ("elementId" in source) {
    const bounds = getNodeBounds(source.elementId);
    if (bounds) boundsMap[source.elementId] = bounds;
  }
  if ("elementId" in target) {
    const bounds = getNodeBounds(target.elementId);
    if (bounds) boundsMap[target.elementId] = bounds;
  }
  const resolved = resolveConnectorEndpointsSmart(source, target, anchors, boundsMap);
  const sourceAnchorId =
    "elementId" in source ? source.anchorId ?? resolved.sourceAnchorId : resolved.sourceAnchorId;
  const targetAnchorId =
    "elementId" in target ? target.anchorId ?? resolved.targetAnchorId : resolved.targetAnchorId;
  return {
    source: resolved.source,
    target: resolved.target,
    sourceAnchorId,
    targetAnchorId,
  };
}

export { resolveConnectorEndpointsWithBounds };
