import path from "node:path";
import { randomUUID } from "node:crypto";
import { getProjectRootPath } from "@tenas-ai/api/services/vfsService";
import { readProjectConfig } from "@tenas-ai/api/services/projectTreeService";
import { readSummaryMarkdown, writeSummaryMarkdown } from "@tenas-ai/api/services/summaryStorage";
import { generateText } from "ai";
import { resolveChatModel } from "@/ai/resolveChatModel";
import { readBasicConf } from "@/modules/settings/tenasConfStore";

export type UpdateProjectSummaryInput = {
  /** Project id. */
  projectId: string;
  /** Source summary content. */
  sourceSummary: string;
  /** Trigger source. */
  triggeredBy: "scheduler" | "manual" | "external";
};

export class UpdateProjectSummaryUseCase {
  /** Execute project summary update. */
  async execute(input: UpdateProjectSummaryInput): Promise<void> {
    const rootPath = getProjectRootPath(input.projectId);
    if (!rootPath) {
      throw new Error("项目不存在");
    }
    const projectConfig = await readProjectConfig(rootPath, input.projectId);
    const summaryPath = path.join(rootPath, ".tenas", "summary", "project.md");
    const existing = await readSummaryMarkdown(summaryPath);
    // 逻辑：保留已有概览作为提示输入，避免每次重写丢失长期信息。
    const previousSummary = existing.content?.trim();

    const basic = readBasicConf();
    const resolved = await resolveChatModel({
      chatModelId: basic.modelDefaultChatModelId,
    });

    const promptLines = [
      "你是项目概览生成器，请更新项目概览。",
      `项目：${projectConfig.title ?? input.projectId}`,
      "已有概览：",
      previousSummary || "（无）",
      "最新汇总：",
      input.sourceSummary || "（无）",
      "要求：只保留项目的基础信息与稳定结论，不写零碎细节。",
    ];

    const result = await generateText({
      model: resolved.model,
      prompt: promptLines.join("\n"),
    });
    const content = result.text ?? "";

    const summaryId = randomUUID();
    const nowIso = new Date().toISOString();
    await writeSummaryMarkdown({
      rootPath,
      fileName: "project.md",
      frontmatter: {
        summaryId,
        projectId: input.projectId,
        dates: [],
        createdAt: nowIso,
        updatedAt: nowIso,
        triggeredBy: input.triggeredBy,
      },
      content,
    });
  }
}
