/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { randomUUID } from "node:crypto";
import {
  BaseCalendarRouter,
  calendarSchemas,
  shieldedProcedure,
  t,
} from "@openloaf/api";
import { resolveProjectAncestorIds } from "@openloaf/api/services/projectDbService";

type CalendarSourceRow = {
  id: string;
  workspaceId: string;
  provider: string;
  kind: string;
  externalId: string | null;
  title: string;
  color: string | null;
  readOnly: boolean;
  isSubscribed: boolean;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type CalendarItemRow = {
  id: string;
  workspaceId: string;
  sourceId: string;
  kind: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  recurrenceRule: unknown | null;
  completedAt: Date | null;
  externalId: string | null;
  sourceUpdatedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type CalendarItemView = {
  id: string;
  workspaceId: string;
  sourceId: string;
  kind: "event" | "reminder";
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  recurrenceRule: unknown | null;
  completedAt: string | null;
  externalId: string | null;
  sourceUpdatedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Build calendar source response payload. */
function toCalendarSourceView(row: CalendarSourceRow) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider,
    kind: row.kind,
    externalId: row.externalId,
    title: row.title,
    color: row.color,
    readOnly: row.readOnly,
    isSubscribed: row.isSubscribed,
    projectId: row.projectId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Build calendar item response payload. */
function toCalendarItemView(row: CalendarItemRow): CalendarItemView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sourceId: row.sourceId,
    kind: row.kind === "reminder" ? "reminder" : "event",
    title: row.title,
    description: row.description,
    location: row.location,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    allDay: row.allDay,
    recurrenceRule: row.recurrenceRule ?? null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    externalId: row.externalId,
    sourceUpdatedAt: row.sourceUpdatedAt ? row.sourceUpdatedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Ensure calendar source is writable for user operations. */
async function assertWritableSource(input: {
  prisma: any;
  workspaceId: string;
  sourceId: string;
}) {
  const source = await input.prisma.calendarSource.findFirst({
    where: { id: input.sourceId, workspaceId: input.workspaceId },
  });
  if (!source) throw new Error("Calendar source not found.");
  if (source.readOnly || source.isSubscribed) {
    throw new Error("Calendar source is read-only.");
  }
  return source as CalendarSourceRow;
}

/** Resolve project-scoped filter for CalendarSource.projectId. */
async function resolveVisibleSourceFilter(
  prisma: any,
  workspaceId: string,
  projectId?: string,
): Promise<{ OR: object[] } | undefined> {
  if (!projectId) return undefined;
  const ancestorIds = await resolveProjectAncestorIds(prisma, projectId);
  return {
    OR: [
      { projectId: null },
      { projectId: { in: [projectId, ...ancestorIds] } },
    ],
  };
}

export class CalendarRouterImpl extends BaseCalendarRouter {
  /** Define calendar router implementation. */
  public static createRouter() {
    return t.router({
      listSources: shieldedProcedure
        .input(calendarSchemas.listSources.input)
        .output(calendarSchemas.listSources.output)
        .query(async ({ input, ctx }) => {
          const projectFilter = await resolveVisibleSourceFilter(
            ctx.prisma,
            input.workspaceId,
            input.projectId,
          );
          let rows = await ctx.prisma.calendarSource.findMany({
            where: { workspaceId: input.workspaceId, ...projectFilter },
            orderBy: { title: "asc" },
          });
          if (rows.length === 0 && !input.projectId) {
            // 逻辑：首次进入时自动创建本地日历与提醒事项源。
            const created = await ctx.prisma.$transaction([
              ctx.prisma.calendarSource.create({
                data: {
                  id: randomUUID(),
                  workspaceId: input.workspaceId,
                  provider: "local",
                  kind: "calendar",
                  externalId: null,
                  title: "本地日历",
                  color: "#60A5FA",
                  readOnly: false,
                  isSubscribed: false,
                  projectId: null,
                },
              }),
              ctx.prisma.calendarSource.create({
                data: {
                  id: randomUUID(),
                  workspaceId: input.workspaceId,
                  provider: "local",
                  kind: "reminder",
                  externalId: null,
                  title: "本地提醒事项",
                  color: "#FBBF24",
                  readOnly: false,
                  isSubscribed: false,
                  projectId: null,
                },
              }),
            ]);
            rows = created;
          }
          return rows.map(toCalendarSourceView);
        }),

      listItems: shieldedProcedure
        .input(calendarSchemas.listItems.input)
        .output(calendarSchemas.listItems.output)
        .query(async ({ input, ctx }) => {
          const rangeStart = new Date(input.range.start);
          const rangeEnd = new Date(input.range.end);
          // 逻辑：有 projectId 时先查可见 sourceId 集合，再取交集过滤。
          let visibleSourceIds: string[] | undefined;
          if (input.projectId) {
            const projectFilter = await resolveVisibleSourceFilter(
              ctx.prisma,
              input.workspaceId,
              input.projectId,
            );
            const sources = await ctx.prisma.calendarSource.findMany({
              where: { workspaceId: input.workspaceId, ...projectFilter },
              select: { id: true },
            });
            visibleSourceIds = sources.map((s: { id: string }) => s.id);
          }
          const sourceIdFilter = (() => {
            if (input.sourceIds?.length && visibleSourceIds) {
              const intersection = input.sourceIds.filter((id: string) =>
                visibleSourceIds!.includes(id),
              );
              return { sourceId: { in: intersection } };
            }
            if (input.sourceIds?.length) return { sourceId: { in: input.sourceIds } };
            if (visibleSourceIds) return { sourceId: { in: visibleSourceIds } };
            return {};
          })();
          const rows = await ctx.prisma.calendarItem.findMany({
            where: {
              workspaceId: input.workspaceId,
              deletedAt: null,
              ...sourceIdFilter,
              AND: [
                { startAt: { lte: rangeEnd } },
                { endAt: { gte: rangeStart } },
              ],
            },
            orderBy: { startAt: "asc" },
          });
          return rows.map(toCalendarItemView);
        }),

      createItem: shieldedProcedure
        .input(calendarSchemas.createItem.input)
        .output(calendarSchemas.createItem.output)
        .mutation(async ({ input, ctx }) => {
          const item = input.item;
          // 逻辑：验证目标 source 对当前项目可见。
          if (input.projectId) {
            const projectFilter = await resolveVisibleSourceFilter(
              ctx.prisma,
              input.workspaceId,
              input.projectId,
            );
            if (projectFilter) {
              const source = await ctx.prisma.calendarSource.findFirst({
                where: {
                  id: item.sourceId,
                  workspaceId: input.workspaceId,
                  ...projectFilter,
                },
              });
              if (!source) {
                throw new Error("Calendar source is not visible in this project.");
              }
            }
          }
          await assertWritableSource({
            prisma: ctx.prisma,
            workspaceId: input.workspaceId,
            sourceId: item.sourceId,
          });
          const created = await ctx.prisma.calendarItem.create({
            data: {
              id: item.id ?? randomUUID(),
              workspaceId: input.workspaceId,
              sourceId: item.sourceId,
              kind: item.kind,
              title: item.title,
              description: item.description ?? null,
              location: item.location ?? null,
              startAt: new Date(item.startAt),
              endAt: new Date(item.endAt),
              allDay: item.allDay,
              recurrenceRule: item.recurrenceRule ?? null,
              completedAt: item.completedAt ? new Date(item.completedAt) : null,
              externalId: item.externalId ?? null,
              sourceUpdatedAt: item.sourceUpdatedAt
                ? new Date(item.sourceUpdatedAt)
                : null,
            },
          });
          return toCalendarItemView(created);
        }),

      updateItem: shieldedProcedure
        .input(calendarSchemas.updateItem.input)
        .output(calendarSchemas.updateItem.output)
        .mutation(async ({ input, ctx }) => {
          const item = input.item;
          const existing = await ctx.prisma.calendarItem.findFirst({
            where: { id: item.id, workspaceId: input.workspaceId },
          });
          if (!existing) {
            throw new Error("Calendar item not found.");
          }
          await assertWritableSource({
            prisma: ctx.prisma,
            workspaceId: input.workspaceId,
            sourceId: item.sourceId,
          });
          const updated = await ctx.prisma.calendarItem.update({
            where: { id: item.id },
            data: {
              sourceId: item.sourceId,
              kind: item.kind,
              title: item.title,
              description: item.description ?? null,
              location: item.location ?? null,
              startAt: new Date(item.startAt),
              endAt: new Date(item.endAt),
              allDay: item.allDay,
              recurrenceRule: item.recurrenceRule ?? null,
              completedAt: item.completedAt ? new Date(item.completedAt) : null,
              externalId: item.externalId ?? null,
              sourceUpdatedAt: item.sourceUpdatedAt
                ? new Date(item.sourceUpdatedAt)
                : null,
              deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
            },
          });
          return toCalendarItemView(updated);
        }),

      deleteItem: shieldedProcedure
        .input(calendarSchemas.deleteItem.input)
        .output(calendarSchemas.deleteItem.output)
        .mutation(async ({ input, ctx }) => {
          const updated = await ctx.prisma.calendarItem.updateMany({
            where: { id: input.id, workspaceId: input.workspaceId },
            data: { deletedAt: new Date() },
          });
          if (updated.count === 0) {
            throw new Error("Calendar item not found.");
          }
          return { id: input.id };
        }),

      toggleReminderCompleted: shieldedProcedure
        .input(calendarSchemas.toggleReminderCompleted.input)
        .output(calendarSchemas.toggleReminderCompleted.output)
        .mutation(async ({ input, ctx }) => {
          const existing = await ctx.prisma.calendarItem.findFirst({
            where: { id: input.id, workspaceId: input.workspaceId },
          });
          if (!existing) {
            throw new Error("Calendar item not found.");
          }
          const updated = await ctx.prisma.calendarItem.update({
            where: { id: input.id },
            data: {
              completedAt: input.completed ? new Date() : null,
            },
          });
          return toCalendarItemView(updated);
        }),

      syncFromSystem: shieldedProcedure
        .input(calendarSchemas.syncFromSystem.input)
        .output(calendarSchemas.syncFromSystem.output)
        .mutation(async ({ input, ctx }) => {
          const now = new Date();
          const rangeStart = new Date(input.range.start);
          const rangeEnd = new Date(input.range.end);

          const sourceOps = input.sources.map((source) => {
            const externalId = source.externalId ?? "";
            if (!externalId) {
              throw new Error("Calendar source externalId is required.");
            }
            return ctx.prisma.calendarSource.upsert({
              where: {
                workspaceId_provider_kind_externalId: {
                  workspaceId: input.workspaceId,
                  provider: input.provider,
                  kind: source.kind,
                  externalId,
                },
              },
              create: {
                id: randomUUID(),
                workspaceId: input.workspaceId,
                provider: input.provider,
                kind: source.kind,
                externalId,
                title: source.title,
                color: source.color ?? null,
                readOnly: source.readOnly ?? false,
                isSubscribed: source.isSubscribed ?? false,
              },
              update: {
                title: source.title,
                color: source.color ?? null,
                readOnly: source.readOnly ?? false,
                isSubscribed: source.isSubscribed ?? false,
              },
            });
          });

          const sources = await ctx.prisma.$transaction(sourceOps);
          const sourceIdByExternalId = new Map<string, string>();
          for (const source of sources) {
            const key = `${source.kind}:${source.externalId ?? ""}`;
            sourceIdByExternalId.set(key, source.id);
          }

          const itemOps = input.items.flatMap((item) => {
            if (!item.externalId) return [];
            const sourceKey = `${item.kind === "reminder" ? "reminder" : "calendar"}:${item.calendarId ?? ""}`;
            const sourceId = sourceIdByExternalId.get(sourceKey);
            if (!sourceId) return [];
            const completedAt = item.completed ? now : null;
            return [
              ctx.prisma.calendarItem.upsert({
                where: {
                  workspaceId_sourceId_externalId: {
                    workspaceId: input.workspaceId,
                    sourceId,
                    externalId: item.externalId,
                  },
                },
                create: {
                  id: randomUUID(),
                  workspaceId: input.workspaceId,
                  sourceId,
                  kind: item.kind,
                  title: item.title,
                  description: item.description ?? null,
                  location: item.location ?? null,
                  startAt: new Date(item.startAt),
                  endAt: new Date(item.endAt),
                  allDay: item.allDay,
                  recurrenceRule: item.recurrenceRule ?? null,
                  completedAt,
                  externalId: item.externalId,
                  sourceUpdatedAt: item.sourceUpdatedAt
                    ? new Date(item.sourceUpdatedAt)
                    : now,
                },
                update: {
                  kind: item.kind,
                  title: item.title,
                  description: item.description ?? null,
                  location: item.location ?? null,
                  startAt: new Date(item.startAt),
                  endAt: new Date(item.endAt),
                  allDay: item.allDay,
                  recurrenceRule: item.recurrenceRule ?? null,
                  completedAt,
                  sourceUpdatedAt: item.sourceUpdatedAt
                    ? new Date(item.sourceUpdatedAt)
                    : now,
                  deletedAt: null,
                },
              }),
            ];
          });

          if (itemOps.length > 0) {
            await ctx.prisma.$transaction(itemOps);
          }

          const externalIds = input.items
            .map((item) => item.externalId)
            .filter((id): id is string => Boolean(id));
          const sourceIds = sources.map((source) => source.id);

          if (sourceIds.length > 0) {
            await ctx.prisma.calendarItem.updateMany({
              where: {
                workspaceId: input.workspaceId,
                sourceId: { in: sourceIds },
                deletedAt: null,
                externalId:
                  externalIds.length > 0 ? { notIn: externalIds } : { not: null },
                AND: [
                  { startAt: { lte: rangeEnd } },
                  { endAt: { gte: rangeStart } },
                ],
              },
              data: { deletedAt: now },
            });
          }

          return { ok: true, sources: sources.length, items: itemOps.length };
        }),
    });
  }
}

export const calendarRouterImplementation = CalendarRouterImpl.createRouter();
