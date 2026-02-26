/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { randomUUID } from "node:crypto";
import { setSummaryRuntime } from "@openloaf/api/services/summaryRuntime";
import { getProjectRootPath } from "@openloaf/api/services/vfsService";
import { readWorkspaceProjectTrees, type ProjectNode } from "@openloaf/api/services/projectTreeService";
import { SummaryScheduler } from "@/ai/services/summary/summaryScheduler";

/** Initialize summary scheduler and runtime. */
export async function initSummaryScheduler(): Promise<void> {
  const scheduler = new SummaryScheduler();
  await scheduler.scheduleAll();
  const runner = scheduler.getRunner();
  const statusRepo = scheduler.getStatusRepo();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  setSummaryRuntime({
    runDailySummary: async ({ projectId, dateKey, triggeredBy }) => {
      const rootPath = getProjectRootPath(projectId);
      if (!rootPath) {
        throw new Error("Project not found.");
      }
      const taskId = randomUUID();
      await runner.run({
        taskId,
        projectId,
        rootPath,
        now: new Date(),
        triggeredBy,
        forceDateKey: dateKey,
        timezone,
      });
      return { taskId };
    },
    runDailySummaryForWorkspace: async ({ workspaceId, dateKey, triggeredBy }) => {
      const trees = await readWorkspaceProjectTrees(workspaceId);
      const nodes = collectProjectNodes(trees);
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const taskIds: string[] = [];
      for (const node of nodes) {
        const rootPath = getProjectRootPath(node.projectId, workspaceId);
        if (!rootPath) continue;
        const taskId = randomUUID();
        taskIds.push(taskId);
        void runner.run({
          taskId,
          projectId: node.projectId,
          workspaceId,
          rootPath,
          now: new Date(),
          triggeredBy,
          forceDateKey: dateKey,
          timezone,
        });
      }
      return { taskIds };
    },
    getTaskStatus: async ({ taskId }) => {
      const result = await statusRepo.getStatus(taskId);
      return result
        ? { taskId: result.taskId, status: result.status, metadata: result.metadata }
        : null;
    },
    listTaskStatus: async ({ projectId, workspaceId }) => {
      const results = await statusRepo.listStatuses?.({ projectId, workspaceId });
      return (results ?? []).map((record) => ({
        taskId: record.taskId,
        status: record.status,
        metadata: record.metadata,
      }));
    },
  });
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
