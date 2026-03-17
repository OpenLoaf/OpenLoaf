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
import { jsonArrayPreprocess } from './office'

export const pdfQueryToolDef = {
  id: 'pdf-query',
  name: 'PDF 查询',
  description:
    '触发：当用户提到 PDF 文件，或询问"读取 PDF"、"查看 PDF"时调用。用途：读取 PDF 文件的结构化概览、文本内容或表单字段。返回：{ ok: true, data: { mode, ... } }。模式说明：read-structure 返回页数、元数据、表单信息；read-text 提取全文或指定页文本；read-form-fields 返回表单字段列表（名称、类型、当前值）。不适用：需要创建、修改 PDF 时不要使用，改用 pdf-mutate。',
  parameters: z.object({
    mode: z
      .enum(['read-structure', 'read-text', 'read-form-fields', 'structure', 'text', 'form-fields'])
      .describe(
        '查询模式：read-structure 获取页数/元数据/表单信息，read-text 提取纯文本内容，read-form-fields 获取可填写表单字段列表',
      ),
    filePath: z
      .string()
      .min(1)
      .describe('PDF 文件路径（相对于项目根目录、全局根目录或绝对路径，支持 .pdf）'),
    pageRange: z
      .string()
      .optional()
      .describe('read-text 模式时可选，指定页码范围（如 "1-5" 或 "3"），不指定则提取全部页面'),
  }),
  component: null,
} as const

const pdfContentItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    text: z.string(),
    level: z.number().min(1).max(6).optional(),
  }),
  z.object({
    type: z.literal('paragraph'),
    text: z.string(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    fontSize: z.number().optional(),
  }),
  z.object({
    type: z.literal('table'),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  z.object({
    type: z.literal('bullet-list'),
    items: z.array(z.string()),
  }),
  z.object({
    type: z.literal('numbered-list'),
    items: z.array(z.string()),
  }),
  z.object({
    type: z.literal('page-break'),
  }),
])

const pdfTextOverlaySchema = z.object({
  page: z.number().min(1).describe('目标页码（从 1 开始）'),
  x: z.number().describe('X 坐标（PDF 点，左下角为原点）'),
  y: z.number().describe('Y 坐标（PDF 点，左下角为原点）'),
  text: z.string().describe('要叠加的文字'),
  fontSize: z.number().optional().describe('字体大小（默认 12）'),
  color: z.string().optional().describe('颜色（十六进制如 "#FF0000"，默认黑色）'),
  background: z
    .object({
      color: z.string().describe('背景矩形颜色（十六进制如 "#FFFFFF" 白色遮罩）'),
      padding: z.number().optional().describe('矩形在文字四周的内边距（默认 2）'),
      width: z.number().optional().describe('矩形宽度（不指定则根据文字宽度+padding 自动计算）'),
      height: z.number().optional().describe('矩形高度（不指定则根据字体大小+padding 自动计算）'),
    })
    .optional()
    .describe('可选背景矩形，用于遮盖原有内容（如隐私遮罩）。先画矩形再画文字。'),
})

export const pdfMutateToolDef = {
  id: 'pdf-mutate',
  name: 'PDF 操作',
  description:
    '触发：当你需要创建 PDF 文件、填充表单、合并 PDF 或在 PDF 上叠加文字时调用。用途：create 创建新的 PDF 文件（含结构化内容），fill-form 填充已有 PDF 的表单字段，merge 合并多个 PDF 文件，add-text 在已有 PDF 页面上叠加文字。返回：{ ok: true, data: { action, ... } }。注意：create 使用标准字体，不支持 CJK 字符（中日韩文），如需包含中文内容请告知用户。不适用：仅需读取时不要使用，改用 pdf-query。',
  parameters: z.object({
    action: z
      .enum(['create', 'fill-form', 'merge', 'add-text'])
      .describe(
        '操作类型：create 创建新 PDF，fill-form 填充表单字段，merge 合并多个 PDF，add-text 叠加文字到已有 PDF',
      ),
    filePath: z
      .string()
      .min(1)
      .describe('输出 PDF 文件路径（create/merge 为新文件路径，fill-form/add-text 为已有文件路径）'),
    content: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(pdfContentItemSchema).optional(),
      )
      .describe('create 时必填：结构化内容数组，支持 heading/paragraph/table/bullet-list/numbered-list/page-break'),
    fields: z
      .record(z.string(), z.string())
      .optional()
      .describe('fill-form 时必填：表单字段名与值的映射'),
    sourcePaths: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(z.string()).optional(),
      )
      .describe('merge 时必填：要合并的源 PDF 文件路径数组'),
    overlays: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(pdfTextOverlaySchema).optional(),
      )
      .describe('add-text 时必填：文字叠加定义数组'),
  }),
  needsApproval: true,
  component: null,
} as const
