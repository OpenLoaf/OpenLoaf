import type { CanvasElement, CanvasNodeElement } from "./types";

const GROUP_NODE_TYPE = "group";
const IMAGE_GROUP_NODE_TYPE = "image-group";
/** Outline padding in px for group bounds. */
const GROUP_OUTLINE_INSET = 22;
const GROUP_NODE_TYPES = new Set<string>([GROUP_NODE_TYPE, IMAGE_GROUP_NODE_TYPE]);

function isGroupNodeType(type: string): boolean {
  return GROUP_NODE_TYPES.has(type);
}

function getNodeGroupId(element: CanvasNodeElement): string | null {
  const meta = element.meta as Record<string, unknown> | undefined;
  const groupId = meta?.groupId;
  return typeof groupId === "string" ? groupId : null;
}

function getGroupMemberIds(elements: CanvasElement[], groupId: string): string[] {
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

function normalizeSelectionIds(
  elements: CanvasElement[],
  selectedIds: string[]
): string[] {
  const elementMap = new Map(elements.map(element => [element.id, element]));
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

function expandSelectionWithGroupChildren(
  elements: CanvasElement[],
  selectedIds: string[]
): string[] {
  const elementMap = new Map(elements.map(element => [element.id, element]));
  const normalized = normalizeSelectionIds(elements, selectedIds);
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
  GROUP_OUTLINE_INSET,
  isGroupNodeType,
  getNodeGroupId,
  getGroupMemberIds,
  resolveGroupSelectionId,
  normalizeSelectionIds,
  expandSelectionWithGroupChildren,
};
