import type { ProjectNode } from "@tenas-ai/api/services/projectTreeService";

export type ProjectHierarchyIndex = {
  /** Project node by id. */
  projectById: Map<string, ProjectNode>;
  /** Parent id by project id. */
  parentById: Map<string, string | null>;
  /** Descendant ids by project id. */
  descendantsById: Map<string, Set<string>>;
  /** Root uri by project id. */
  rootUriById: Map<string, string>;
  /** Project id by root uri. */
  projectIdByRootUri: Map<string, string>;
};

/** Build lookup maps for project hierarchy. */
export function buildProjectHierarchyIndex(projects: ProjectNode[]): ProjectHierarchyIndex {
  const projectById = new Map<string, ProjectNode>();
  const parentById = new Map<string, string | null>();
  const descendantsById = new Map<string, Set<string>>();
  const rootUriById = new Map<string, string>();
  const projectIdByRootUri = new Map<string, string>();

  /** Collect descendants for a project node. */
  const collect = (node: ProjectNode, parentId: string | null): Set<string> => {
    projectById.set(node.projectId, node);
    parentById.set(node.projectId, parentId);
    rootUriById.set(node.projectId, node.rootUri);
    if (node.rootUri) {
      projectIdByRootUri.set(node.rootUri, node.projectId);
    }

    // 逻辑：递归收集子项目 id，用于过滤和拖拽校验。
    const descendants = new Set<string>();
    for (const child of node.children ?? []) {
      descendants.add(child.projectId);
      const childDescendants = collect(child, node.projectId);
      for (const id of childDescendants) {
        descendants.add(id);
      }
    }
    descendantsById.set(node.projectId, descendants);
    return descendants;
  };

  for (const project of projects ?? []) {
    collect(project, null);
  }

  return {
    projectById,
    parentById,
    descendantsById,
    rootUriById,
    projectIdByRootUri,
  };
}

/** Filter project tree by removing excluded project ids. */
export function filterProjectTree(
  projects: ProjectNode[],
  excludedIds: Set<string>,
): ProjectNode[] {
  /** Filter nodes by excluded ids. */
  const filterNodes = (nodes: ProjectNode[]): ProjectNode[] => {
    const result: ProjectNode[] = [];
    for (const node of nodes ?? []) {
      if (excludedIds.has(node.projectId)) continue;
      const nextChildren = filterNodes(node.children ?? []);
      result.push({ ...node, children: nextChildren });
    }
    return result;
  };

  return filterNodes(projects ?? []);
}
