import type { CanvasElement, CanvasNodeElement } from "./types";
import type { CanvasDoc } from "./CanvasDoc";
import type { SelectionManager } from "./SelectionManager";
import { computeNodeBounds } from "./geometry";
import {
  GROUP_NODE_TYPE,
  IMAGE_GROUP_NODE_TYPE,
  getGroupMemberIds,
  getNodeGroupId,
  isGroupNodeType,
} from "./grouping";

type SelectionDeps = {
  /** Document model for element updates. */
  doc: CanvasDoc;
  /** Selection manager for selection updates. */
  selection: SelectionManager;
  /** Guard whether the canvas is locked. */
  isLocked: () => boolean;
  /** Commit history snapshot after updates. */
  commitHistory: () => void;
  /** Generate new ids for elements. */
  generateId: (prefix: string) => string;
  /** Return the next zIndex value. */
  getNextZIndex: () => number;
  /** Return the minimum zIndex value. */
  getMinZIndex: () => number;
};

/** Group selected nodes into a new group. */
function groupSelection(deps: SelectionDeps, nodeIds: string[]): void {
  if (deps.isLocked()) return;
  if (nodeIds.length < 2) return;

  const nodes = nodeIds
    .map(id => deps.doc.getElementById(id))
    .filter((element): element is CanvasNodeElement => element?.kind === "node");
  if (nodes.length < 2) return;

  const groupType = nodes.every(node => node.type === "image")
    ? IMAGE_GROUP_NODE_TYPE
    : GROUP_NODE_TYPE;
  const bounds = computeNodeBounds(nodes);
  const minZ = nodes.reduce(
    (current, node) => Math.min(current, node.zIndex ?? 0),
    Number.POSITIVE_INFINITY
  );
  const groupZ = Number.isFinite(minZ) ? minZ - 1 : deps.getMinZIndex() - 1;
  const groupId = deps.generateId(groupType);
  const childIds = nodes.map(node => node.id);

  // 逻辑：创建组节点，并将选中节点挂到组节点下。
  deps.doc.transact(() => {
    deps.doc.addElement({
      id: groupId,
      kind: "node",
      type: groupType,
      xywh: [bounds.x, bounds.y, bounds.w, bounds.h],
      zIndex: groupZ,
      props: {
        childIds,
      },
    });
    nodes.forEach(node => {
      const meta = { ...(node.meta ?? {}), groupId };
      deps.doc.updateElement(node.id, { meta });
    });
  });
  deps.selection.setSelection([groupId]);
  deps.commitHistory();
}

/** Ungroup selected nodes (or their entire groups). */
function ungroupSelection(deps: SelectionDeps, selectedNodes: CanvasNodeElement[]): void {
  if (deps.isLocked()) return;
  if (selectedNodes.length === 0) return;

  const groupIds = new Set<string>();
  selectedNodes.forEach(node => {
    if (isGroupNodeType(node.type)) {
      groupIds.add(node.id);
      return;
    }
    const groupId = getNodeGroupId(node);
    if (groupId) groupIds.add(groupId);
  });
  if (groupIds.size === 0) return;

  const elements = deps.doc.getElements();
  const nextSelection = new Set<string>();
  groupIds.forEach(groupId => {
    getGroupMemberIds(elements, groupId).forEach(id => nextSelection.add(id));
  });

  // 逻辑：移除选中节点所属的整个分组。
  deps.doc.transact(() => {
    elements.forEach(element => {
      if (element.kind !== "node") return;
      const groupId = getNodeGroupId(element);
      if (!groupId || !groupIds.has(groupId)) return;
      const nextMeta = { ...(element.meta ?? {}) } as Record<string, unknown>;
      delete nextMeta.groupId;
      const meta = Object.keys(nextMeta).length > 0 ? nextMeta : undefined;
      deps.doc.updateElement(element.id, { meta });
    });
    groupIds.forEach(groupId => {
      deps.doc.deleteElement(groupId);
    });
  });
  deps.selection.setSelection(Array.from(nextSelection));
  deps.commitHistory();
}

/** Delete currently selected elements. */
function deleteSelection(
  deps: SelectionDeps,
  selectedIds: string[]
): void {
  if (deps.isLocked()) return;
  if (selectedIds.length === 0) return;

  const selectedSet = new Set(selectedIds);
  const nodeIds = selectedIds.filter(id => {
    const element = deps.doc.getElementById(id);
    return element?.kind === "node";
  });
  const nodeSet = new Set(nodeIds);
  const connectorIds = deps.doc
    .getElements()
    .filter(element => element.kind === "connector")
    .filter(element => {
      if (selectedSet.has(element.id)) return true;
      const sourceHit =
        "elementId" in element.source && nodeSet.has(element.source.elementId);
      const targetHit =
        "elementId" in element.target && nodeSet.has(element.target.elementId);
      return sourceHit || targetHit;
    })
    .map(element => element.id);

  const deleteIds = new Set([
    ...nodeIds,
    ...connectorIds,
    ...selectedIds,
  ]);
  // 逻辑：删除节点时同步删除关联连线。
  deps.doc.transact(() => {
    deps.doc.deleteElements(Array.from(deleteIds));
  });
  deps.selection.clear();
  deps.commitHistory();
}

/** Nudge selected nodes by a small delta. */
function nudgeSelection(
  deps: SelectionDeps,
  nodeIds: string[],
  dx: number,
  dy: number
): void {
  if (deps.isLocked()) return;
  if (nodeIds.length === 0) return;

  // 逻辑：批量位移选中节点，保持相对布局。
  deps.doc.transact(() => {
    nodeIds.forEach(id => {
      const element = deps.doc.getElementById(id);
      if (!element || element.kind !== "node") return;
      const [x, y, w, h] = element.xywh;
      deps.doc.updateElement(id, { xywh: [x + dx, y + dy, w, h] });
    });
  });
  deps.commitHistory();
}

/** Auto layout selected nodes in a simple row or column. */
function layoutSelection(
  deps: SelectionDeps,
  nodes: CanvasNodeElement[],
  gap: number,
  direction: "row" | "column" = "row"
): void {
  if (deps.isLocked()) return;
  if (nodes.length < 2) return;

  const sorted = [...nodes].sort((a, b) =>
    direction === "row" ? a.xywh[0] - b.xywh[0] : a.xywh[1] - b.xywh[1]
  );
  const bounds = computeNodeBounds(sorted);
  let cursor = direction === "row" ? bounds.x : bounds.y;

  // 逻辑：多选节点按指定方向排列，保持宽高不变。
  deps.doc.transact(() => {
    sorted.forEach(node => {
      const [, , w, h] = node.xywh;
      const nextX = direction === "row" ? cursor : bounds.x;
      const nextY = direction === "row" ? bounds.y : cursor;
      deps.doc.updateElement(node.id, { xywh: [nextX, nextY, w, h] });
      cursor += (direction === "row" ? w : h) + gap;
    });
  });
  deps.commitHistory();
}

/** Update a node's lock state. */
function setElementLocked(
  doc: CanvasDoc,
  elementId: string,
  locked: boolean
): void {
  const element = doc.getElementById(elementId);
  if (!element) return;
  if (element.kind !== "node") return;
  doc.updateElement(elementId, { locked });
}

/** Bring a node element to the top. */
function bringNodeToFront(
  deps: SelectionDeps,
  elementId: string
): void {
  const element = deps.doc.getElementById(elementId);
  if (!element || element.kind !== "node") return;
  deps.doc.updateElement(elementId, { zIndex: deps.getNextZIndex() });
  deps.commitHistory();
}

/** Send a node element to the bottom. */
function sendNodeToBack(
  deps: SelectionDeps,
  elementId: string
): void {
  const element = deps.doc.getElementById(elementId);
  if (!element || element.kind !== "node") return;
  const minZ = deps.getMinZIndex();
  deps.doc.updateElement(elementId, { zIndex: minZ - 1 });
  deps.commitHistory();
}

export {
  groupSelection,
  ungroupSelection,
  getGroupMemberIds,
  deleteSelection,
  nudgeSelection,
  layoutSelection,
  setElementLocked,
  bringNodeToFront,
  sendNodeToBack,
};
