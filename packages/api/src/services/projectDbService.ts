/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ProjectNode } from "./projectTreeService";
import { readProjectTrees } from "./projectTreeService";

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
        title: string;
        icon: string | null;
        rootUri: string;
        parentId: string | null;
        sortIndex: number;
        isFavorite: boolean;
        type: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
      };
      update: {
        title: string;
        icon: string | null;
        rootUri: string;
        parentId: string | null;
        sortIndex: number;
        isFavorite: boolean;
        type: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
      };
    }) => Promise<unknown>;
    updateMany: (args: {
      where: {
        isDeleted: boolean;
        id?: { notIn: string[] };
      };
      data: { isDeleted: boolean; deletedAt: Date | null };
    }) => Promise<unknown>;
    findMany: (args: {
      where: { isDeleted: boolean };
      select: { id: true; title: true };
    }) => Promise<Array<{ id: string; title: string }>>;
  };
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  $transaction: <T>(operations: Promise<T>[]) => Promise<T[]>;
};

type ProjectRecord = {
  id: string;
  title: string;
  icon: string | null;
  rootUri: string;
  parentId: string | null;
  sortIndex: number;
  isFavorite: boolean;
  type: string | null;
};

/** Flatten project tree nodes into records for persistence. */
function flattenProjectTrees(projects: ProjectNode[]): ProjectRecord[] {
  const records: ProjectRecord[] = [];
  const stack: Array<{
    node: ProjectNode;
    parentId: string | null;
    sortIndex: number;
  }> = projects.map((node, index) => ({
    node,
    parentId: null,
    sortIndex: index,
  }));
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    records.push({
      id: current.node.projectId,
      title: current.node.title,
      icon: current.node.icon ?? null,
      rootUri: current.node.rootUri,
      parentId: current.parentId,
      sortIndex: current.sortIndex,
      isFavorite: current.node.isFavorite ?? false,
      type: current.node.projectType?.trim() || null,
    });
    for (const [index, child] of (current.node.children ?? []).entries()) {
      stack.push({
        node: child,
        parentId: current.node.projectId,
        sortIndex: index,
      });
    }
  }
  return records;
}

/** Sync projects from project.json into database. */
export async function syncProjectsFromDisk(
  prisma: ProjectDbClient,
  projectTrees?: ProjectNode[],
): Promise<ProjectRecord[]> {
  const trees = projectTrees ?? (await readProjectTrees({ includeTemporary: true }));
  const records = flattenProjectTrees(trees);
  const recordIds = records.map((record) => record.id);
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
        sortIndex: record.sortIndex,
        isFavorite: record.isFavorite,
        type: record.type,
        isDeleted: false,
        deletedAt: null,
      },
    })
  );
  const deleteWhere = recordIds.length
    ? { isDeleted: false as const, id: { notIn: recordIds } }
    : { isDeleted: false as const };
  const softDelete = prisma.project.updateMany({
    where: deleteWhere,
    data: { isDeleted: true, deletedAt: new Date() },
  });
  await prisma.$transaction([...upserts, softDelete]);
  return records;
}

/** Build projectId -> title map from database. */
export async function getProjectTitleMap(
  prisma: ProjectDbClient,
): Promise<Map<string, string>> {
  const rows = await prisma.project.findMany({
    where: { isDeleted: false },
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
  const maxDepth = 64;
  // 使用递归 CTE 一次性向上查询，避免逐级 N+1 查询。
  const rows = await prisma.$queryRaw<Array<{ rootUri: string | null }>>`
    WITH RECURSIVE ancestors(id, rootUri, parentId, depth) AS (
      SELECT id, rootUri, parentId, 0
      FROM Project
      WHERE id = ${normalizedId} AND isDeleted = 0
      UNION ALL
      SELECT p.id, p.rootUri, p.parentId, a.depth + 1
      FROM Project p
      JOIN ancestors a ON p.id = TRIM(a.parentId)
      WHERE p.isDeleted = 0
        AND a.parentId IS NOT NULL
        AND TRIM(a.parentId) != ''
        AND a.depth < ${maxDepth}
    )
    SELECT rootUri
    FROM ancestors
    WHERE depth > 0 AND rootUri IS NOT NULL;
  `;
  return rows.flatMap((row) => (row.rootUri ? [row.rootUri] : []));
}

/** Resolve ancestor project IDs (excluding self) from database. */
export async function resolveProjectAncestorIds(
  prisma: ProjectDbClient,
  projectId: string,
): Promise<string[]> {
  const normalizedId = projectId.trim();
  if (!normalizedId) return [];
  const maxDepth = 64;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE ancestors(id, parentId, depth) AS (
      SELECT id, parentId, 0
      FROM Project
      WHERE id = ${normalizedId} AND isDeleted = 0
      UNION ALL
      SELECT p.id, p.parentId, a.depth + 1
      FROM Project p
      JOIN ancestors a ON p.id = TRIM(a.parentId)
      WHERE p.isDeleted = 0
        AND a.parentId IS NOT NULL
        AND TRIM(a.parentId) != ''
        AND a.depth < ${maxDepth}
    )
    SELECT id
    FROM ancestors
    WHERE depth > 0;
  `;
  return rows.map((row) => row.id);
}
