"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Palette, Ungroup } from "lucide-react";
import type { Edge } from "reactflow";
import { Handle, NodeToolbar, Position, type Node as RFNode, type NodeProps } from "reactflow";
import { useCanvasState } from "../CanvasProvider";
import NodeToolsToolbar, { type NodeToolItem } from "../toolbar/NodeToolsToolbar";
import { IMAGE_HANDLE_IDS } from "../utils/canvas-constants";

export interface GroupNodeData {
  label?: string;
  backgroundColor?: string;
}

export type MultiSelectionBounds = {
  count: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const GROUP_PADDING_PX = 24;
const GROUP_HEADER_HEIGHT_PX = 18;
const GROUP_PADDING_TOP_PX = GROUP_PADDING_PX + GROUP_HEADER_HEIGHT_PX;
const GROUP_BOUNDS_EPSILON = 0.5;
const GROUP_TOOLBAR_ICON_SIZE = 14;
const GROUP_COLOR_SWATCHES = [
  "rgba(255, 247, 214, 0.7)",
  "rgba(240, 253, 244, 0.7)",
  "rgba(239, 246, 255, 0.7)",
  "rgba(254, 242, 242, 0.7)",
  "rgba(250, 245, 255, 0.7)",
  "rgba(248, 250, 252, 0.7)",
];

/** Convert a potential dimension into a number. */
function parseNodeSizeValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Resolve node size for layout calculations. */
export function resolveNodeSize(node: RFNode): { width: number; height: number } | null {
  const measured = (node as RFNode & { measured?: { width?: number; height?: number } }).measured;
  const width = node.width ?? measured?.width ?? parseNodeSizeValue(node.style?.width);
  const height = node.height ?? measured?.height ?? parseNodeSizeValue(node.style?.height);
  if (!width || !height) return null;
  return { width, height };
}

/** Build a node lookup map for fast access. */
export function buildNodeMap(nodes: RFNode[]) {
  return new Map(nodes.map((node) => [node.id, node]));
}

/** Collect a group node and all of its descendants. */
export function collectGroupSubtree(nodes: RFNode[], groupId: string): RFNode[] {
  const nodeMap = buildNodeMap(nodes);
  if (!nodeMap.has(groupId)) return [];
  const childrenMap = new Map<string, RFNode[]>();
  for (const node of nodes) {
    const parentId = getNodeParentId(node);
    if (!parentId) continue;
    const bucket = childrenMap.get(parentId);
    if (bucket) {
      bucket.push(node);
    } else {
      childrenMap.set(parentId, [node]);
    }
  }
  const result: RFNode[] = [];
  const stack = [groupId];
  // 逻辑：从 group 开始深度遍历，收集所有后代节点
  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) continue;
    const currentNode = nodeMap.get(currentId);
    if (!currentNode) continue;
    result.push(currentNode);
    const children = childrenMap.get(currentId) ?? [];
    for (const child of children) {
      stack.push(child.id);
    }
  }
  return result;
}

/** Resolve the parent id for a node. */
export function getNodeParentId(node: RFNode): string | null {
  return node.parentId ?? node.parentNode ?? null;
}

/** Resolve a node absolute position with parent offsets. */
export function createAbsolutePositionGetter(nodeMap: Map<string, RFNode>) {
  const cache = new Map<string, { x: number; y: number }>();
  const resolve = (node: RFNode): { x: number; y: number } => {
    const cached = cache.get(node.id);
    if (cached) return cached;
    const parentId = getNodeParentId(node);
    if (!parentId) {
      const abs = { x: node.position.x, y: node.position.y };
      cache.set(node.id, abs);
      return abs;
    }
    const parent = nodeMap.get(parentId);
    if (!parent) {
      const abs = { x: node.position.x, y: node.position.y };
      cache.set(node.id, abs);
      return abs;
    }
    // 逻辑：递归获取父级绝对位置 -> 叠加本地偏移
    const parentAbs = resolve(parent);
    const abs = { x: parentAbs.x + node.position.x, y: parentAbs.y + node.position.y };
    cache.set(node.id, abs);
    return abs;
  };
  return resolve;
}

/** Compute selection bounds from selected nodes. */
export function getSelectionBounds(
  nodes: RFNode[],
  options: { useAbsolute?: boolean } = {},
): MultiSelectionBounds | null {
  // 流程：筛选选中节点 -> 计算包围盒 -> 仅在多选时输出
  const useAbsolute = options.useAbsolute === true;
  const nodeMap = useAbsolute ? buildNodeMap(nodes) : null;
  const getAbsolutePosition = nodeMap ? createAbsolutePositionGetter(nodeMap) : null;
  let count = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    if (!node.selected) continue;
    const size = resolveNodeSize(node);
    if (!size) continue;
    const position = useAbsolute && getAbsolutePosition ? getAbsolutePosition(node) : node.position;
    const nextMinX = position.x;
    const nextMinY = position.y;
    const nextMaxX = position.x + size.width;
    const nextMaxY = position.y + size.height;
    minX = Math.min(minX, nextMinX);
    minY = Math.min(minY, nextMinY);
    maxX = Math.max(maxX, nextMaxX);
    maxY = Math.max(maxY, nextMaxY);
    count += 1;
  }

  if (count < 2 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }

  return { count, minX, minY, maxX, maxY };
}

/** Create a group node that wraps the current selection. */
export function groupSelectedNodes(nodes: RFNode[]) {
  const selectedNodes = nodes.filter((node) => node.selected);
  if (selectedNodes.length < 2) return nodes;

  const parentId = getNodeParentId(selectedNodes[0]);
  if (selectedNodes.some((node) => getNodeParentId(node) !== parentId)) {
    return nodes;
  }

  const selection = getSelectionBounds(selectedNodes);
  if (!selection) return nodes;

  const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const groupPosition = {
    x: selection.minX - GROUP_PADDING_PX,
    y: selection.minY - GROUP_PADDING_TOP_PX,
  };
  const groupWidth = selection.maxX - selection.minX + GROUP_PADDING_PX * 2;
  const groupHeight = selection.maxY - selection.minY + GROUP_PADDING_PX + GROUP_PADDING_TOP_PX;
  const groupNode: RFNode = {
    id: groupId,
    type: "group",
    position: groupPosition,
    data: { label: "组" },
    width: groupWidth,
    height: groupHeight,
    style: { width: groupWidth, height: groupHeight },
    parentId: parentId ?? undefined,
    extent: parentId ? "parent" : undefined,
    selected: true,
  };

  const nextNodes = nodes.map((node) => {
    if (!node.selected) return node;
    if (getNodeParentId(node) !== parentId) return node;
    const nextPosition = {
      x: node.position.x - groupPosition.x,
      y: node.position.y - groupPosition.y,
    };
    return {
      ...node,
      parentId: groupId,
      extent: "parent",
      position: nextPosition,
      selected: false,
    };
  });

  return [groupNode, ...nextNodes];
}

/** Dissolve a group node and keep its children in place. */
export function dissolveGroup(nodes: RFNode[], groupId: string): RFNode[] {
  const nodeMap = buildNodeMap(nodes);
  const group = nodeMap.get(groupId);
  if (!group) return nodes;
  const parentId = getNodeParentId(group);
  const getAbsolutePosition = createAbsolutePositionGetter(nodeMap);
  const parentAbs = parentId ? getAbsolutePosition(nodeMap.get(parentId) ?? group) : { x: 0, y: 0 };
  const nextNodes: RFNode[] = [];
  // 逻辑：移除 group 节点 -> 将子节点转换为父级或根节点坐标
  for (const node of nodes) {
    if (node.id === groupId) continue;
    if (getNodeParentId(node) !== groupId) {
      nextNodes.push(node);
      continue;
    }
    const childAbs = getAbsolutePosition(node);
    const nextPosition = {
      x: childAbs.x - parentAbs.x,
      y: childAbs.y - parentAbs.y,
    };
    nextNodes.push({
      ...node,
      parentId: parentId ?? undefined,
      extent: parentId ? "parent" : undefined,
      position: nextPosition,
    });
  }
  return nextNodes;
}

/** Duplicate a group node and its descendants at the given absolute position. */
export function duplicateGroupAtPosition(options: {
  nodes: RFNode[];
  edges: Edge[];
  groupId: string;
  targetAbs: { x: number; y: number };
}) {
  const { nodes, edges, groupId, targetAbs } = options;
  const nodeMap = buildNodeMap(nodes);
  const group = nodeMap.get(groupId);
  if (!group) return null;
  const subtree = collectGroupSubtree(nodes, groupId);
  if (subtree.length === 0) return null;
  const subtreeIds = new Set(subtree.map((node) => node.id));
  // 逻辑：构建新旧 id 映射，复制节点与内部连线
  const idPrefix = `dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const idMap = new Map<string, string>();
  let index = 0;
  for (const node of subtree) {
    idMap.set(node.id, `${idPrefix}-${index}`);
    index += 1;
  }
  const getAbsolutePosition = createAbsolutePositionGetter(nodeMap);
  const groupParentId = getNodeParentId(group);
  const groupParentAbs = groupParentId
    ? getAbsolutePosition(nodeMap.get(groupParentId) ?? group)
    : { x: 0, y: 0 };
  const nextNodes = nodes.concat(
    subtree.map((node) => {
      const newId = idMap.get(node.id) ?? node.id;
      const originalParentId = getNodeParentId(node);
      const mappedParentId = originalParentId ? idMap.get(originalParentId) ?? originalParentId : null;
      let nextPosition = node.position;
      if (node.id === groupId) {
        // 逻辑：使用用户选择的位置作为新 group 的绝对坐标
        nextPosition = {
          x: targetAbs.x - groupParentAbs.x,
          y: targetAbs.y - groupParentAbs.y,
        };
      }
      return {
        ...node,
        id: newId,
        parentId: mappedParentId ?? undefined,
        extent: mappedParentId ? "parent" : undefined,
        position: nextPosition,
        selected: node.id === groupId,
      };
    }),
  );
  let edgeIndex = 0;
  const duplicatedEdges = edges
    .filter((edge) => subtreeIds.has(edge.source) && subtreeIds.has(edge.target))
    .map((edge) => ({
      ...edge,
      id: `${idPrefix}-edge-${edgeIndex++}`,
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
      selected: false,
    }));
  return {
    nodes: nextNodes,
    edges: edges.concat(duplicatedEdges),
  };
}

/** Auto-resize group nodes based on their children bounds. */
export function adjustGroupBounds(nodes: RFNode[]) {
  const nodeMap = buildNodeMap(nodes);
  const groupNodes = nodes.filter((node) => node.type === "group");
  if (groupNodes.length === 0) return nodes;

  const depthCache = new Map<string, number>();
  const getDepth = (node: RFNode) => {
    const cached = depthCache.get(node.id);
    if (typeof cached === "number") return cached;
    let depth = 0;
    let parentId = getNodeParentId(node);
    // 逻辑：沿父链累加深度，避免循环引用
    while (parentId) {
      const parent = nodeMap.get(parentId);
      if (!parent) break;
      depth += 1;
      parentId = getNodeParentId(parent);
      if (parentId === node.id) break;
    }
    depthCache.set(node.id, depth);
    return depth;
  };

  const sortedGroups = [...groupNodes].sort((a, b) => getDepth(b) - getDepth(a));
  let changed = false;

  for (const group of sortedGroups) {
    const currentGroup = nodeMap.get(group.id) ?? group;
    const children = Array.from(nodeMap.values()).filter(
      (node) => getNodeParentId(node) === currentGroup.id,
    );
    if (children.length === 0) continue;
    const getAbsolutePosition = createAbsolutePositionGetter(nodeMap);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let count = 0;

    for (const child of children) {
      const size = resolveNodeSize(child);
      if (!size) continue;
      const abs = getAbsolutePosition(child);
      minX = Math.min(minX, abs.x);
      minY = Math.min(minY, abs.y);
      maxX = Math.max(maxX, abs.x + size.width);
      maxY = Math.max(maxY, abs.y + size.height);
      count += 1;
    }

    if (count === 0 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
      continue;
    }

    const desiredAbs = {
      x: minX - GROUP_PADDING_PX,
      y: minY - GROUP_PADDING_TOP_PX,
    };
    const desiredSize = {
      width: maxX - minX + GROUP_PADDING_PX * 2,
      height: maxY - minY + GROUP_PADDING_PX + GROUP_PADDING_TOP_PX,
    };
    const groupAbs = getAbsolutePosition(currentGroup);
    const deltaX = desiredAbs.x - groupAbs.x;
    const deltaY = desiredAbs.y - groupAbs.y;
    const sizeChanged =
      Math.abs((currentGroup.width ?? 0) - desiredSize.width) > GROUP_BOUNDS_EPSILON ||
      Math.abs((currentGroup.height ?? 0) - desiredSize.height) > GROUP_BOUNDS_EPSILON;
    const positionChanged =
      Math.abs(deltaX) > GROUP_BOUNDS_EPSILON || Math.abs(deltaY) > GROUP_BOUNDS_EPSILON;
    if (!sizeChanged && !positionChanged) continue;

    const parentId = getNodeParentId(currentGroup);
    const parent = parentId ? nodeMap.get(parentId) : null;
    const parentAbs = parent ? getAbsolutePosition(parent) : { x: 0, y: 0 };
    const nextGroupPosition = {
      x: desiredAbs.x - parentAbs.x,
      y: desiredAbs.y - parentAbs.y,
    };
    const nextGroup: RFNode = {
      ...currentGroup,
      position: nextGroupPosition,
      width: desiredSize.width,
      height: desiredSize.height,
      style: {
        ...currentGroup.style,
        width: desiredSize.width,
        height: desiredSize.height,
      },
    };
    nodeMap.set(group.id, nextGroup);
    changed = true;

    if (positionChanged) {
      // 逻辑：父级移动后修正子节点相对位置，保持绝对位置不变
      for (const child of children) {
        const nextPosition = {
          x: child.position.x - deltaX,
          y: child.position.y - deltaY,
        };
        nodeMap.set(child.id, { ...child, position: nextPosition });
      }
    }
  }

  if (!changed) return nodes;
  return nodes.map((node) => nodeMap.get(node.id) ?? node);
}

/** Render a lightweight group container node. */
const GroupNode = memo(function GroupNode({ data, id, selected }: NodeProps<GroupNodeData>) {
  const { setEdges, setNodes, setPendingGroupDuplicateId } = useCanvasState();
  const baseClassName =
    "relative h-full w-full rounded-2xl border border-border/40 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)]";
  const selectedClassName = selected ? " bg-amber-100/70" : "";
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const labelValue = data?.label ?? "组";
  const [draftLabel, setDraftLabel] = useState(labelValue);
  const [activePanel, setActivePanel] = useState<"background" | null>(null);
  const backgroundColor = data?.backgroundColor ?? "rgba(255, 247, 214, 0.7)";

  /** Commit the label edit back into node data. */
  const commitLabelChange = useCallback(
    (nextLabel: string) => {
      const trimmed = nextLabel.trim();
      const finalLabel = trimmed.length > 0 ? trimmed : "组";
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === id
            ? { ...node, data: { ...(node.data as GroupNodeData), label: finalLabel } }
            : node,
        ),
      );
      setDraftLabel(finalLabel);
      setIsEditing(false);
    },
    [id, setNodes],
  );

  /** Cancel the label edit without persisting. */
  const cancelLabelEdit = useCallback(() => {
    setDraftLabel(labelValue);
    setIsEditing(false);
  }, [labelValue]);

  /** Begin group duplication with a ghost preview. */
  const startDuplicate = useCallback(() => {
    setPendingGroupDuplicateId(id);
  }, [id, setPendingGroupDuplicateId]);

  /** Trigger group label edit. */
  const startRename = useCallback(() => {
    setDraftLabel(labelValue);
    setIsEditing(true);
  }, [labelValue]);

  /** Toggle the background color panel. */
  const handleBackgroundPanel = useCallback(() => {
    setActivePanel((current) => (current === "background" ? null : "background"));
  }, []);

  /** Apply a background color to the group node. */
  const applyBackgroundColor = useCallback(
    (color: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...(node.data as GroupNodeData),
                  backgroundColor: color,
                },
              }
            : node,
        ),
      );
    },
    [id, setNodes],
  );

  /** Dissolve the group and keep its children. */
  const handleDissolve = useCallback(() => {
    setNodes((currentNodes) => adjustGroupBounds(dissolveGroup(currentNodes, id)));
    setEdges((currentEdges) =>
      currentEdges.filter((edge) => edge.source !== id && edge.target !== id),
    );
    setPendingGroupDuplicateId((current) => (current === id ? null : current));
  }, [id, setEdges, setNodes, setPendingGroupDuplicateId]);

  const toolbarItems = useMemo<NodeToolItem[]>(
    () => [
      {
        id: "background",
        title: "背景色",
        icon: <Palette size={GROUP_TOOLBAR_ICON_SIZE} />,
        onClick: handleBackgroundPanel,
        active: activePanel === "background",
      },
      {
        id: "duplicate",
        title: "复制",
        icon: <Copy size={GROUP_TOOLBAR_ICON_SIZE} />,
        onClick: startDuplicate,
      },
      {
        id: "dissolve",
        title: "解散",
        icon: <Ungroup size={GROUP_TOOLBAR_ICON_SIZE} />,
        onClick: handleDissolve,
      },
    ],
    [activePanel, handleBackgroundPanel, handleDissolve, startDuplicate],
  );

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  useEffect(() => {
    setDraftLabel(labelValue);
  }, [labelValue]);

  useEffect(() => {
    if (!selected && isEditing) {
      setIsEditing(false);
    }
  }, [isEditing, selected]);

  return (
    <div
      className={`${baseClassName}${selectedClassName}`}
      style={{ backgroundColor }}
      onPointerDown={() => setActivePanel(null)}
    >
      {/* 连线锚点：用于自动生成的连线，不展示 UI */}
      <Handle
        id={IMAGE_HANDLE_IDS.target.top}
        type="target"
        position={Position.Top}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id={IMAGE_HANDLE_IDS.target.right}
        type="target"
        position={Position.Right}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id={IMAGE_HANDLE_IDS.target.bottom}
        type="target"
        position={Position.Bottom}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id={IMAGE_HANDLE_IDS.target.left}
        type="target"
        position={Position.Left}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id={IMAGE_HANDLE_IDS.source.top}
        type="source"
        position={Position.Top}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id={IMAGE_HANDLE_IDS.source.right}
        type="source"
        position={Position.Right}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id={IMAGE_HANDLE_IDS.source.bottom}
        type="source"
        position={Position.Bottom}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id={IMAGE_HANDLE_IDS.source.left}
        type="source"
        position={Position.Left}
        className="pointer-events-none opacity-0"
      />
      <NodeToolbar
        position={Position.Top}
        offset={8}
        className="nodrag nopan pointer-events-auto"
        isVisible={selected}
      >
        <div className="flex flex-col items-center gap-1.5">
          {activePanel === "background" ? (
            <div
              className="rounded-md bg-background p-2 ring-1 ring-border"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-1.5">
                {GROUP_COLOR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label="选择背景色"
                    className="h-5 w-5 rounded-full border border-border/60"
                    style={{ backgroundColor: color }}
                    onClick={() => applyBackgroundColor(color)}
                    onPointerDown={(event) => event.stopPropagation()}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <NodeToolsToolbar items={toolbarItems} />
        </div>
      </NodeToolbar>
      <div className="absolute left-2 top-2 text-xs text-muted-foreground nodrag nopan">
        {isEditing ? (
          <input
            ref={inputRef}
            value={draftLabel}
            onChange={(event) => setDraftLabel(event.target.value)}
            onBlur={() => commitLabelChange(draftLabel)}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitLabelChange(draftLabel);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelLabelEdit();
              }
            }}
            className="w-24 rounded-sm border border-border/50 bg-background/80 px-1 py-0.5 text-[10px] text-foreground outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={startRename}
            onPointerDown={(event) => event.stopPropagation()}
            className="text-left"
          >
            {labelValue}
          </button>
        )}
      </div>
    </div>
  );
});

export default GroupNode;
