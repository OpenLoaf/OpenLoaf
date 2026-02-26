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
  CanvasElement,
  CanvasNodeElement,
} from "./types";
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
      meta: {
        createdAt: Date.now(),
      },
      props: {
        childIds,
      },
    });
    nodes.forEach(node => {
      const meta = { ...(node.meta ?? {}), groupId };
      deps.doc.updateElement(node.id, { meta });
    });

    // 逻辑：合并组内节点指向同一外部节点的连线。
    const childIdSet = new Set(childIds);
    const mergeCandidates: CanvasConnectorElement[] = [];
    const externalIds = new Set<string>();
    deps.doc.getElements().forEach(element => {
      if (element.kind !== "connector") return;
      if (!("elementId" in element.source) || !("elementId" in element.target)) return;
      const sourceId = element.source.elementId;
      const targetId = element.target.elementId;
      const sourceInGroup = childIdSet.has(sourceId);
      const targetInGroup = childIdSet.has(targetId);
      if (sourceInGroup === targetInGroup) return;
      mergeCandidates.push(element);
      externalIds.add(sourceInGroup ? targetId : sourceId);
    });

    if (externalIds.size === 1 && mergeCandidates.length > 0) {
      const [keeper, ...toDelete] = mergeCandidates;
      const sourceInGroup =
        "elementId" in keeper.source && childIdSet.has(keeper.source.elementId);
      const update: Partial<CanvasConnectorElement> = sourceInGroup
        ? { source: { ...keeper.source, elementId: groupId } }
        : { target: { ...keeper.target, elementId: groupId } };
      deps.doc.updateElement(keeper.id, update);
      toDelete.forEach(connector => deps.doc.deleteElement(connector.id));
    }
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
  const groupMembers = new Map<string, string[]>();
  groupIds.forEach(groupId => {
    const memberIds = getGroupMemberIds(elements, groupId);
    groupMembers.set(groupId, memberIds);
    memberIds.forEach(id => nextSelection.add(id));
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

    // 逻辑：拆分组节点关联连线，按子节点展开。
    elements.forEach(element => {
      if (element.kind !== "connector") return;
      if (!("elementId" in element.source) || !("elementId" in element.target)) return;
      const sourceGroupId = groupIds.has(element.source.elementId)
        ? element.source.elementId
        : null;
      const targetGroupId = groupIds.has(element.target.elementId)
        ? element.target.elementId
        : null;
      if (!sourceGroupId && !targetGroupId) return;

      const sourceMembers = sourceGroupId
        ? groupMembers.get(sourceGroupId) ?? []
        : [];
      const targetMembers = targetGroupId
        ? groupMembers.get(targetGroupId) ?? []
        : [];

      if (sourceGroupId && targetGroupId) {
        if (sourceMembers.length === 0 || targetMembers.length === 0) return;
        sourceMembers.forEach(sourceId => {
          targetMembers.forEach(targetId => {
            deps.doc.addElement({
              ...element,
              id: deps.generateId("connector"),
              source: { ...element.source, elementId: sourceId },
              target: { ...element.target, elementId: targetId },
            });
          });
        });
        deps.doc.deleteElement(element.id);
        return;
      }

      const memberIds = sourceGroupId ? sourceMembers : targetMembers;
      if (memberIds.length === 0) return;

      memberIds.forEach(memberId => {
        const nextSource = sourceGroupId
          ? { ...element.source, elementId: memberId }
          : element.source;
        const nextTarget = targetGroupId
          ? { ...element.target, elementId: memberId }
          : element.target;
        deps.doc.addElement({
          ...element,
          id: deps.generateId("connector"),
          source: nextSource,
          target: nextTarget,
        });
      });
      deps.doc.deleteElement(element.id);
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
