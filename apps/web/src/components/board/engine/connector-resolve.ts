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
  CanvasConnectorEnd,
  CanvasPoint,
  CanvasRect,
} from "./types";
import {
  type ConnectorAxisPreferenceMap,
  resolveConnectorEndpointsSmart,
} from "../utils/connector-path";

type NodeBoundsProvider = (id: string) => CanvasRect | undefined;

/** Resolve connector endpoints with dynamic anchor hints. */
function resolveConnectorEndpointsWithBounds(
  source: CanvasConnectorEnd,
  target: CanvasConnectorEnd,
  anchors: CanvasAnchorMap,
  getNodeBounds: NodeBoundsProvider,
  options?: { sourceAxisPreference?: ConnectorAxisPreferenceMap }
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
  const resolved = resolveConnectorEndpointsSmart(source, target, anchors, boundsMap, options);
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
