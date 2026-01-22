import { generateText } from "ai";
import type { ProjectGitCommit } from "@tenas-ai/api/services/projectGitService";
import type { ProjectFileChange } from "@tenas-ai/api/services/projectFileChangeService";
import { resolveChatModel } from "@/ai/resolveChatModel";
import { readBasicConf } from "@/modules/settings/tenasConfStore";

export type SummaryGeneratorInput = {
  /** Project title for prompt context. */
  projectTitle: string;
  /** Date key for daily summary. */
  dateKey: string;
  /** Commit list for summary. */
  commits: ProjectGitCommit[];
  /** File change list for summary. */
  fileChanges?: ProjectFileChange[];
  /** Existing summary for incremental updates. */
  previousSummary?: string;
};

export type RangeSummaryGeneratorInput = {
  /** Project title for prompt context. */
  projectTitle: string;
  /** Range start date key. */
  from: string;
  /** Range end date key. */
  to: string;
  /** Commit list for summary. */
  commits: ProjectGitCommit[];
  /** File change list for summary. */
  fileChanges?: ProjectFileChange[];
};

/** Generate daily summary content. */
export async function generateDailySummary(
  input: SummaryGeneratorInput,
): Promise<string> {
  const basic = readBasicConf();
  const resolved = await resolveChatModel({
    chatModelId: basic.modelDefaultChatModelId,
  });

  const commitLines = input.commits.map(
    (commit) => `- ${commit.summary} (${commit.shortOid}, ${commit.authorName ?? ""})`,
  );
  const changeLines = (input.fileChanges ?? []).map(
    (change) => `- ${change.relativePath} (${change.updatedAt})`,
  );
  const previous = input.previousSummary?.trim();
  const promptLines = [
    `你是项目总结助手，请输出 ${input.dateKey} 的项目总结：`,
    `项目：${input.projectTitle}`,
    "变更列表：",
    commitLines.length
      ? commitLines.join("\n")
      : changeLines.length
        ? changeLines.join("\n")
        : "- 当天无提交记录",
  ];

  if (previous) {
    // 逻辑：已有总结时按增量更新，保留已有要点。
    promptLines.push("已有总结：");
    promptLines.push(previous);
    promptLines.push("请在已有总结的基础上补充新的变化，并保持简洁。");
  } else {
    promptLines.push("要求：简洁、条理清晰，只输出 Markdown 内容。");
  }

  const result = await generateText({
    model: resolved.model,
    prompt: promptLines.join("\n"),
  });

  return result.text ?? "";
}

/** Generate range summary content. */
export async function generateRangeSummary(
  input: RangeSummaryGeneratorInput,
): Promise<string> {
  const basic = readBasicConf();
  const resolved = await resolveChatModel({
    chatModelId: basic.modelDefaultChatModelId,
  });

  const commitLines = input.commits.map(
    (commit) => `- ${commit.summary} (${commit.shortOid}, ${commit.authorName ?? ""})`,
  );
  const changeLines = (input.fileChanges ?? []).map(
    (change) => `- ${change.relativePath} (${change.updatedAt})`,
  );
  const prompt = [
    `你是项目总结助手，请输出 ${input.from} 到 ${input.to} 的项目总结：`,
    `项目：${input.projectTitle}`,
    "变更列表：",
    commitLines.length
      ? commitLines.join("\n")
      : changeLines.length
        ? changeLines.join("\n")
        : "- 区间内无提交记录",
    "要求：概览 + 重点变化 + 风险点（若无则省略），只输出 Markdown 内容。",
  ].join("\n");

  const result = await generateText({
    model: resolved.model,
    prompt,
  });

  return result.text ?? "";
}
