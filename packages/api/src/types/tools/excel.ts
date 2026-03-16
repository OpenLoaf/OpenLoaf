/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'
import { jsonArrayPreprocess, officeEditSchema } from './office'

export const excelQueryToolDef = {
  id: 'excel-query',
  name: 'Excel 查询',
  description:
    '触发：当用户提到 Excel、电子表格、xlsx、csv、工作表，或询问"读取表格"、"查看数据"时调用。用途：读取 Excel 文件的结构化概览、原始 XML 或纯文本。返回：{ ok: true, data: { mode, ... } }。模式说明：read-structure 返回 sheet 列表和单元格数据（可指定 sheet）；read-xml 读取 ZIP 内任意文件（xmlPath="*" 列出所有 entry）；read-text 提取所有 sheet 的纯文本。不适用：需要创建、修改 Excel 时不要使用，改用 excel-mutate。',
  parameters: z.object({
    actionName: z
      .string()
      .optional()
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的，例如：读取销售数据表。'),
    mode: z
      .enum(['read-structure', 'read-xml', 'read-text'])
      .describe(
        '查询模式：read-structure 获取工作簿结构化概览（sheet 列表、单元格数据），read-xml 读取 ZIP 内任意文件的原始 XML，read-text 提取纯文本内容',
      ),
    filePath: z
      .string()
      .min(1)
      .describe('Excel 文件路径（相对于项目根目录、全局根目录或绝对路径，支持 .xlsx/.xls）'),
    sheet: z
      .string()
      .optional()
      .describe('read-structure 时可选：指定 sheet 名称以返回详细的单元格数据'),
    xmlPath: z
      .string()
      .optional()
      .describe('read-xml 模式时指定 ZIP 内部路径（如 "xl/worksheets/sheet1.xml"），设为 "*" 列出所有 entry'),
  }),
  component: null,
} as const

export const excelMutateToolDef = {
  id: 'excel-mutate',
  name: 'Excel 操作',
  description:
    '触发：当你需要创建或编辑 Excel 文件时调用。用途：create 创建新工作簿（含初始数据），edit 使用 XPath 定位 + XML 编辑修改已有文件（支持修改单元格、公式、样式、图表等任意内容）。返回：{ ok: true, data: { action, ... } }。编辑流程：先用 excel-query(read-structure 或 read-xml) 查看文件结构，然后用 edit 的 edits 数组批量操作。不适用：仅需读取时改用 excel-query；格式转换（如 CSV→Excel、Excel→CSV/JSON）改用 doc-convert。',
  parameters: z.object({
    actionName: z
      .string()
      .optional()
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的，例如：创建销售报表。'),
    action: z
      .enum(['create', 'edit'])
      .describe(
        '操作类型：create 创建新工作簿，edit 使用 edits 数组批量编辑已有文件',
      ),
    filePath: z
      .string()
      .min(1)
      .describe('Excel 文件路径（create 时为新文件路径，edit 时为已有文件路径）'),
    sheetName: z
      .string()
      .optional()
      .describe('create 时可选：初始 sheet 名称（默认 "Sheet1"）'),
    data: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).optional(),
      )
      .describe('create 时可选：初始数据（二维数组，如 [["Name","Age"],["Alice",30]]）'),
    edits: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(officeEditSchema).optional(),
      )
      .describe(
        'edit 时必填：编辑操作数组。每个操作通过 op 指定类型（replace/insert/remove/write/delete），通过 path 指定 ZIP 内文件路径，通过 xpath 定位 XML 元素',
      ),
  }),
  needsApproval: true,
  component: null,
} as const
