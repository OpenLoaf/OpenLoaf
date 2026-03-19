/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ChatUIMessage } from "@openloaf/api";
import type { CanvasConnectorElement, CanvasElement, CanvasNodeElement } from "../engine/types";
import { generateElementId } from "../engine/id";

type ImportedBoardMessage = ChatUIMessage & {
  /** Imported creation time for deterministic ordering. */
  createdAt: string;
};

type MessageVisualSpec = {
  /** Anchor element id used for chain connectors. */
  anchorId: string;
  /** Node width. */
  width: number;
  /** Node height. */
  height: number;
  /** Build positioned canvas elements. */
  createElements: (x: number, y: number) => CanvasElement[];
};

const HORIZONTAL_GAP = 520;
const VERTICAL_GAP = 56;
const MESSAGE_WIDTH = 400;
const MESSAGE_HEIGHT = 88;
const ROOT_PARENT_KEY = "__root__";

/** Build an initial board snapshot from imported chat history. */
export async function buildImportedChatBoardElements(input: {
  messages: ImportedBoardMessage[];
  projectId?: string;
}): Promise<CanvasElement[]> {
  const orderedMessages = sortImportedMessages(input.messages);
  const allMessagesById = new Map(orderedMessages.map((message) => [message.id, message]));
  const renderableMessages = orderedMessages.filter(isRenderableMessage);

  if (renderableMessages.length === 0) {
    return [];
  }

  const childrenOf = new Map<string, string[]>();
  const visualParentById = new Map<string, string | null>();
  const orderById = new Map(renderableMessages.map((message, index) => [message.id, index]));

  for (const message of renderableMessages) {
    const visualParentId = resolveRenderableParentId(message, allMessagesById);
    visualParentById.set(message.id, visualParentId);
    const parentKey = visualParentId ?? ROOT_PARENT_KEY;
    const nextChildren = childrenOf.get(parentKey) ?? [];
    nextChildren.push(message.id);
    childrenOf.set(parentKey, nextChildren);
  }

  const specEntries = renderableMessages.map((message) => {
    const spec = buildMessageVisualSpec(message);
    return [message.id, spec] as const;
  });
  const specsById = new Map(specEntries);

  const elements: CanvasElement[] = [];
  let cursorY = 0;
  const rootIds = [...(childrenOf.get(ROOT_PARENT_KEY) ?? [])].sort(
    (left, right) => (orderById.get(left) ?? 0) - (orderById.get(right) ?? 0),
  );

  for (const rootId of rootIds) {
    cursorY = layoutMessageTree({
      messageId: rootId,
      x: 0,
      y: cursorY,
      childrenOf,
      specsById,
      orderById,
      elements,
    });
    cursorY += VERTICAL_GAP;
  }

  return elements;
}

/** Build a visual spec that creates a simple text node for the message. */
function buildMessageVisualSpec(message: ImportedBoardMessage): MessageVisualSpec {
  const nodeId = generateElementId(`import-${message.role}`);
  const text = extractTextFromParts(message.parts);
  return {
    anchorId: nodeId,
    width: MESSAGE_WIDTH,
    height: MESSAGE_HEIGHT,
    createElements: (x, y) => [
      {
        id: nodeId,
        kind: "node",
        type: "text",
        xywh: [x, y, MESSAGE_WIDTH, MESSAGE_HEIGHT],
        props: {
          readOnlyProjection: true,
          markdownText: text || " ",
        },
      } satisfies CanvasNodeElement<Record<string, unknown>>,
    ],
  };
}

/** Build a renderable parent id by walking ancestors until another renderable message is found. */
function resolveRenderableParentId(
  message: ImportedBoardMessage,
  messagesById: Map<string, ImportedBoardMessage>,
): string | null {
  let parentId = message.parentMessageId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = messagesById.get(parentId);
    if (!parent) return null;
    if (isRenderableMessage(parent)) return parent.id;
    parentId = parent.parentMessageId;
  }
  return null;
}

/** Layout a message subtree and append elements in DFS order. */
function layoutMessageTree(input: {
  messageId: string;
  x: number;
  y: number;
  childrenOf: Map<string, string[]>;
  specsById: Map<string, MessageVisualSpec>;
  orderById: Map<string, number>;
  elements: CanvasElement[];
}): number {
  const spec = input.specsById.get(input.messageId);
  if (!spec) return input.y;

  input.elements.push(...spec.createElements(input.x, input.y));

  let cursorY = input.y + spec.height + VERTICAL_GAP;
  const childIds = [...(input.childrenOf.get(input.messageId) ?? [])].sort(
    (left, right) => (input.orderById.get(left) ?? 0) - (input.orderById.get(right) ?? 0),
  );

  for (const childId of childIds) {
    const childSpec = input.specsById.get(childId);
    if (!childSpec) continue;
    const childStartY = cursorY;
    cursorY = layoutMessageTree({
      ...input,
      messageId: childId,
      x: input.x + HORIZONTAL_GAP,
      y: childStartY,
    });
    input.elements.push(
      createChainConnector({
        sourceElementId: spec.anchorId,
        targetElementId: childSpec.anchorId,
      }),
    );
    cursorY += VERTICAL_GAP;
  }

  return cursorY;
}

/** Create a connector between two imported chain nodes. */
function createChainConnector(input: {
  sourceElementId: string;
  targetElementId: string;
}): CanvasConnectorElement {
  return {
    id: generateElementId("import-connector"),
    kind: "connector",
    type: "connector",
    xywh: [0, 0, 0, 0],
    source: { elementId: input.sourceElementId },
    target: { elementId: input.targetElementId },
    style: "curve",
  };
}

/** Extract plain text from message parts for imported user nodes. */
function extractTextFromParts(parts: unknown[]): string {
  return parts
    .filter(
      (part): part is { type: string; text: string } =>
        Boolean(part) &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

/** Return whether a message should appear on the imported board. */
function isRenderableMessage(message: ImportedBoardMessage): boolean {
  const kind = message.messageKind ?? "normal";
  if (kind === "compact_prompt") return false;
  if (kind === "compact_summary") return true;
  if (message.role === "subagent" || message.role === "system") return false;
  if (message.role === "user") return true;
  return Array.isArray(message.parts) && message.parts.length > 0;
}

/** Sort imported messages with stable chronological ordering. */
function sortImportedMessages(messages: ImportedBoardMessage[]): ImportedBoardMessage[] {
  return [...messages].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();
    return leftTime - rightTime || left.id.localeCompare(right.id);
  });
}
