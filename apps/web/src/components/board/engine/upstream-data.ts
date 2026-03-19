/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { CanvasDoc } from "./CanvasDoc";
import type {
  CanvasConnectorElement,
  CanvasElement,
  CanvasNodeElement,
} from "./types";
import type { TextNodeValue } from "../nodes/TextNode";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Upstream data resolved from connected nodes. */
export type UpstreamData = {
  /** Text contents extracted from upstream text nodes. */
  textList: string[];
  /** Image sources extracted from upstream image nodes. */
  imageList: string[];
};

/** Empty upstream data constant to avoid unnecessary allocations. */
const EMPTY_UPSTREAM_DATA: UpstreamData = { textList: [], imageList: [] };

// ---------------------------------------------------------------------------
// Plate.js Value serialization
// ---------------------------------------------------------------------------

/**
 * Recursively extract plain text from a Plate.js Value (Slate-compatible).
 *
 * A Plate.js Value is an array of element nodes. Each element may have
 * `children` (nested elements or text leaves). Text leaves have a `text`
 * property with the actual string content.
 *
 * We walk the tree depth-first and concatenate all leaf text. Block-level
 * elements (those with children) are separated by newlines.
 */
function serializePlateValueToText(value: unknown): string {
  if (!Array.isArray(value)) return "";

  const parts: string[] = [];

  for (const node of value) {
    if (typeof node !== "object" || node === null) continue;

    const record = node as Record<string, unknown>;

    // Text leaf node — has `text` property and no `children`.
    if (typeof record.text === "string") {
      parts.push(record.text);
      continue;
    }

    // Element node — recurse into children.
    if (Array.isArray(record.children)) {
      const childText = serializePlateValueToText(record.children);
      if (childText) {
        parts.push(childText);
      }
    }
  }

  return parts.join("\n");
}

/**
 * Serialize a TextNodeValue (string | Plate.js Value) to plain text.
 */
export function serializeTextNodeValue(value: TextNodeValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return serializePlateValueToText(value);
}

// ---------------------------------------------------------------------------
// Connector filtering
// ---------------------------------------------------------------------------

/** Check if an element is a connector element. */
function isConnector(el: CanvasElement): el is CanvasConnectorElement {
  return el.kind === "connector";
}

/**
 * Find all connectors whose target points to the given node id.
 *
 * This filters from the full element list since CanvasDoc does not expose
 * a dedicated `getConnectorsByTarget` method. The filter is lightweight
 * because connector counts are typically small relative to total elements.
 */
function getConnectorsByTarget(
  doc: CanvasDoc,
  nodeId: string,
): CanvasConnectorElement[] {
  const result: CanvasConnectorElement[] = [];
  for (const el of doc.getElements()) {
    if (
      isConnector(el) &&
      "elementId" in el.target &&
      el.target.elementId === nodeId
    ) {
      result.push(el);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve upstream data for a node by traversing incoming connectors.
 *
 * For each connector whose target is `nodeId`, the source element is
 * inspected:
 * - **text** nodes: the `props.value` (TextNodeValue) is serialized to
 *   plain text and added to `textList`.
 * - **image** nodes: `props.previewSrc` (falling back to `props.originalSrc`)
 *   is added to `imageList`.
 *
 * Other node types are silently ignored. Free-point sources (connectors
 * originating from a canvas point rather than a node) are also skipped.
 */
export function resolveUpstreamData(
  doc: CanvasDoc,
  nodeId: string,
): UpstreamData {
  const connectors = getConnectorsByTarget(doc, nodeId);
  if (connectors.length === 0) return EMPTY_UPSTREAM_DATA;

  const textList: string[] = [];
  const imageList: string[] = [];

  for (const conn of connectors) {
    // Skip connectors whose source is a free point (not attached to a node).
    if (!("elementId" in conn.source)) continue;

    const upstream = doc.getElementById(conn.source.elementId);
    if (!upstream || upstream.kind !== "node") continue;

    const node = upstream as CanvasNodeElement;

    if (node.type === "text") {
      const props = node.props as { value?: TextNodeValue };
      const text = serializeTextNodeValue(props.value);
      if (text.trim()) {
        textList.push(text);
      }
    } else if (node.type === "image") {
      const props = node.props as { previewSrc?: string; originalSrc?: string };
      const src = props.previewSrc || props.originalSrc;
      if (src) {
        imageList.push(src);
      }
    }
  }

  if (textList.length === 0 && imageList.length === 0) {
    return EMPTY_UPSTREAM_DATA;
  }

  return { textList, imageList };
}
