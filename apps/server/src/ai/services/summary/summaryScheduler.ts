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
  readWorkspaceProjectTrees,
  readProjectConfig,
  type ProjectNode,
} from "@openloaf/api/services/projectTreeService";
import { resolveFilePathFromUri, getProjectRootPath } from "@openloaf/api/services/vfsService";
import { getWorkspaces } from "@openloaf/api/services/workspaceConfig";
import { readBasicConf } from "@/modules/settings/openloafConfStore";
import { SummaryDayUseCase } from "@/ai/services/summary/SummaryDayUseCase";
import { SummaryProjectUseCase } from "@/ai/services/summary/SummaryProjectUseCase";
import { UpdateProjectSummaryUseCase } from "@/ai/services/summary/UpdateProjectSummaryUseCase";
import { BackgroundTaskService } from "@/ai/services/summary/BackgroundTaskService";
import { InMemoryTaskStatusRepository } from "@/ai/services/summary/repositories/InMemoryTaskStatusRepository";
import { InProcessSchedulerAdapter } from "@/ai/services/summary/SchedulerAdapters";
import { logger } from "@/common/logger";

export class SummaryScheduler {
  /** In-process scheduler adapter. */
  private readonly scheduler = new InProcessSchedulerAdapter();
  /** Task status repository. */
  private readonly taskStatus = new InMemoryTaskStatusRepository();
  /** Background task runner. */
  private readonly runner = new BackgroundTaskService(
    this.taskStatus,
    new SummaryDayUseCase(),
    new SummaryProjectUseCase(),
    new UpdateProjectSummaryUseCase(),
  );
  /** Track hourly scan state. */
  private isScanning = false;
  /** Last scan hour key to avoid duplicate runs. */
  private lastScanKey: string | null = null;

  /** Schedule all projects for auto summary. */
  async scheduleAll(): Promise<void> {
    logger.info("[summary] start hourly scan scheduling");
    // 逻辑：启动后先执行一次当前小时扫描。
    await this.runHourlyScan(true);
    await this.scheduleNextHourlyScan();
    logger.info("[summary] hourly scan scheduler registered");
  }

  /** Get task status repository. */
  getStatusRepo(): InMemoryTaskStatusRepository {
    return this.taskStatus;
  }

  /** Get background task runner. */
  getRunner(): BackgroundTaskService {
    return this.runner;
  }

  /** Schedule the next hourly scan job. */
  private async scheduleNextHourlyScan(): Promise<void> {
    const jobId = "summary:scan-hourly";
    const runAt = resolveNextHourlyScanAt();
    await this.scheduler.schedule({
      jobId,
      runAt,
      payload: () => {
        void this.runHourlyScan().finally(() => {
          void this.scheduleNextHourlyScan();
        });
      },
    });
  }

  /** Run hourly scan across all projects. */
  private async runHourlyScan(isStartup = false): Promise<void> {
    if (this.isScanning) {
      logger.info("[summary] hourly scan skipped: already running");
      return;
    }
    this.isScanning = true;
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const scanKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${currentHour}`;
      if (this.lastScanKey === scanKey) {
        logger.info(
          { hour: currentHour, isStartup },
          "[summary] hourly scan skipped: already scanned this hour",
        );
        return;
      }
      this.lastScanKey = scanKey;
      logger.info(
        { hour: currentHour, isStartup },
        "[summary] hourly scan started",
      );

      const basic = readBasicConf();
      const workspaces = getWorkspaces();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let triggeredCount = 0;

      for (const workspace of workspaces) {
        const trees = await readWorkspaceProjectTrees(workspace.id);
        const nodes = collectProjectNodes(trees);
        for (const node of nodes) {
          const rootPath = resolveProjectRootPath(node);
          if (!rootPath) continue;
          let projectConfig;
          try {
            projectConfig = await readProjectConfig(rootPath, node.projectId);
          } catch {
            // 逻辑：读取项目配置失败时跳过该项目，避免影响其他调度。
            continue;
          }
          const overrides = projectConfig.aiSettings;
          const overrideEnabled = overrides?.overrideEnabled ?? false;
          const autoSummaryEnabled = overrideEnabled
            ? typeof overrides?.autoSummaryEnabled === "boolean"
              ? overrides.autoSummaryEnabled
              : basic.autoSummaryEnabled
            : basic.autoSummaryEnabled;
          const autoSummaryHours = overrideEnabled
            ? normalizeHours(overrides?.autoSummaryHours ?? basic.autoSummaryHours)
            : normalizeHours(basic.autoSummaryHours);

          if (!autoSummaryEnabled || autoSummaryHours.length === 0) {
            continue;
          }

          if (!autoSummaryHours.includes(currentHour)) {
            continue;
          }

          triggeredCount += 1;
          void this.runner.run({
            taskId: randomUUID(),
            projectId: node.projectId,
            workspaceId: workspace.id,
            rootPath,
            now,
            triggeredBy: "scheduler",
            timezone,
          });
        }
      }
      logger.info(
        { hour: currentHour, isStartup, triggeredCount },
        "[summary] hourly scan finished",
      );
    } finally {
      this.isScanning = false;
    }
  }
}

/** Collect project nodes from workspace trees. */
function collectProjectNodes(trees: ProjectNode[]): ProjectNode[] {
  const nodes: ProjectNode[] = [];
  const queue = [...trees];
  while (queue.length) {
    const node = queue.shift();
    if (!node) continue;
    nodes.push(node);
    if (node.children?.length) {
      queue.push(...node.children);
    }
  }
  return nodes;
}

/** Resolve project root path from node. */
function resolveProjectRootPath(node: ProjectNode): string | null {
  if (!node.rootUri) return null;
  try {
    return resolveFilePathFromUri(node.rootUri);
  } catch {
    return getProjectRootPath(node.projectId);
  }
}

/** Normalize summary hours. */
function normalizeHours(raw: number[]): number[] {
  // 逻辑：过滤无效小时并去重排序，保持调度稳定。
  const hours = Array.from(
    new Set(
      raw
        .filter((value) => typeof value === "number" && Number.isInteger(value))
        .filter((value) => value >= 0 && value <= 24),
    ),
  ).sort((a, b) => a - b);
  return hours;
}

/** Resolve next scan time at top of the hour. */
function resolveNextHourlyScanAt(): Date {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
  if (next <= now) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 2, 0, 0, 0);
  }
  return next;
}
