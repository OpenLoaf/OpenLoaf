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

export const officeExecuteToolDef = {
  id: "office-execute",
  name: "WPS 文档操作",
  description:
    "触发：当你需要通过 WPS 插件操作文档时调用。用途：向 WPS 插件发送操作指令并等待回执。可用操作：open（打开文档）、readText（读取全文）、replaceText（替换全文）、insertAtCursor（插入光标处）、getDocumentInfo（获取文档信息）、getSelectedText（获取选中文本）、insertText（指定位置插入）、deleteText（删除选中）、findReplace（查找替换）、formatText（格式化文本）、addTable（创建表格）、readTable（读取表格）、addComment（添加批注）、getComments（获取批注）、addBookmark（添加书签）、save（保存）、saveAs（另存为）、exportPdf（导出PDF）、getDocumentStructure（获取文档结构）、insertImage（插入图片）。返回：{ commandId, clientId, status, output?, errorText?, requestedAt }。不适用：无需调用 WPS 时不要使用。",
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
      .enum([
        "open",
        "readText",
        "replaceText",
        "insertAtCursor",
        "getDocumentInfo",
        "getSelectedText",
        "insertText",
        "deleteText",
        "findReplace",
        "formatText",
        "addTable",
        "readTable",
        "addComment",
        "getComments",
        "addBookmark",
        "save",
        "saveAs",
        "exportPdf",
        "getDocumentStructure",
        "insertImage",
      ])
      .describe(
        "操作类型：open 打开文档，readText 读取全文，replaceText 替换全文，insertAtCursor 插入光标处，getDocumentInfo 获取文档信息，getSelectedText 获取选中文本，insertText 指定位置插入，deleteText 删除选中，findReplace 查找替换，formatText 格式化文本，addTable 创建表格，readTable 读取表格，addComment 添加批注，getComments 获取批注，addBookmark 添加书签，save 保存，saveAs 另存为，exportPdf 导出PDF，getDocumentStructure 获取文档结构，insertImage 插入图片。"
      ),
    payload: z
      .object({
        filePath: z.string().optional().describe("本机绝对路径或 file:// URI。"),
        text: z.string().optional().describe("写入/替换的文本内容。"),
        searchText: z.string().optional().describe("查找替换的搜索文本。"),
        replaceWith: z.string().optional().describe("查找替换的替换文本。"),
        matchCase: z.boolean().optional().describe("查找替换是否区分大小写。"),
        matchWholeWord: z.boolean().optional().describe("查找替换是否全字匹配。"),
        position: z
          .enum(["start", "end", "cursor", "bookmark", "afterParagraph"])
          .optional()
          .describe("insertText 的插入位置。"),
        bookmarkName: z.string().optional().describe("书签名称。"),
        paragraphIndex: z.number().int().optional().describe("段落索引（0-based）。"),
        formatting: z
          .object({
            bold: z.boolean().optional(),
            italic: z.boolean().optional(),
            fontSize: z.number().optional(),
            fontName: z.string().optional(),
            fontColor: z.string().optional().describe("颜色值，如 '#FF0000'。"),
          })
          .optional()
          .describe("formatText 的格式化参数。"),
        tableRows: z.number().int().positive().optional().describe("表格行数。"),
        tableCols: z.number().int().positive().optional().describe("表格列数。"),
        tableIndex: z.number().int().optional().describe("表格索引（0-based）。"),
        commentText: z.string().optional().describe("批注文本。"),
        imageUrl: z.string().optional().describe("图片路径或 URL。"),
        pdfPath: z.string().optional().describe("PDF 导出路径。"),
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
