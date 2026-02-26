/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { promises as fs } from "node:fs";
import { readSummaryIndex, readSummaryMarkdown } from "@openloaf/api/services/summaryStorage";
import { formatDateKey, listDateKeysInRange, parseDateKey, startOfDay, endOfDay } from "@openloaf/api/services/summaryDateUtils";
import { getProjectGitCommitsInRange } from "@openloaf/api/services/projectGitService";
import { listProjectFilesChangedInRange } from "@openloaf/api/services/projectFileChangeService";
import type { TaskStatusRepository } from "@/ai/services/summary/TaskStatusRepository";
import { SummaryDayUseCase } from "@/ai/services/summary/SummaryDayUseCase";
import { SummaryProjectUseCase } from "@/ai/services/summary/SummaryProjectUseCase";
import { UpdateProjectSummaryUseCase } from "@/ai/services/summary/UpdateProjectSummaryUseCase";
import {
  createSchedulerTaskRecord,
  updateSchedulerTaskRecord,
} from "@openloaf/api/services/schedulerTaskRecordService";

type SummaryTaskInput = {
  /** Task id. */
  taskId: string;
  /** Project id. */
  projectId: string;
  /** Workspace id (optional). */
  workspaceId?: string;
  /** Project root path. */
  rootPath: string;
  /** Task time. */
  now: Date;
  /** Trigger source. */
  triggeredBy: "scheduler" | "manual" | "external";
  /** Force run a specific day. */
  forceDateKey?: string;
  /** IANA timezone id. */
  timezone: string;
};

export class BackgroundTaskService {
  constructor(
    private readonly taskStatusRepo: TaskStatusRepository,
    private readonly summaryDayUseCase: SummaryDayUseCase,
    private readonly summaryProjectUseCase: SummaryProjectUseCase,
    private readonly updateProjectSummaryUseCase: UpdateProjectSummaryUseCase,
  ) {}

  /** Execute background summary task. */
  async run(input: SummaryTaskInput): Promise<void> {
    await this.taskStatusRepo.upsertStatus({
      taskId: input.taskId,
      status: "running",
      metadata: { projectId: input.projectId, workspaceId: input.workspaceId },
    });

    try {
      const summaryRecords = await readSummaryIndex(input.rootPath);
      const successRecords = summaryRecords.filter((record) => record.status === "success");
      const summaryDates = new Set<string>();
      for (const record of successRecords) {
        for (const date of record.dates ?? []) {
          summaryDates.add(date);
        }
      }

      const lastSummaryMeta = await resolveLatestSummaryMeta(successRecords);
      const lastSummaryAt = lastSummaryMeta?.updatedAt ?? lastSummaryMeta?.createdAt;
      const lastSummaryTime = lastSummaryAt ? new Date(lastSummaryAt) : null;

      const taskPlan = buildTaskPlan({
        forceDateKey: input.forceDateKey,
        now: input.now,
        lastSummaryTime,
      });

      await createSchedulerTaskRecord({
        id: input.taskId,
        projectId: input.projectId,
        workspaceId: input.workspaceId ?? null,
        type: taskPlan.type,
        dates: taskPlan.dates,
        status: "running",
        triggeredBy: input.triggeredBy,
      });

      if (!input.forceDateKey) {
        const dateRange = resolveTaskDateRange(taskPlan, input.now);
        if (dateRange) {
          const hasChanges = await checkProjectHasChanges({
            projectId: input.projectId,
            from: dateRange.from,
            to: dateRange.to,
          });
          // 逻辑：定时触发且无任何变更时直接跳过，避免重复总结。
          if (!hasChanges) {
            await updateSchedulerTaskRecord({
              id: input.taskId,
              status: "success",
            });
            await this.taskStatusRepo.upsertStatus({
              taskId: input.taskId,
              status: "completed",
              metadata: { projectId: input.projectId, workspaceId: input.workspaceId },
            });
            return;
          }
        }
      }

      if (input.forceDateKey) {
        // 逻辑：手动指定日期时强制覆盖该日总结。
        const result = await this.summaryDayUseCase.execute({
          projectId: input.projectId,
          dateKey: input.forceDateKey,
          triggeredBy: input.triggeredBy,
          timezone: input.timezone,
        });
        await this.updateProjectSummaryUseCase.execute({
          projectId: input.projectId,
          sourceSummary: result.content,
          triggeredBy: input.triggeredBy,
        });
      } else if (taskPlan.type === "summary-range" && taskPlan.dates?.length) {
        const dates = taskPlan.dates;
        const [firstDate] = dates;
        if (!firstDate) {
          throw new Error("缺少汇总日期范围");
        }
        // 逻辑：超过五天未汇总时走一次性汇总，覆盖整个日期范围。
        const result = await this.summaryProjectUseCase.execute({
          projectId: input.projectId,
          dates,
          from: startOfDay(parseDateKey(firstDate)),
          to: input.now,
          triggeredBy: input.triggeredBy,
          timezone: input.timezone,
        });
        await this.updateProjectSummaryUseCase.execute({
          projectId: input.projectId,
          sourceSummary: result.content,
          triggeredBy: input.triggeredBy,
        });
      } else {
        const startTime = lastSummaryTime ?? input.now;
        const dateKeys = listDateKeysInRange(startTime, input.now);
        const todayKey = formatDateKey(input.now);
        for (const dateKey of dateKeys) {
          if (summaryDates.has(dateKey) && dateKey !== todayKey) {
            continue;
          }
          const previousSummary =
            summaryDates.has(dateKey) && dateKey === todayKey
              ? await findLatestSummaryContent(successRecords, dateKey)
              : undefined;
          // 逻辑：当天已汇总则基于已有内容增量更新。
          const result = await this.summaryDayUseCase.execute({
            projectId: input.projectId,
            dateKey,
            triggeredBy: input.triggeredBy,
            timezone: input.timezone,
            previousSummary,
          });
          await this.updateProjectSummaryUseCase.execute({
            projectId: input.projectId,
            sourceSummary: result.content,
            triggeredBy: input.triggeredBy,
          });
        }
      }

      await updateSchedulerTaskRecord({
        id: input.taskId,
        status: "success",
      });
      await this.taskStatusRepo.upsertStatus({
        taskId: input.taskId,
        status: "completed",
        metadata: { projectId: input.projectId, workspaceId: input.workspaceId },
      });
    } catch (err) {
      await updateSchedulerTaskRecord({
        id: input.taskId,
        status: "failed",
        error: err instanceof Error ? err.message : "unknown error",
      });
      await this.taskStatusRepo.upsertStatus({
        taskId: input.taskId,
        status: "failed",
        metadata: {
          projectId: input.projectId,
          workspaceId: input.workspaceId,
          error: err instanceof Error ? err.message : "unknown error",
        },
      });
      throw err;
    }
  }
}

type SummaryMeta = {
  createdAt?: string;
  updatedAt?: string;
};

/** Resolve latest summary metadata from index records. */
async function resolveLatestSummaryMeta(
  records: Array<{ filePath: string }>,
): Promise<SummaryMeta | null> {
  const record = records.at(-1);
  if (!record?.filePath) return null;
  const parsed = await readSummaryMarkdown(record.filePath);
  if (parsed.frontmatter?.updatedAt || parsed.frontmatter?.createdAt) {
    return {
      createdAt: parsed.frontmatter?.createdAt,
      updatedAt: parsed.frontmatter?.updatedAt,
    };
  }
  try {
    const stat = await fs.stat(record.filePath);
    return { updatedAt: stat.mtime.toISOString() };
  } catch {
    return null;
  }
}

/** Read latest summary content for a date key. */
async function findLatestSummaryContent(
  records: Array<{ filePath: string; dates: string[] }>,
  dateKey: string,
): Promise<string | undefined> {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (!record?.dates?.includes(dateKey)) continue;
    const parsed = await readSummaryMarkdown(record.filePath);
    return parsed.content?.trim() || undefined;
  }
  return undefined;
}

type TaskPlan = {
  type: "summary-day" | "summary-range";
  dates?: string[];
};

/** Build summary task plan based on time window. */
function buildTaskPlan(input: {
  forceDateKey?: string;
  now: Date;
  lastSummaryTime: Date | null;
}): TaskPlan {
  if (input.forceDateKey) {
    return { type: "summary-day", dates: [input.forceDateKey] };
  }
  if (input.lastSummaryTime) {
    const diff = input.now.getTime() - input.lastSummaryTime.getTime();
    if (diff > 5 * 24 * 60 * 60 * 1000) {
      const dates = listDateKeysInRange(input.lastSummaryTime, input.now);
      return {
        type: "summary-range",
        dates,
      };
    }
  }
  const start = input.lastSummaryTime ?? input.now;
  const dates = listDateKeysInRange(start, input.now);
  return {
    type: "summary-day",
    dates,
  };
}

/** Resolve task date range for change detection. */
function resolveTaskDateRange(taskPlan: TaskPlan, now: Date): { from: Date; to: Date } | null {
  const dates = taskPlan.dates ?? [];
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  if (!firstDate || !lastDate) return null;
  const from = startOfDay(parseDateKey(firstDate));
  const todayKey = formatDateKey(now);
  const to = lastDate === todayKey ? now : endOfDay(parseDateKey(lastDate));
  return { from, to };
}

/** Check whether project has changes in the given range. */
async function checkProjectHasChanges(input: {
  projectId: string;
  from: Date;
  to: Date;
}): Promise<boolean> {
  const commits = await getProjectGitCommitsInRange({
    projectId: input.projectId,
    from: input.from,
    to: input.to,
  });
  if (commits.length) return true;
  const fileChanges = await listProjectFilesChangedInRange({
    projectId: input.projectId,
    from: input.from,
    to: input.to,
  });
  return fileChanges.length > 0;
}
