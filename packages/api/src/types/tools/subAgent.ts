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

/** Browser SubAgent display name. */
export const browserSubAgentName = "BrowserSubAgent" as const;
/** Document analysis SubAgent display name. */
export const documentAnalysisSubAgentName = "DocumentAnalysisSubAgent" as const;
/** Allowed SubAgent names. */
export const subAgentNames = [
  browserSubAgentName,
  documentAnalysisSubAgentName,
] as const;

/** Sub-agent tool definition. */
export const subAgentToolDef = {
  id: "SubAgent",
  name: "子代理",
  description:
    "触发：当任务需要交给子代理独立执行（例如分离浏览/文档分析），且你需要获得其最终结果时调用。用途：创建指定子代理执行任务，过程会产生流式事件供系统展示。返回：子代理最后一个响应 part（可能是 text 或工具 part），也可能为 null。不适用：简单任务无需拆分时不要使用。",
  parameters: z.object({
    name: z
      .enum(subAgentNames)
      .describe(
        "子Agent名称（当前支持 BrowserSubAgent 与 DocumentAnalysisSubAgent）。",
      ),
    task: z.string().describe("子Agent需要执行的任务描述。"),
  }),
  component: null,
} as const;
