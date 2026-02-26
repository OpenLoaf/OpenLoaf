/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport path from "node:path";
import { randomUUID } from "node:crypto";
import { getProjectRootPath } from "@openloaf/api/services/vfsService";
import { readProjectConfig } from "@openloaf/api/services/projectTreeService";
import { getProjectGitCommitsInRange } from "@openloaf/api/services/projectGitService";
import { listProjectFilesChangedInRange } from "@openloaf/api/services/projectFileChangeService";
import {
  formatDateKey,
  parseDateKey,
  startOfDay,
  endOfDay,
} from "@openloaf/api/services/summaryDateUtils";
import { writeSummaryMarkdown, appendSummaryIndex } from "@openloaf/api/services/summaryStorage";
import { generateDailySummary } from "@/ai/services/summary/summaryGenerator";

type SummaryDayUseCaseInput = {
  /** Project id. */
  projectId: string;
  /** Date key for daily summary. */
  dateKey: string;
  /** Trigger source. */
  triggeredBy: "scheduler" | "manual" | "external";
  /** IANA timezone id. */
  timezone: string;
  /** Optional previous summary for incremental updates. */
  previousSummary?: string;
};

type SummaryDayResult = {
  /** Summary id. */
  summaryId: string;
  /** Summary file path. */
  filePath: string;
  /** Summary content. */
  content: string;
  /** Date key. */
  dateKey: string;
};

export class SummaryDayUseCase {
  /** Execute day summary. */
  async execute(input: SummaryDayUseCaseInput): Promise<SummaryDayResult> {
    const rootPath = getProjectRootPath(input.projectId);
    if (!rootPath) {
      throw new Error("项目不存在");
    }
    const projectConfig = await readProjectConfig(rootPath, input.projectId);
    const dateKey = input.dateKey || formatDateKey(new Date());
    const start = startOfDay(parseDateKey(dateKey));
    const end = endOfDay(parseDateKey(dateKey));
    const commits = await getProjectGitCommitsInRange({
      projectId: input.projectId,
      from: start,
      to: end,
    });
    const fileChanges = commits.length
      ? []
      : await listProjectFilesChangedInRange({
          projectId: input.projectId,
          from: start,
          to: end,
        });
    const content = await generateDailySummary({
      projectTitle: projectConfig.title ?? input.projectId,
      dateKey,
      commits,
      fileChanges,
      previousSummary: input.previousSummary,
    });

    const summaryId = randomUUID();
    const nowIso = new Date().toISOString();
    const fileName = `${dateKey}.md`;
    const filePath = await writeSummaryMarkdown({
      rootPath,
      fileName,
      frontmatter: {
        summaryId,
        projectId: input.projectId,
        dates: [dateKey],
        createdAt: nowIso,
        updatedAt: nowIso,
        triggeredBy: input.triggeredBy,
      },
      content,
    });

    // 逻辑：单日汇总完成后写入索引，方便后续快速定位。
    await appendSummaryIndex(rootPath, {
      projectId: input.projectId,
      filePath,
      dates: [dateKey],
      status: "success",
      triggeredBy: input.triggeredBy,
      timezone: input.timezone,
    });

    return {
      summaryId,
      filePath: path.normalize(filePath),
      content,
      dateKey,
    };
  }
}
