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

export const docConvertToolDef = {
  id: 'DocConvert',
  readonly: false,
  name: '文档转换',
  description:
    '触发：当用户需要将文档从一种格式转换为另一种格式时调用。' +
    '典型场景："把 Word 文档转成 PDF"、"把 PDF 转成纯文本"、"把 Excel 导出为 CSV"、"把 Markdown 转成 HTML"、"把 HTML 转成 Markdown"、"把 CSV 转成 Excel"。' +
    '支持的源格式（由文件扩展名自动判断）：docx, pdf, xlsx, xls, csv, html, md, txt。' +
    '支持的目标格式（outputFormat 参数）：pdf, docx, html, md, txt, csv, xls, xlsx, json。' +
    '转换矩阵（源 → 可选目标）：' +
    'docx → html（高保真）、md（保留标题列表粗斜体）、txt（纯文本）、pdf（文本级，无排版）；' +
    'pdf → txt（高保真）、html/md（文本+分页标记）、docx（纯文本段落）；' +
    'xlsx/xls → csv（高保真）、json（高保真）、txt、html、xls/xlsx 互转；' +
    'csv → xlsx、xls、json；' +
    'html → md（高保真，使用 turndown）、txt、pdf（文本级）；' +
    'md → html（高保真，使用 marked）、txt、pdf（文本级）；' +
    'txt → pdf、docx、html。' +
    '重要限制：PDF↔DOCX 为有损文本级转换，不保留原始排版、图片和样式，结果中 lossyConversion: true 会标明。Excel 多 sheet 文件转 CSV 时默认取第一个 sheet。' +
    '返回：{ ok, data: { outputPath, sourceFormat, outputFormat, fileSize, lossyConversion? } }。' +
    '不适用：需要读取/编辑文档内容（不转换格式）时，使用 WordQuery/excel-query/pdf-query 等专用工具。',
  parameters: z.object({
    filePath: z
      .string()
      .min(1)
      .describe('源文件路径（相对于项目根目录、全局根目录或绝对路径）'),
    outputPath: z
      .string()
      .min(1)
      .describe('输出文件路径（必须包含目标格式的扩展名）'),
    outputFormat: z
      .enum(['pdf', 'docx', 'html', 'md', 'txt', 'csv', 'xls', 'xlsx', 'json'])
      .describe('目标格式'),
  }),
  needsApproval: true,
  component: null,
} as const
