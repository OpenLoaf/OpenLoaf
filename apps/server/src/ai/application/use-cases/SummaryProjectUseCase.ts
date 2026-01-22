import path from "node:path";
import { randomUUID } from "node:crypto";
import { getProjectRootPath } from "@tenas-ai/api/services/vfsService";
import { readProjectConfig } from "@tenas-ai/api/services/projectTreeService";
import { getProjectGitCommitsInRange } from "@tenas-ai/api/services/projectGitService";
import { listProjectFilesChangedInRange } from "@tenas-ai/api/services/projectFileChangeService";
import { writeSummaryMarkdown, appendSummaryIndex } from "@tenas-ai/api/services/summaryStorage";
import { generateRangeSummary } from "@/ai/application/services/summary/summaryGenerator";

export type SummaryProjectUseCaseInput = {
  /** Project id. */
  projectId: string;
  /** Date keys covered by summary. */
  dates: string[];
  /** Range start time. */
  from: Date;
  /** Range end time. */
  to: Date;
  /** Trigger source. */
  triggeredBy: "scheduler" | "manual" | "external";
  /** IANA timezone id. */
  timezone: string;
};

export type SummaryProjectResult = {
  /** Summary id. */
  summaryId: string;
  /** Summary file path. */
  filePath: string;
  /** Summary content. */
  content: string;
};

export class SummaryProjectUseCase {
  /** Execute project summary. */
  async execute(input: SummaryProjectUseCaseInput): Promise<SummaryProjectResult> {
    const rootPath = getProjectRootPath(input.projectId);
    if (!rootPath) {
      throw new Error("项目不存在");
    }
    if (!input.dates.length) {
      throw new Error("缺少汇总日期范围");
    }
    const projectConfig = await readProjectConfig(rootPath, input.projectId);
    const commits = await getProjectGitCommitsInRange({
      projectId: input.projectId,
      from: input.from,
      to: input.to,
    });
    const fileChanges = commits.length
      ? []
      : await listProjectFilesChangedInRange({
          projectId: input.projectId,
          from: input.from,
          to: input.to,
        });
    const fromKey = input.dates[0];
    const toKey = input.dates[input.dates.length - 1];
    const content = await generateRangeSummary({
      projectTitle: projectConfig.title ?? input.projectId,
      from: fromKey,
      to: toKey,
      commits,
      fileChanges,
    });

    const summaryId = randomUUID();
    const nowIso = new Date().toISOString();
    const fileName = `${fromKey}_${toKey}.md`;
    const filePath = await writeSummaryMarkdown({
      rootPath,
      fileName,
      frontmatter: {
        summaryId,
        projectId: input.projectId,
        dates: input.dates,
        createdAt: nowIso,
        updatedAt: nowIso,
        triggeredBy: input.triggeredBy,
      },
      content,
    });

    // 逻辑：一次性汇总完成后写入索引，记录覆盖日期列表。
    await appendSummaryIndex(rootPath, {
      projectId: input.projectId,
      filePath,
      dates: input.dates,
      status: "success",
      triggeredBy: input.triggeredBy,
      timezone: input.timezone,
    });

    return {
      summaryId,
      filePath: path.normalize(filePath),
      content,
    };
  }
}
