/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type {
  CanvasConnectorElement,
  CanvasElement,
  CanvasNodeElement,
} from "./types";
import {
  MINDMAP_BRANCH_COLORS,
  MINDMAP_FIRST_LEVEL_HORIZONTAL_SPACING,
  MINDMAP_NODE_HORIZONTAL_SPACING,
  MINDMAP_NODE_VERTICAL_SPACING,
} from "./constants";

export const MINDMAP_META = {
  branchColor: "mindmapBranchColor",
  childCount: "mindmapChildCount",
  collapsed: "mindmapCollapsed",
  ghost: "mindmapGhost",
  ghostCount: "mindmapGhostCount",
  ghostParentId: "mindmapGhostParentId",
  ghostConnector: "mindmapGhostConnector",
  ghostConnectorParentId: "mindmapGhostConnectorParentId",
  hidden: "mindmapHidden",
  layoutDirection: "mindmapLayoutDirection",
  multiParent: "mindmapMultiParent",
} as const;

export type MindmapLayoutUpdate = {
  /** Element id to update. */
  id: string;
  /** New xywh rectangle. */
  xywh: [number, number, number, number];
};

export type MindmapLayoutDirection = "right" | "left" | "balanced";

export type MindmapNodeMeta = {
  /** Whether this node should be hidden due to collapse. */
  hidden: boolean;
  /** Direct child count in the tree layout. */
  childCount: number;
  /** Whether this node has multiple parents. */
  multiParent: boolean;
  /** Branch color used for styling. */
  branchColor?: string;
};

export type MindmapGhostPlan = {
  /** Collapsed parent id that owns the ghost node. */
  parentId: string;
  /** Descendant count displayed on the ghost node. */
  count: number;
  /** Layout rectangle for the ghost node. */
  xywh: [number, number, number, number];
  /** Optional branch color for styling. */
  branchColor?: string;
};

type LayoutTree = {
  kind: "node" | "ghost";
  id: string;
  parentId?: string;
  count?: number;
  width: number;
  height: number;
  boundW: number;
  boundH: number;
  children: LayoutTree[];
};

type NodeOrderResolver = (nodeId: string) => number;

/** Compute layout updates for a global mindmap tree. */
export function computeMindmapLayout(
  elements: CanvasElement[],
  defaultDirection: MindmapLayoutDirection,
  rootDirections?: Map<string, MindmapLayoutDirection>
): {
  updates: MindmapLayoutUpdate[];
  ghostUpdates: MindmapLayoutUpdate[];
  nodeMeta: Map<string, MindmapNodeMeta>;
  ghostPlans: MindmapGhostPlan[];
} {
  const nodes = elements.filter(
    (element): element is CanvasNodeElement => element.kind === "node"
  );
  const ghostNodes = nodes.filter(node => getMindmapFlag(node, MINDMAP_META.ghost));
  const ghostParentMap = new Map<string, CanvasNodeElement>();
  ghostNodes.forEach(node => {
    const parentId = getMindmapString(node, MINDMAP_META.ghostParentId);
    if (parentId) ghostParentMap.set(parentId, node);
  });

  const realNodes = nodes.filter(node => !getMindmapFlag(node, MINDMAP_META.ghost));
  const realNodeMap = new Map(realNodes.map(node => [node.id, node]));

  const nodeOrder = new Map<string, number>();
  elements.forEach((element, index) => {
    if (element.kind !== "node") return;
    nodeOrder.set(element.id, index);
  });
  const resolveOrder: NodeOrderResolver = nodeId => {
    const node = realNodeMap.get(nodeId);
    const createdAt = getMindmapNumber(node, "createdAt");
    if (typeof createdAt === "number" && Number.isFinite(createdAt)) return createdAt;
    return nodeOrder.get(nodeId) ?? 0;
  };

  const connectors = elements.filter(
    (element): element is CanvasConnectorElement => element.kind === "connector"
  );

  // 逻辑：只统计真实节点之间的连线，忽略幽灵节点。
  const inboundConnectors = new Map<string, CanvasConnectorElement[]>();
  const outboundConnectors = new Map<string, CanvasConnectorElement[]>();

  connectors.forEach(connector => {
    if (!("elementId" in connector.source) || !("elementId" in connector.target)) return;
    const sourceId = connector.source.elementId;
    const targetId = connector.target.elementId;
    if (!realNodeMap.has(sourceId) || !realNodeMap.has(targetId)) return;
    const inbound = inboundConnectors.get(targetId) ?? [];
    inbound.push(connector);
    inboundConnectors.set(targetId, inbound);
    const outbound = outboundConnectors.get(sourceId) ?? [];
    outbound.push(connector);
    outboundConnectors.set(sourceId, outbound);
  });

  const parentCount = new Map<string, number>();
  realNodes.forEach(node => {
    parentCount.set(node.id, inboundConnectors.get(node.id)?.length ?? 0);
  });

  // 逻辑：多父节点从树形布局中降级为根节点处理。
  const multiParentIds = new Set(
    Array.from(parentCount.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => id)
  );

  const treeChildrenMap = new Map<string, string[]>();
  const treeParentMap = new Map<string, string>();

  inboundConnectors.forEach((connectorsForNode, childId) => {
    if (multiParentIds.has(childId)) return;
    const connector = connectorsForNode[0];
    if (!connector || !("elementId" in connector.source)) return;
    const parentId = connector.source.elementId;
    if (!realNodeMap.has(parentId)) return;
    treeParentMap.set(childId, parentId);
    const children = treeChildrenMap.get(parentId) ?? [];
    children.push(childId);
    treeChildrenMap.set(parentId, children);
  });

  treeChildrenMap.forEach((children, parentId) => {
    children.sort((a, b) => resolveOrder(a) - resolveOrder(b));
    treeChildrenMap.set(parentId, children);
  });

  const childCountMap = new Map<string, number>();
  realNodes.forEach(node => {
    childCountMap.set(node.id, treeChildrenMap.get(node.id)?.length ?? 0);
  });

  const collapsedSet = new Set<string>();
  realNodes.forEach(node => {
    if (multiParentIds.has(node.id)) return;
    if (getMindmapFlag(node, MINDMAP_META.collapsed)) {
      collapsedSet.add(node.id);
    }
  });

  const subtreeCount = new Map<string, number>();
  const countDescendants = (nodeId: string): number => {
    if (subtreeCount.has(nodeId)) return subtreeCount.get(nodeId) ?? 0;
    const children = treeChildrenMap.get(nodeId) ?? [];
    let count = 0;
    children.forEach(childId => {
      count += 1 + countDescendants(childId);
    });
    subtreeCount.set(nodeId, count);
    return count;
  };
  realNodes.forEach(node => {
    countDescendants(node.id);
  });

  const hiddenSet = new Set<string>();
  const markHidden = (nodeId: string) => {
    // 逻辑：折叠节点隐藏其树形子孙节点。
    const children = treeChildrenMap.get(nodeId) ?? [];
    children.forEach(childId => {
      if (hiddenSet.has(childId)) return;
      hiddenSet.add(childId);
      markHidden(childId);
    });
  };
  collapsedSet.forEach(nodeId => {
    markHidden(nodeId);
  });

  const branchColorMap = new Map<string, string>();
  const rootIds = realNodes
    .filter(node => (parentCount.get(node.id) ?? 0) === 0)
    .map(node => node.id)
    .sort((a, b) => resolveOrder(a) - resolveOrder(b));
  rootIds.forEach((rootId, index) => {
    const color = MINDMAP_BRANCH_COLORS[index % MINDMAP_BRANCH_COLORS.length];
    if (color) branchColorMap.set(rootId, color);
  });

  const resolveBranchColor = (nodeId: string, visiting = new Set<string>()) => {
    // 逻辑：分支颜色沿主父链继承，根节点用调色板兜底。
    if (branchColorMap.has(nodeId)) return;
    if (visiting.has(nodeId)) return;
    visiting.add(nodeId);
    const inbound = inboundConnectors.get(nodeId) ?? [];
    if (inbound.length === 0) {
      const color =
        MINDMAP_BRANCH_COLORS[
          Math.abs(resolveOrder(nodeId)) % MINDMAP_BRANCH_COLORS.length
        ];
      if (color) branchColorMap.set(nodeId, color);
      return;
    }
    const primary = inbound[0];
    if (!primary || !("elementId" in primary.source)) return;
    const parentId = primary.source.elementId;
    resolveBranchColor(parentId, visiting);
    const parentColor = branchColorMap.get(parentId);
    const nextColor = typeof primary.color === "string" ? primary.color : parentColor;
    if (nextColor) branchColorMap.set(nodeId, nextColor);
  };

  realNodes.forEach(node => {
    resolveBranchColor(node.id);
  });

  const nodeMeta = new Map<string, MindmapNodeMeta>();
  realNodes.forEach(node => {
    nodeMeta.set(node.id, {
      hidden: hiddenSet.has(node.id),
      childCount: childCountMap.get(node.id) ?? 0,
      multiParent: multiParentIds.has(node.id),
      branchColor: branchColorMap.get(node.id),
    });
  });

  const updates: MindmapLayoutUpdate[] = [];
  const ghostPlans: MindmapGhostPlan[] = [];
  const ghostUpdates: MindmapLayoutUpdate[] = [];

  const buildTree = (
    nodeId: string,
    parentId: string | null,
    overrideChildren?: string[]
  ): LayoutTree => {
    const node = realNodeMap.get(nodeId);
    const [x, y, w, h] = node?.xywh ?? [0, 0, 0, 0];
    const childrenIds = overrideChildren ?? (treeChildrenMap.get(nodeId) ?? []);
    const isCollapsed = collapsedSet.has(nodeId);
    const children: LayoutTree[] = [];

    if (!isCollapsed) {
      childrenIds.forEach(childId => {
        if (hiddenSet.has(childId)) return;
        children.push(buildTree(childId, nodeId));
      });
    } else {
      const hiddenCount = subtreeCount.get(nodeId) ?? 0;
      if (hiddenCount > 0) {
        const ghostSize = resolveGhostSize(hiddenCount);
        children.push({
          kind: "ghost",
          id: ghostParentMap.get(nodeId)?.id ?? `ghost-${nodeId}`,
          parentId: nodeId,
          count: hiddenCount,
          width: ghostSize.w,
          height: ghostSize.h,
          boundW: ghostSize.w,
          boundH: ghostSize.h,
          children: [],
        });
      }
    }

    let boundW = w;
    let boundH = h;
    if (children.length > 0) {
      const firstLevel = parentId === null;
      const spacingX = firstLevel
        ? MINDMAP_FIRST_LEVEL_HORIZONTAL_SPACING
        : MINDMAP_NODE_HORIZONTAL_SPACING;
      const childrenBoundW = Math.max(...children.map(child => child.boundW));
      const childrenBoundH = children.reduce((sum, child, index) => {
        if (index === 0) return child.boundH;
        return sum + MINDMAP_NODE_VERTICAL_SPACING + child.boundH;
      }, 0);
      boundW = w + spacingX + childrenBoundW;
      boundH = Math.max(h, childrenBoundH);
    }

    return {
      kind: "node",
      id: nodeId,
      width: w,
      height: h,
      boundW,
      boundH,
      children,
    };
  };

  const layoutTree = (
    tree: LayoutTree,
    layoutDirection: "left" | "right",
    rootRect: [number, number, number, number],
    firstLevel: boolean
  ) => {
    // 逻辑：按 AFFiNE 风格自上而下排列子节点。
    if (tree.children.length === 0) return;
    const [rootX, rootY, rootW, rootH] = rootRect;
    const spacingX = firstLevel
      ? MINDMAP_FIRST_LEVEL_HORIZONTAL_SPACING
      : MINDMAP_NODE_HORIZONTAL_SPACING;
    const nextX =
      layoutDirection === "right" ? rootX + rootW + spacingX : rootX - spacingX;
    let cursorY = rootY + (rootH - tree.boundH) / 2;

    if (rootH >= tree.boundH && tree.children.length === 1) {
      const onlyChild = tree.children[0];
      cursorY += (rootH - onlyChild.height) / 2;
    }

    tree.children.forEach(child => {
      const childX =
        layoutDirection === "right" ? nextX : nextX - child.width;
      const childY = cursorY + (child.boundH - child.height) / 2;
      if (child.kind === "node") {
        updates.push({ id: child.id, xywh: [childX, childY, child.width, child.height] });
        layoutTree(
          child,
          layoutDirection,
          [childX, childY, child.width, child.height],
          false
        );
      } else if (child.parentId) {
        const xywh: [number, number, number, number] = [
          childX,
          childY,
          child.width,
          child.height,
        ];
        ghostPlans.push({
          parentId: child.parentId,
          count: child.count ?? 0,
          xywh,
          branchColor: branchColorMap.get(child.parentId),
        });
        ghostUpdates.push({ id: child.id, xywh });
      }
      cursorY += child.boundH + MINDMAP_NODE_VERTICAL_SPACING;
    });
  };

  const rootNodes = realNodes.filter(node => !treeParentMap.has(node.id));
  rootNodes.sort((a, b) => resolveOrder(a.id) - resolveOrder(b.id));

  const resolveRootDirection = (rootId: string): MindmapLayoutDirection => {
    const customDirection = rootDirections?.get(rootId);
    return customDirection ?? defaultDirection;
  };

  rootNodes.forEach(root => {
    if (hiddenSet.has(root.id)) return;
    const children = treeChildrenMap.get(root.id) ?? [];
    const rootDirection = resolveRootDirection(root.id);
    if (rootDirection === "balanced" && children.length > 0 && !collapsedSet.has(root.id)) {
      const leftChildren: string[] = [];
      const rightChildren: string[] = [];
      children.forEach((childId, index) => {
        if (index % 2 === 0) {
          rightChildren.push(childId);
        } else {
          leftChildren.push(childId);
        }
      });
      if (leftChildren.length > 0) {
        const leftTree = buildTree(root.id, null, leftChildren);
        layoutTree(leftTree, "left", root.xywh, true);
      }
      if (rightChildren.length > 0) {
        const rightTree = buildTree(root.id, null, rightChildren);
        layoutTree(rightTree, "right", root.xywh, true);
      }
      return;
    }
    const tree = buildTree(root.id, null);
    const layoutDirection = rootDirection === "left" ? "left" : "right";
    layoutTree(tree, layoutDirection, root.xywh, true);
  });

  return {
    updates,
    ghostUpdates,
    nodeMeta,
    ghostPlans,
  };
}

/** Resolve numeric meta value from a node. */
function getMindmapNumber(
  node: CanvasNodeElement | undefined,
  key: string
): number | undefined {
  if (!node?.meta) return undefined;
  const raw = (node.meta as Record<string, unknown>)[key];
  return typeof raw === "number" ? raw : undefined;
}

/** Resolve string meta value from a node. */
function getMindmapString(
  node: CanvasNodeElement | undefined,
  key: string
): string | undefined {
  if (!node?.meta) return undefined;
  const raw = (node.meta as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw : undefined;
}

/** Read boolean mindmap meta flags. */
function getMindmapFlag(
  node: CanvasNodeElement | undefined,
  key: string
): boolean {
  if (!node?.meta) return false;
  return Boolean((node.meta as Record<string, unknown>)[key]);
}

/** Estimate ghost node size based on descendant count. */
function resolveGhostSize(count: number): { w: number; h: number } {
  const digits = String(Math.max(0, count)).length;
  const width = Math.max(44, 28 + digits * 10);
  return { w: width, h: 28 };
}
