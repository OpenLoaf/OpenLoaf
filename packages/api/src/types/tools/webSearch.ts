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

export const webSearchToolDef = {
  id: "web-search",
  name: "网页搜索",
  description:
    "触发：当你需要搜索互联网获取最新信息、查找事实、验证数据，但没有明确的目标网页 URL 时调用。用途：根据关键词搜索网页，返回相关结果的标题、链接和内容摘要。返回：{ ok: true, results: [{ title, url, content }] }。不适用：不要用于已知信息或可从本地文件获取的内容；当已有明确 URL 需要打开或浏览时使用 open-url 或 browser 子代理，而非本工具。与 browser 工具的区别：web-search 用于「搜索信息」（不知道在哪），browser 系列用于「访问网页」（已知 URL 或需要交互）。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：搜索最新的 React 19 特性。"),
    query: z
      .string()
      .min(1)
      .describe("搜索关键词或查询语句。"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("可选：返回结果数量上限，默认 5，最大 10。"),
  }),
  component: null,
} as const;
