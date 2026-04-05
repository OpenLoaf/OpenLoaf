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
  id: 'ExcelQuery',
  readonly: true,
  name: 'Excel 查询',
  description:
    'Read-only access to a .xlsx/.xls file: `read-structure` (sheet list + cell data; pass `sheet` to drill in), `read-xml` (raw XML from any ZIP entry; `xmlPath="*"` lists all entries), `read-text` (plain text across all sheets). For create/edit use ExcelMutate.',
  parameters: z.object({
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
  id: 'ExcelMutate',
  readonly: false,
  name: 'Excel 操作',
  description:
    'Creates or edits .xlsx/.xls files. `create` builds a new workbook from initial data; `edit` applies XPath+XML edits (cells/formulas/styles/charts) to an existing file. Workflow: call ExcelQuery first to inspect structure, then batch edits. For read-only access use ExcelQuery; for format conversion (CSV↔Excel, Excel→JSON) use DocConvert.',
  parameters: z.object({
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
