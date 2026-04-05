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

export const wordQueryToolDef = {
  id: 'WordQuery',
  readonly: true,
  name: 'Word 查询',
  description:
    'Read-only access to a .docx file: `read-structure` (paragraphs / tables / images as JSON), `read-xml` (raw XML from any ZIP entry; pass `xmlPath="*"` to list all entries), `read-text` (plain text). For create/edit use WordMutate.',
  parameters: z.object({
    mode: z
      .enum(['read-structure', 'read-xml', 'read-text'])
      .describe(
        '查询模式：read-structure 获取文档结构化 JSON 概览（段落、表格、图片），read-xml 读取 ZIP 内任意文件的原始 XML（xmlPath="*" 列出所有 entry），read-text 提取纯文本内容',
      ),
    filePath: z
      .string()
      .min(1)
      .describe('Word 文件路径（相对于项目根目录、全局根目录或绝对路径，支持 .docx）'),
    xmlPath: z
      .string()
      .optional()
      .describe('read-xml 模式时指定 ZIP 内部路径（如 "word/document.xml"），设为 "*" 列出所有 entry'),
  }),
  component: null,
} as const

const contentItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    text: z.string().describe('标题文本'),
    level: z.number().int().min(1).max(6).optional().describe('标题级别（1-6，默认 1）'),
  }),
  z.object({
    type: z.literal('paragraph'),
    text: z.string().describe('段落文本'),
    bold: z.boolean().optional().describe('是否加粗'),
    italic: z.boolean().optional().describe('是否斜体'),
  }),
  z.object({
    type: z.literal('table'),
    headers: z.array(z.string()).describe('表头列名数组'),
    rows: z.array(z.array(z.string())).describe('表格数据行（二维字符串数组）'),
  }),
  z.object({
    type: z.literal('bullet-list'),
    items: z.array(z.string()).describe('无序列表项'),
  }),
  z.object({
    type: z.literal('numbered-list'),
    items: z.array(z.string()).describe('有序列表项'),
  }),
])

export const wordMutateToolDef = {
  id: 'WordMutate',
  readonly: false,
  name: 'Word 操作',
  description:
    'Creates or edits .docx files. `create` builds a new file from structured content; `edit` applies XPath+XML edits (text/styles/tables/images) to an existing file. Workflow: call WordQuery (read-structure / read-xml) first to find targets, then batch edits in the `edits` array. For read-only access, use WordQuery.',
  parameters: z.object({
    action: z
      .enum(['create', 'edit'])
      .describe(
        '操作类型：create 使用结构化内容创建新 .docx 文件，edit 使用 edits 数组批量编辑已有文件',
      ),
    filePath: z
      .string()
      .min(1)
      .describe('Word 文件路径（create 时为新文件路径，edit 时为已有文件路径）'),
    content: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(contentItemSchema).optional(),
      )
      .describe(
        'create 时必填：结构化文档内容数组，每项为 heading/paragraph/table/bullet-list/numbered-list',
      ),
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
