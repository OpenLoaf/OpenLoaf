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
  id: 'pptx-query',
  name: 'PPTX 查询',
  description:
    '触发：当用户提到 PPT、PPTX、幻灯片、演示文稿，或询问"读取 PPT"、"查看幻灯片"时调用。用途：读取 PowerPoint 文件的结构化概览、原始 XML 或纯文本。返回：{ ok: true, data: { mode, ... } }。模式说明：read-structure 返回幻灯片列表（标题、文本块、图片）；read-xml 读取 ZIP 内任意文件（xmlPath="*" 列出所有 entry）；read-text 提取所有幻灯片的纯文本。不适用：需要创建、修改 PPTX 时不要使用，改用 pptx-mutate。',
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
  id: 'pptx-mutate',
  name: 'PPTX 操作',
  description:
    '触发：当你需要创建或编辑 PowerPoint 文件时调用。用途：create 创建新的 .pptx 文件（含结构化幻灯片内容），edit 使用 XPath 定位 + XML 编辑修改已有文件（支持修改文字/样式/图片/动画等任意内容）。返回：{ ok: true, data: { action, ... } }。编辑流程：先用 pptx-query(read-structure 或 read-xml) 查看文件结构，然后用 edit 的 edits 数组批量操作。不适用：仅需读取时不要使用，改用 pptx-query。',
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
