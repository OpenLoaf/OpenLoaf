/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { CanvasElement, CanvasNodeElement } from "./types";
import { GROUP_OUTLINE_PADDING } from "./constants";

const GROUP_NODE_TYPE = "group";
const IMAGE_GROUP_NODE_TYPE = "image-group";
const GROUP_NODE_TYPES = new Set<string>([GROUP_NODE_TYPE, IMAGE_GROUP_NODE_TYPE]);

function isGroupNodeType(type: string): boolean {
  return GROUP_NODE_TYPES.has(type);
}

/** Resolve group outline padding in canvas units. */
function getGroupOutlinePadding(_zoom: number): number {
  // 逻辑：分组外扩保持固定画布尺寸，缩放不改变间距。
  return GROUP_OUTLINE_PADDING;
}

function getNodeGroupId(element: CanvasNodeElement): string | null {
  const meta = element.meta as Record<string, unknown> | undefined;
  const groupId = meta?.groupId;
  return typeof groupId === "string" ? groupId : null;
}

function getGroupMemberIds(elements: CanvasElement[], groupId: string): string[] {
  // 优先从组节点的 props.childIds 读取，避免全量扫描。
  const groupElement = elements.find(element => element.id === groupId);
  if (groupElement && groupElement.kind === "node" && isGroupNodeType(groupElement.type)) {
    const childIds = (groupElement.props as Record<string, unknown>)?.childIds;
    if (Array.isArray(childIds) && childIds.length > 0) {
      return childIds as string[];
    }
  }
  // 回退：全量扫描（兼容 childIds 缺失的旧数据）。
  return elements
    .filter((element): element is CanvasNodeElement => element.kind === "node")
    .filter(element => getNodeGroupId(element) === groupId)
    .map(element => element.id);
}

function resolveGroupSelectionId(
  elements: CanvasElement[],
  element: CanvasNodeElement
): string {
  const groupId = getNodeGroupId(element);
  if (!groupId) return element.id;
  const groupNode = elements.find(item => item.id === groupId);
  return groupNode && groupNode.kind === "node" ? groupId : element.id;
}

/** Build an element lookup map (shared helper to avoid repeated Map construction). */
function buildElementMap(elements: CanvasElement[]): Map<string, CanvasElement> {
  return new Map(elements.map(element => [element.id, element]));
}

function normalizeSelectionIdsWithMap(
  elementMap: Map<string, CanvasElement>,
  selectedIds: string[]
): string[] {
  const normalized = new Set<string>();
  selectedIds.forEach(id => {
    const element = elementMap.get(id);
    if (!element) return;
    if (element.kind === "node") {
      if (element.locked) {
        normalized.add(id);
        return;
      }
      const groupId = getNodeGroupId(element);
      normalized.add(groupId ?? id);
      return;
    }
    normalized.add(id);
  });
  return Array.from(normalized);
}

function normalizeSelectionIds(
  elements: CanvasElement[],
  selectedIds: string[]
): string[] {
  return normalizeSelectionIdsWithMap(buildElementMap(elements), selectedIds);
}

function expandSelectionWithGroupChildren(
  elements: CanvasElement[],
  selectedIds: string[]
): string[] {
  const elementMap = buildElementMap(elements);
  const normalized = normalizeSelectionIdsWithMap(elementMap, selectedIds);
  const expanded = new Set<string>(normalized);

  normalized.forEach(id => {
    const element = elementMap.get(id);
    if (!element || element.kind !== "node") return;
    if (!isGroupNodeType(element.type)) return;
    getGroupMemberIds(elements, element.id).forEach(childId => {
      expanded.add(childId);
    });
  });

  return Array.from(expanded);
}

export {
  GROUP_NODE_TYPE,
  IMAGE_GROUP_NODE_TYPE,
  getGroupOutlinePadding,
  isGroupNodeType,
  getNodeGroupId,
  getGroupMemberIds,
  resolveGroupSelectionId,
  normalizeSelectionIds,
  expandSelectionWithGroupChildren,
};
