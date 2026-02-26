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
  CanvasConnectorElement,
  CanvasConnectorEnd,
  CanvasConnectorStyle,
  CanvasNodeElement,
  CanvasPoint,
  CanvasRect,
} from "./types";
import { cloneElements } from "./history-utils";
import { computeElementsBounds } from "./geometry";
import { computeConnectorBounds, resolveConnectorPoint } from "./hit-testing";
import { isGroupNodeType } from "./grouping";

export type CanvasClipboard = {
  /** Copied node elements. */
  nodes: CanvasNodeElement[];
  /** Copied connector elements. */
  connectors: CanvasConnectorElement[];
  /** Bounds of copied nodes. */
  bounds: CanvasRect;
};

export type ClipboardInsertPayload =
  | {
      /** Payload type identifier. */
      kind: "image";
      /** Image file from the clipboard. */
      file: File;
    }
  | {
      /** Payload type identifier. */
      kind: "url";
      /** URL string from the clipboard. */
      url: string;
    };

type PasteOptions = {
  /** Offset applied to pasted elements. */
  offset: number;
  /** Default connector style. */
  connectorStyle: CanvasConnectorStyle;
  /** Provide a fresh id for new elements. */
  generateId: (prefix: string) => string;
  /** Return current anchor map. */
  getAnchorMap: () => Record<string, { id: string; point: CanvasPoint }[]>;
  /** Return node bounds for resolving endpoints. */
  getNodeBoundsById: (elementId: string) => CanvasRect | undefined;
  /** Return node by id for fallback resolve. */
  getNodeById: (elementId: string) => CanvasNodeElement | undefined;
  /** Return next zIndex for ordering. */
  getNextZIndex: () => number;
  /** Timestamp for created nodes. */
  now: number;
};

type ClipboardParser = (event: ClipboardEvent) => ClipboardInsertPayload[] | null;

/** Detect image files from clipboard data. */
const parseImageClipboard: ClipboardParser = event => {
  const items = Array.from(event.clipboardData?.items ?? []);
  const payloads: ClipboardInsertPayload[] = [];
  for (const item of items) {
    if (!item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) {
      payloads.push({ kind: "image", file });
    }
  }
  return payloads.length > 0 ? payloads : null;
};

/** Detect plain URL text from clipboard data. */
const parseUrlClipboard: ClipboardParser = event => {
  const text = event.clipboardData?.getData("text/plain") ?? "";
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/[\r\n]/.test(trimmed)) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return [{ kind: "url", url: trimmed }];
};

/** Resolve external clipboard data into insert payloads. */
export function getClipboardInsertPayload(
  event: ClipboardEvent
): ClipboardInsertPayload[] | null {
  // 逻辑：按顺序尝试解析器，方便后续扩展更多剪贴板类型。
  const parsers: ClipboardParser[] = [parseImageClipboard, parseUrlClipboard];
  for (const parser of parsers) {
    const payloads = parser(event);
    if (payloads && payloads.length > 0) return payloads;
  }
  return null;
}

/** Build a clipboard payload from selected elements. */
function buildClipboardState(
  nodes: CanvasNodeElement[],
  connectors: CanvasConnectorElement[]
): CanvasClipboard {
  const bounds = computeElementsBounds(nodes);
  return {
    nodes: cloneElements(nodes) as CanvasNodeElement[],
    connectors: cloneElements(connectors) as CanvasConnectorElement[],
    bounds,
  };
}

/** Build pasted elements from clipboard data. */
function buildPastedElements(clipboard: CanvasClipboard, options: PasteOptions) {
  const { nodes, connectors } = clipboard;
  const idMap = new Map<string, string>();
  const maxZ = options.getNextZIndex();
  const createdAt = options.now;

  nodes.forEach(node => {
    idMap.set(node.id, options.generateId(node.type));
  });

  const nextNodes: CanvasNodeElement[] = nodes.map((node, index) => {
    const nextId = idMap.get(node.id) ?? options.generateId(node.type);
    const [x, y, w, h] = node.xywh;
    const nextMeta = { ...(node.meta ?? {}) } as Record<string, unknown>;
    const groupId = nextMeta.groupId;
    if (typeof groupId === "string") {
      const mappedGroupId = idMap.get(groupId);
      if (mappedGroupId) {
        nextMeta.groupId = mappedGroupId;
      } else {
        delete nextMeta.groupId;
      }
    }
    nextMeta.createdAt = createdAt;
    let nextProps = node.props as Record<string, unknown>;
    if (isGroupNodeType(node.type)) {
      const childIds = Array.isArray(nextProps.childIds)
        ? (nextProps.childIds as string[])
        : [];
      const mappedChildIds = childIds
        .map(childId => idMap.get(childId))
        .filter((childId): childId is string => Boolean(childId));
      nextProps = { ...nextProps, childIds: mappedChildIds };
    }
    return {
      ...node,
      id: nextId,
      xywh: [x + options.offset, y + options.offset, w, h],
      zIndex: maxZ + index,
      meta: Object.keys(nextMeta).length > 0 ? nextMeta : undefined,
      props: nextProps,
    };
  });

  const nextConnectors: CanvasConnectorElement[] = connectors.map(connector => {
    const nextId = options.generateId("connector");
    const nextSource: CanvasConnectorEnd =
      "elementId" in connector.source
        ? {
            ...connector.source,
            elementId: idMap.get(connector.source.elementId) ?? connector.source.elementId,
          }
        : {
            point: [
              connector.source.point[0] + options.offset,
              connector.source.point[1] + options.offset,
            ] as CanvasPoint,
          };
    const nextTarget: CanvasConnectorEnd =
      "elementId" in connector.target
        ? {
            ...connector.target,
            elementId: idMap.get(connector.target.elementId) ?? connector.target.elementId,
          }
        : {
            point: [
              connector.target.point[0] + options.offset,
              connector.target.point[1] + options.offset,
            ] as CanvasPoint,
          };

    const anchors = options.getAnchorMap();
    const sourcePoint = resolveConnectorPoint(
      nextSource,
      anchors,
      options.getNodeById
    );
    const targetPoint = resolveConnectorPoint(
      nextTarget,
      anchors,
      options.getNodeById
    );
    let nextXYWH = connector.xywh;
    if (sourcePoint && targetPoint) {
      const bounds = computeConnectorBounds(
        sourcePoint,
        targetPoint,
        connector.style ?? options.connectorStyle,
        "elementId" in nextSource ? nextSource.anchorId : undefined,
        "elementId" in nextTarget ? nextTarget.anchorId : undefined
      );
      nextXYWH = [bounds.x, bounds.y, bounds.w, bounds.h];
    }

    return {
      ...connector,
      id: nextId,
      source: nextSource,
      target: nextTarget,
      xywh: nextXYWH,
      zIndex: 0,
    };
  });

  const selectionIds = nextNodes.map(node => node.id);

  return { nextNodes, nextConnectors, selectionIds };
}

export { buildClipboardState, buildPastedElements };
