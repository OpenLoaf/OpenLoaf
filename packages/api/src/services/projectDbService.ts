import type { ProjectNode } from "./projectTreeService";
import { readWorkspaceProjectTrees } from "./projectTreeService";

export type ProjectDbClient = {
  project: {
    /** Find a project record by filter. */
    findFirst: (args: {
      where: { id: string; isDeleted: boolean };
      select: { id: true; rootUri: true; parentId: true };
    }) => Promise<{ id: string; rootUri: string; parentId: string | null } | null>;
    upsert: (args: {
      where: { id: string };
      create: {
        id: string;
        workspaceId: string;
        title: string;
        icon: string | null;
        rootUri: string;
        parentId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
      };
      update: {
        title: string;
        icon: string | null;
        rootUri: string;
        parentId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
      };
    }) => Promise<unknown>;
    updateMany: (args: {
      where: {
        workspaceId: string;
        isDeleted: boolean;
        id?: { notIn: string[] };
      };
      data: { isDeleted: boolean; deletedAt: Date | null };
    }) => Promise<unknown>;
    findMany: (args: {
      where: { workspaceId: string; isDeleted: boolean };
      select: { id: true; title: true };
    }) => Promise<Array<{ id: string; title: string }>>;
  };
  $transaction: <T>(operations: Promise<T>[]) => Promise<T[]>;
};

type ProjectRecord = {
  id: string;
  workspaceId: string;
  title: string;
  icon: string | null;
  rootUri: string;
  parentId: string | null;
};

/** Flatten project tree nodes into records for persistence. */
function flattenProjectTrees(projects: ProjectNode[], workspaceId: string): ProjectRecord[] {
  const records: ProjectRecord[] = [];
  const stack: Array<{ node: ProjectNode; parentId: string | null }> = projects.map(
    (node) => ({ node, parentId: null })
  );
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    records.push({
      id: current.node.projectId,
      workspaceId,
      title: current.node.title,
      icon: current.node.icon ?? null,
      rootUri: current.node.rootUri,
      parentId: current.parentId,
    });
    for (const child of current.node.children ?? []) {
      stack.push({ node: child, parentId: current.node.projectId });
    }
  }
  return records;
}

/** Sync workspace projects from project.json into database. */
export async function syncWorkspaceProjectsFromDisk(
  prisma: ProjectDbClient,
  workspaceId: string,
  projectTrees?: ProjectNode[],
): Promise<ProjectRecord[]> {
  const trees = projectTrees ?? (await readWorkspaceProjectTrees(workspaceId));
  const records = flattenProjectTrees(trees, workspaceId);
  const recordIds = records.map((record) => record.id);
  // 逻辑：以文件为主，先 upsert，再软删除缺失项目。
  const upserts = records.map((record) =>
    prisma.project.upsert({
      where: { id: record.id },
      create: {
        ...record,
        isDeleted: false,
        deletedAt: null,
      },
      update: {
        title: record.title,
        icon: record.icon,
        rootUri: record.rootUri,
        parentId: record.parentId,
        isDeleted: false,
        deletedAt: null,
      },
    })
  );
  const deleteWhere = recordIds.length
    ? { workspaceId, isDeleted: false, id: { notIn: recordIds } }
    : { workspaceId, isDeleted: false };
  const softDelete = prisma.project.updateMany({
    where: deleteWhere,
    data: { isDeleted: true, deletedAt: new Date() },
  });
  await prisma.$transaction([...upserts, softDelete]);
  return records;
}

/** Build projectId -> title map from database. */
export async function getWorkspaceProjectTitleMap(
  prisma: ProjectDbClient,
  workspaceId: string,
): Promise<Map<string, string>> {
  const rows = await prisma.project.findMany({
    where: { workspaceId, isDeleted: false },
    select: { id: true, title: true },
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.id, row.title);
  }
  return map;
}

/** Resolve ancestor project root URIs from database. */
export async function resolveProjectAncestorRootUris(
  prisma: ProjectDbClient,
  projectId: string,
): Promise<string[]> {
  const normalizedId = projectId.trim();
  if (!normalizedId) return [];
  const ancestors: string[] = [];
  const visited = new Set<string>();
  let cursorId: string | null = normalizedId;
  let isFirst = true;

  // 逻辑：从当前项目向上追溯 parentId，收集父级 rootUri，直到顶层或出现循环。
  while (cursorId) {
    if (visited.has(cursorId)) break;
    visited.add(cursorId);
    const row = await prisma.project.findFirst({
      where: { id: cursorId, isDeleted: false },
      select: { id: true, rootUri: true, parentId: true },
    });
    if (!row) break;
    if (!isFirst && row.rootUri) ancestors.push(row.rootUri);
    isFirst = false;
    const nextParentId = row.parentId?.trim();
    if (!nextParentId) break;
    cursorId = nextParentId;
  }

  return ancestors;
}
