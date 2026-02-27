/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { generateText } from "ai";
import type { ProjectGitCommit } from "@openloaf/api/services/projectGitService";
import type { ProjectFileChange } from "@openloaf/api/services/projectFileChangeService";
import { resolveChatModel } from "@/ai/models/resolveChatModel";
import { readBasicConf } from "@/modules/settings/openloafConfStore";
import type { BasicConfig } from "@openloaf/api/types/basic";

type SummaryGeneratorInput = {
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

type RangeSummaryGeneratorInput = {
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

/** Resolve configured tool model parameters for summary generation. */
function resolveSummaryToolModelConfig(basic: BasicConfig) {
  const source = basic.toolModelSource === "cloud" ? "cloud" : "local";
  const modelId =
    typeof basic.modelDefaultToolModelId === "string"
      ? basic.modelDefaultToolModelId.trim()
      : "";
  if (source === "local" && !modelId) {
    throw new Error("工具模型未配置：请选择本地对话模型");
  }
  return {
    chatModelSource: source,
    chatModelId: source === "local" ? modelId : undefined,
  } as const;
}

/** Generate daily summary content. */
export async function generateDailySummary(
  input: SummaryGeneratorInput,
): Promise<string> {
  const basic = readBasicConf();
  const summaryModel = resolveSummaryToolModelConfig(basic);
  const resolved = await resolveChatModel({
    chatModelId: summaryModel.chatModelId,
    chatModelSource: summaryModel.chatModelSource,
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
  const summaryModel = resolveSummaryToolModelConfig(basic);
  const resolved = await resolveChatModel({
    chatModelId: summaryModel.chatModelId,
    chatModelSource: summaryModel.chatModelSource,
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
