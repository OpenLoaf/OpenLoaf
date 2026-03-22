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
/** An upstream data entry with its source node ID for traceability. */
export type UpstreamEntry = {
  nodeId: string;
  nodeType: string;
  data: string;
  /** Display name derived automatically from the source node content. */
  label?: string;
};

export type UpstreamData = {
  /** Text contents extracted from upstream text nodes. */
  textList: string[];
  /** Image sources extracted from upstream image nodes. */
  imageList: string[];
  /** Video sources extracted from upstream video nodes. */
  videoList: string[];
  /** Audio sources extracted from upstream audio nodes. */
  audioList: string[];
  /** All entries with source node IDs (for InputSnapshot.upstreamRefs). */
  entries: UpstreamEntry[];
};

/** Empty upstream data constant to avoid unnecessary allocations. */
const EMPTY_UPSTREAM_DATA: UpstreamData = {
  textList: [],
  imageList: [],
  videoList: [],
  audioList: [],
  entries: [],
};

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
 * Check whether a connector carries data-flow semantics.
 *
 * Connectors with `semantic === 'chat-flow'` represent conversational
 * links and should NOT contribute upstream data. Only connectors with
 * no semantic tag (defaults to data-flow) or an explicit non-chat-flow
 * value are considered data-flow connectors.
 */
function isDataFlowConnector(conn: CanvasConnectorElement): boolean {
  const semantic = (conn as Record<string, unknown>).semantic as
    | string
    | undefined;
  return semantic !== 'chat-flow';
}

/**
 * Find all data-flow connectors connected to the given node id and return
 * the peer (other-end) element id for each.
 *
 * Checks BOTH directions — the node can be either the source or the target
 * of the connector. This makes upstream data resolution direction-agnostic:
 * users can create connectors in any direction and data will still flow.
 *
 * Connectors with `semantic === 'chat-flow'` are excluded — only data-flow
 * connectors (semantic undefined or any value other than 'chat-flow')
 * contribute to upstream data.
 */
function getConnectedPeerIds(
  doc: CanvasDoc,
  nodeId: string,
): string[] {
  const peerIds: string[] = [];
  for (const el of doc.getElements()) {
    if (!isConnector(el) || !isDataFlowConnector(el)) continue;
    const hasSourceId = "elementId" in el.source;
    const hasTargetId = "elementId" in el.target;
    if (!hasSourceId || !hasTargetId) continue;
    const sourceId = (el.source as { elementId: string }).elementId;
    const targetId = (el.target as { elementId: string }).elementId;
    if (targetId === nodeId && sourceId !== nodeId) {
      peerIds.push(sourceId);
    } else if (sourceId === nodeId && targetId !== nodeId) {
      peerIds.push(targetId);
    }
  }
  return peerIds;
}

// ---------------------------------------------------------------------------
// Label derivation
// ---------------------------------------------------------------------------

/**
 * Derive a short display label from text node content.
 *
 * Uses the first non-empty line of text, truncated to 20 characters.
 * Falls back to "Text·<shortId>" when the text is blank.
 */
function deriveTextNodeLabel(text: string, nodeId: string): string {
  const firstLine = text.split('\n').find((line) => line.trim().length > 0) ?? '';
  if (!firstLine.trim()) {
    return `Text·${nodeId.slice(0, 6)}`;
  }
  const trimmed = firstLine.trim();
  return trimmed.length > 20 ? `${trimmed.slice(0, 20)}…` : trimmed;
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve upstream data for a node by traversing connected data-flow connectors.
 *
 * Direction-agnostic: checks connectors where the node is either source or
 * target, so users can create connectors in any direction and data flows.
 *
 * For each connected peer node:
 * - **text** nodes: the `props.value` (TextNodeValue) is serialized to
 *   plain text and added to `textList`.
 * - **image** nodes: `props.previewSrc` (falling back to `props.originalSrc`)
 *   is added to `imageList`.
 * - **video** nodes: `props.sourcePath` is added to `videoList`.
 * - **audio** nodes: `props.sourcePath` is added to `audioList`.
 *
 * Chat-flow connectors are excluded — only data-flow connectors contribute.
 * Other node types are silently ignored.
 */
export function resolveUpstreamData(
  doc: CanvasDoc,
  nodeId: string,
): UpstreamData {
  const peerIds = getConnectedPeerIds(doc, nodeId);
  if (peerIds.length === 0) return EMPTY_UPSTREAM_DATA;

  const textList: string[] = [];
  const imageList: string[] = [];
  const videoList: string[] = [];
  const audioList: string[] = [];
  const entries: UpstreamEntry[] = [];

  for (const peerId of peerIds) {
    const peer = doc.getElementById(peerId);
    if (!peer || peer.kind !== "node") continue;

    const node = peer as CanvasNodeElement;

    if (node.type === "text") {
      const props = node.props as { value?: TextNodeValue };
      const text = serializeTextNodeValue(props.value);
      if (text.trim()) {
        textList.push(text);
        const label = deriveTextNodeLabel(text, node.id);
        entries.push({ nodeId: node.id, nodeType: 'text', data: text, label });
      }
    } else if (node.type === "image") {
      const props = node.props as { previewSrc?: string; originalSrc?: string };
      const src = props.previewSrc || props.originalSrc;
      if (src) {
        imageList.push(src);
        entries.push({ nodeId: node.id, nodeType: 'image', data: src });
      }
    } else if (node.type === "video") {
      const props = node.props as { sourcePath?: string };
      if (props.sourcePath) {
        videoList.push(props.sourcePath);
        entries.push({ nodeId: node.id, nodeType: 'video', data: props.sourcePath });
      }
    } else if (node.type === "audio") {
      const props = node.props as { sourcePath?: string };
      if (props.sourcePath) {
        audioList.push(props.sourcePath);
        entries.push({ nodeId: node.id, nodeType: 'audio', data: props.sourcePath });
      }
    }
  }

  if (entries.length === 0) {
    return EMPTY_UPSTREAM_DATA;
  }

  return { textList, imageList, videoList, audioList, entries };
}
