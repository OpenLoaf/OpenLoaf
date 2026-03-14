/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";
import { RiskType } from "../toolResult";

export const memorySearchToolDef = {
  id: "memory-search",
  name: "记忆搜索",
  description:
    "搜索记忆文件。输入查询关键词，返回匹配的记忆片段列表（文件路径 + 摘要 + 日期 + 衰减权重），按相关性排序。用于在运行时按需检索历史记忆。",
  parameters: z.object({
    query: z
      .string()
      .min(1)
      .describe("搜索关键词，用于匹配记忆文件内容"),
    scope: z
      .enum(["user", "project", "agent"])
      .optional()
      .describe(
        "搜索范围：user=用户级记忆，project=项目级记忆，agent=当前Agent记忆。不传则搜索所有可见范围。",
      ),
    topK: z
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe("返回结果数量上限，默认 10"),
  }),
  component: null,
} as const;

export const memoryGetToolDef = {
  id: "memory-get",
  name: "读取记忆",
  description:
    "按路径读取一个记忆文件的完整内容。通常在 memory-search 返回结果后，选择感兴趣的记忆使用本工具读取完整内容。",
  parameters: z.object({
    filePath: z
      .string()
      .min(1)
      .describe("记忆文件的完整路径（从 memory-search 结果中获取）"),
  }),
  component: null,
} as const;

export const memoryToolMeta = {
  [memorySearchToolDef.id]: { riskType: RiskType.Read },
  [memoryGetToolDef.id]: { riskType: RiskType.Read },
} as const;
