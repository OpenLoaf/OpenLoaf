/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { z } from "zod";

export const officeExecuteToolDef = {
  id: "office-execute",
  name: "WPS 文档操作",
  description:
    "触发：当你需要通过 WPS 插件打开/读取/编辑文档时调用。用途：向 WPS 插件发送操作指令并等待回执。返回：{ commandId, clientId, status, output?, errorText?, requestedAt }。不适用：无需调用 WPS 时不要使用。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：打开并编辑文档。"),
    appType: z
      .enum(["docx", "excel", "ppt"])
      .optional()
      .describe("目标 WPS 应用类型，默认 docx。"),
    action: z
      .enum(["open", "readText", "replaceText", "insertAtCursor"])
      .describe("操作类型：open 打开文档，readText 读取全文，replaceText 替换全文，insertAtCursor 插入光标处。"),
    payload: z
      .object({
        filePath: z.string().optional().describe("本机绝对路径或 file:// URI。"),
        text: z.string().optional().describe("写入/替换的文本内容。"),
      })
      .optional()
      .describe("操作参数。"),
    workspaceId: z.string().optional().describe("可选：workspaceId，用于选择 WPS 客户端。"),
    projectId: z.string().optional().describe("可选：projectId，用于选择 WPS 客户端。"),
    timeoutSec: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("可选：等待 WPS 执行完成的超时秒数，默认 60 秒。"),
  }),
  component: null,
} as const;
