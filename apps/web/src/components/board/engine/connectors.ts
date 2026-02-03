import type {
  CanvasConnectorDraft,
  CanvasConnectorElement,
  CanvasConnectorEnd,
  CanvasConnectorEndpointRole,
  CanvasConnectorStyle,
  CanvasPoint,
  CanvasAnchorMap,
  CanvasRect,
} from "./types";
import { resolveConnectorEndpointsWithBounds } from "./connector-resolve";
import { computeConnectorBounds } from "./hit-testing";
import type { ConnectorAxisPreferenceMap } from "../utils/connector-path";

/** Normalize connector endpoint to store only element reference. */
function normalizeConnectorEnd(end: CanvasConnectorEnd): CanvasConnectorEnd {
  return "elementId" in end ? { elementId: end.elementId } : end;
}

/** Build a connector element from a draft request. */
function buildConnectorElement(
  draft: CanvasConnectorDraft,
  anchors: CanvasAnchorMap,
  connectorStyle: CanvasConnectorStyle,
  getNodeBoundsById: (elementId: string) => CanvasRect | undefined,
  generateId: (prefix: string) => string,
  options?: { sourceAxisPreference?: ConnectorAxisPreferenceMap }
): CanvasConnectorElement | null {
  // 逻辑：新连线默认以节点自动锚点保存，移动时动态选择最短路径。
  const normalizedSource = normalizeConnectorEnd(draft.source);
  const normalizedTarget = normalizeConnectorEnd(draft.target);
  const { source: sourcePoint, target: targetPoint, sourceAnchorId, targetAnchorId } =
    resolveConnectorEndpointsWithBounds(
      normalizedSource,
      normalizedTarget,
      anchors,
      getNodeBoundsById,
      { sourceAxisPreference: options?.sourceAxisPreference }
    );
  if (!sourcePoint || !targetPoint) return null;

  const style = draft.style ?? connectorStyle;
  const bounds = computeConnectorBounds(
    sourcePoint,
    targetPoint,
    style,
    sourceAnchorId,
    targetAnchorId
  );

  return {
    id: generateId("connector"),
    kind: "connector",
    type: "connector",
    xywh: [bounds.x, bounds.y, bounds.w, bounds.h],
    source: normalizedSource,
    target: normalizedTarget,
    style,
    color: draft.color,
    dashed: draft.dashed,
    zIndex: 0,
  };
}

/** Compute update payload when dragging a connector endpoint. */
function buildConnectorEndpointUpdate(
  element: CanvasConnectorElement,
  role: CanvasConnectorEndpointRole,
  end: CanvasConnectorEnd,
  anchors: CanvasAnchorMap,
  connectorStyle: CanvasConnectorStyle,
  getNodeBoundsById: (elementId: string) => CanvasRect | undefined,
  options?: { sourceAxisPreference?: ConnectorAxisPreferenceMap }
): { update: Partial<CanvasConnectorElement>; sourcePoint?: CanvasPoint; targetPoint?: CanvasPoint } {
  // 逻辑：端点绑定到节点时不固化锚点，保持最短路径自动选择。
  const normalizedEnd = normalizeConnectorEnd(end);
  const nextSource = role === "source" ? normalizedEnd : element.source;
  const nextTarget = role === "target" ? normalizedEnd : element.target;
  const { source: sourcePoint, target: targetPoint, sourceAnchorId, targetAnchorId } =
    resolveConnectorEndpointsWithBounds(
      nextSource,
      nextTarget,
      anchors,
      getNodeBoundsById,
      { sourceAxisPreference: options?.sourceAxisPreference }
    );
  let nextXYWH: [number, number, number, number] | undefined;
  if (sourcePoint && targetPoint) {
    // 逻辑：端点变化后重新计算包围盒，便于后续命中与布局。
    const style = element.style ?? connectorStyle;
    const bounds = computeConnectorBounds(
      sourcePoint,
      targetPoint,
      style,
      sourceAnchorId,
      targetAnchorId
    );
    nextXYWH = [bounds.x, bounds.y, bounds.w, bounds.h];
  }

  const update: Partial<CanvasConnectorElement> = {
    [role]: normalizedEnd,
    ...(nextXYWH ? { xywh: nextXYWH } : {}),
  };
  return {
    update,
    sourcePoint: sourcePoint ?? undefined,
    targetPoint: targetPoint ?? undefined,
  };
}

/** Resolve connector endpoints for connector previews. */
function resolveConnectorPreview(
  source: CanvasConnectorEnd,
  target: CanvasConnectorEnd,
  anchors: CanvasAnchorMap,
  getNodeBoundsById: (elementId: string) => CanvasRect | undefined
) {
  return resolveConnectorEndpointsWithBounds(source, target, anchors, getNodeBoundsById);
}

export {
  normalizeConnectorEnd,
  buildConnectorElement,
  buildConnectorEndpointUpdate,
  resolveConnectorPreview,
};
