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
  name: 'Word 查询',
  description:
    '触发：当用户提到 Word、docx、文档，或询问"读取文档"、"查看 Word 内容"时调用。用途：读取 Word 文件的结构化概览、原始 XML 或纯文本。返回：{ ok: true, data: { mode, ... } }。模式说明：read-structure 返回段落/表格/图片的结构化 JSON；read-xml 读取 ZIP 内任意文件（xmlPath="*" 列出所有 entry）；read-text 提取纯文本。不适用：需要创建、修改 Word 时不要使用，改用 WordMutate。',
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
  name: 'Word 操作',
  description:
    '触发：当你需要创建或编辑 Word 文件时调用。用途：create 从结构化内容创建新 .docx 文件，edit 使用 XPath 定位 + XML 编辑修改已有文件（支持修改文本/样式/表格/图片等任意内容）。返回：{ ok: true, data: { action, ... } }。编辑流程：先用 WordQuery(read-structure 或 read-xml) 查看文档结构，然后用 edit 的 edits 数组批量操作。不适用：仅需读取时不要使用，改用 WordQuery。',
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
