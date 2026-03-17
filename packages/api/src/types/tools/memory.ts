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

export const memorySaveToolDef = {
  id: "memory-save",
  name: "保存记忆",
  description:
    "将信息持久化保存到记忆系统（跨会话可检索）。支持新建、更新、追加、删除记忆。" +
    "每条记忆由 key 唯一标识，保存为独立 Markdown 文件，自动维护 MEMORY.md 索引。",
  parameters: z.object({
    key: z
      .string()
      .min(1)
      .max(60)
      .describe(
        "记忆标识符（英文小写字母+数字+连字符，如 food-preferences、debug-patterns）",
      ),
    content: z
      .string()
      .max(10240)
      .optional()
      .describe("记忆内容（Markdown 格式，delete 模式时可省略）"),
    scope: z
      .enum(["user", "project", "agent"])
      .optional()
      .describe(
        "保存范围：user=全局记忆（默认），project=当前项目记忆，agent=当前Agent专属记忆",
      ),
    mode: z
      .enum(["upsert", "append", "delete"])
      .optional()
      .describe(
        "操作模式：upsert=新建或覆盖（默认），append=追加到已有文件末尾，delete=删除",
      ),
    tags: z
      .array(z.string())
      .optional()
      .describe("检索标签，注入 frontmatter 提升搜索精度（如 [\"food\", \"preference\"]）"),
    indexEntry: z
      .string()
      .max(100)
      .optional()
      .describe("MEMORY.md 索引中的一行摘要（不提供则从 content 首行提取）"),
  }),
  component: null,
} as const;

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
  [memorySaveToolDef.id]: { riskType: RiskType.Write },
  [memorySearchToolDef.id]: { riskType: RiskType.Read },
  [memoryGetToolDef.id]: { riskType: RiskType.Read },
} as const;
