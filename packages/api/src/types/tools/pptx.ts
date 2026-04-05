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

export const pptxQueryToolDef = {
  id: 'PptxQuery',
  readonly: true,
  name: 'PPTX 查询',
  description:
    'Read-only access to a .pptx file: `read-structure` (slide list with title/text blocks/images), `read-xml` (raw XML from any ZIP entry; `xmlPath="*"` lists all entries), `read-text` (plain text across all slides). For create/edit use PptxMutate.',
  parameters: z.object({
    mode: z
      .enum(['read-structure', 'read-xml', 'read-text'])
      .describe(
        '查询模式：read-structure 获取幻灯片结构化概览（标题、文本、图片），read-xml 读取 ZIP 内任意文件的原始 XML，read-text 提取纯文本内容',
      ),
    filePath: z
      .string()
      .min(1)
      .describe('PPTX 文件路径（相对于项目根目录、全局根目录或绝对路径，支持 .pptx）'),
    xmlPath: z
      .string()
      .optional()
      .describe('read-xml 模式时指定 ZIP 内部路径（如 "ppt/slides/slide1.xml"），设为 "*" 列出所有 entry'),
  }),
  component: null,
} as const

const slideContentSchema = z.object({
  title: z.string().optional().describe('幻灯片标题'),
  textBlocks: z.array(z.string()).optional().describe('文本块列表'),
  notes: z.string().optional().describe('演讲者备注'),
})

export const pptxMutateToolDef = {
  id: 'PptxMutate',
  readonly: false,
  name: 'PPTX 操作',
  description:
    'Creates or edits .pptx files. `create` builds a new presentation from structured slide content; `edit` applies XPath+XML edits (text/styles/images/animations) to an existing file. Workflow: call PptxQuery first to inspect structure, then batch edits. For read-only access use PptxQuery.',
  parameters: z.object({
    action: z
      .enum(['create', 'edit'])
      .describe(
        '操作类型：create 创建新的 .pptx 文件，edit 使用 edits 数组批量编辑已有文件',
      ),
    filePath: z
      .string()
      .min(1)
      .describe('PPTX 文件路径（create 时为新文件路径，edit 时为已有文件路径）'),
    slides: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(slideContentSchema).optional(),
      )
      .describe('create 时必填：幻灯片内容数组，每项包含 title 和 textBlocks'),
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
