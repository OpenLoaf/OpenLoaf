/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { prisma } from "@openloaf/db";
import type { Prisma } from "@openloaf/db/prisma/generated/client";

export type SchedulerTaskRecordInput = {
  /** Task id. */
  id: string;
  /** Project id. */
  projectId: string;
  /** Workspace id. */
  workspaceId?: string | null;
  /** Task type. */
  type: string;
  /** Target dates. */
  dates?: string[] | null;
  /** Payload for related records. */
  payload?: Prisma.InputJsonValue | null;
  /** Task status. */
  status: string;
  /** Trigger source. */
  triggeredBy: string;
  /** Error message. */
  error?: string | null;
};

export type SchedulerTaskRecordListInput = {
  /** Project id filter. */
  projectId?: string;
  /** Workspace id filter. */
  workspaceId?: string;
  /** Status filter list. */
  statuses?: string[];
  /** Page number (1-based). */
  page?: number;
  /** Page size. */
  pageSize?: number;
};

/** Create a scheduler task record. */
export async function createSchedulerTaskRecord(
  input: SchedulerTaskRecordInput,
): Promise<void> {
  const dates = input.dates ?? undefined;
  const payload = input.payload ?? undefined;
  await prisma.schedulerTaskRecord.create({
    data: {
      id: input.id,
      projectId: input.projectId,
      workspaceId: input.workspaceId ?? null,
      type: input.type,
      dates,
      payload,
      status: input.status,
      triggeredBy: input.triggeredBy,
      error: input.error ?? null,
    },
  });
}

/** Update scheduler task record status. */
export async function updateSchedulerTaskRecord(input: {
  id: string;
  status: string;
  error?: string | null;
}): Promise<void> {
  await prisma.schedulerTaskRecord.update({
    where: { id: input.id },
    data: {
      status: input.status,
      error: input.error ?? null,
    },
  });
}

/** List scheduler task records. */
export async function listSchedulerTaskRecords(input: SchedulerTaskRecordListInput) {
  const where: Record<string, unknown> = {};
  if (input.projectId) where.projectId = input.projectId;
  if (input.workspaceId) where.workspaceId = input.workspaceId;
  if (Array.isArray(input.statuses) && input.statuses.length) {
    where.status = { in: input.statuses };
  }
  const pageSize =
    typeof input.pageSize === "number" && input.pageSize > 0 ? input.pageSize : 20;
  const page = typeof input.page === "number" && input.page > 0 ? input.page : 1;
  const skip = (page - 1) * pageSize;
  const [total, items] = await prisma.$transaction([
    prisma.schedulerTaskRecord.count({ where }),
    prisma.schedulerTaskRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);
  return { total, items, page, pageSize };
}
