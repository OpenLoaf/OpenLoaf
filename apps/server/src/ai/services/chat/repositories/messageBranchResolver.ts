/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/** Minimal prisma chatMessage reader shape. */
type ChatMessageReader = {
  chatMessage: {
    findMany: (args: any) => Promise<any[]>;
  };
};

/** Minimal chain row for branch key resolving. */
type ChainPathRow = {
  id: string;
  path: string;
  parentMessageId: string | null;
};

/** Build root-to-leaf prefixes from a materialized path. */
export function getMessagePathPrefixes(pathValue: string): string[] {
  const normalizedPath = String(pathValue ?? "").trim();
  if (!normalizedPath) return [];
  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length === 0) return [];
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

/** Resolve stable branch key path from the current leaf path. */
export async function resolveBranchKeyFromLeafPath(
  prismaReader: ChatMessageReader,
  input: {
    /** Session id. */
    sessionId: string;
    /** Leaf message path in this session. */
    leafMessagePath: string;
  },
): Promise<string | null> {
  const prefixes = getMessagePathPrefixes(input.leafMessagePath);
  if (prefixes.length === 0) return null;

  const chainRows = (await prismaReader.chatMessage.findMany({
    where: { sessionId: input.sessionId, path: { in: prefixes } },
    orderBy: [{ path: "asc" }],
    select: { id: true, path: true, parentMessageId: true },
  })) as ChainPathRow[];
  if (chainRows.length === 0) return null;

  const rowByPath = new Map<string, ChainPathRow>();
  for (const row of chainRows) {
    const normalizedPath = String(row.path ?? "").trim();
    if (!normalizedPath) continue;
    rowByPath.set(normalizedPath, {
      id: String(row.id),
      path: normalizedPath,
      parentMessageId: row.parentMessageId ? String(row.parentMessageId) : null,
    });
  }

  const orderedRows = prefixes
    .map((prefix) => rowByPath.get(prefix))
    .filter((row): row is ChainPathRow => Boolean(row));
  if (orderedRows.length === 0) return null;

  const parentIds = Array.from(
    new Set(
      orderedRows
        .map((row) => row.parentMessageId)
        .filter((parentId): parentId is string => Boolean(parentId)),
    ),
  );

  const siblingCountByParentId = new Map<string, number>();
  if (parentIds.length > 0) {
    const siblingRows = (await prismaReader.chatMessage.findMany({
      where: { sessionId: input.sessionId, parentMessageId: { in: parentIds } },
      select: { parentMessageId: true },
    })) as Array<{ parentMessageId: string | null }>;

    for (const row of siblingRows) {
      const parentId = String(row.parentMessageId ?? "").trim();
      if (!parentId) continue;
      siblingCountByParentId.set(parentId, (siblingCountByParentId.get(parentId) ?? 0) + 1);
    }
  }

  // 逻辑：默认落在主链根节点；若路径上出现分叉点，则使用最靠近叶子的分叉子节点。
  let branchKeyPath = orderedRows[0]?.path ?? null;
  for (const row of orderedRows) {
    const parentId = String(row.parentMessageId ?? "").trim();
    if (!parentId) continue;
    if ((siblingCountByParentId.get(parentId) ?? 0) > 1) {
      branchKeyPath = row.path;
    }
  }
  return branchKeyPath;
}
