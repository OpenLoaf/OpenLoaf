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
    'Converts a document between formats. Source format is auto-detected from file extension. Supports docx / pdf / xlsx / xls / csv / html / md / txt as sources, and pdf / docx / html / md / txt / csv / xls / xlsx / json as targets. ' +
    'PDF↔DOCX conversions are lossy (text-only, no layout/images/styles) and return `lossyConversion: true`. Excel multi-sheet files convert to the first sheet by default. ' +
    'Do NOT use for reading/editing document content without format change — use WordQuery / ExcelQuery / PdfQuery instead.',
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
