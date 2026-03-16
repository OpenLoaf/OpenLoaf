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

/** Auto-parse JSON strings into arrays (some LLMs serialize array params as strings) */
export const jsonArrayPreprocess = (val: unknown) => {
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed
    } catch {}
  }
  return val
}

/** Shared edit operation schema for Office documents (DOCX/XLSX/PPTX). */
export const officeEditSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('replace'),
    path: z.string().describe('ZIP 内部文件路径，如 "word/document.xml"'),
    xpath: z.string().describe('XPath 表达式，定位要替换的 XML 元素'),
    xml: z.string().describe('替换后的 XML 片段'),
  }),
  z.object({
    op: z.literal('insert'),
    path: z.string().describe('ZIP 内部文件路径'),
    xpath: z.string().describe('XPath 表达式，定位插入参考点'),
    position: z.enum(['before', 'after']).describe('在目标元素之前还是之后插入'),
    xml: z.string().describe('要插入的 XML 片段'),
  }),
  z.object({
    op: z.literal('remove'),
    path: z.string().describe('ZIP 内部文件路径'),
    xpath: z.string().describe('XPath 表达式，定位要删除的 XML 元素'),
  }),
  z.object({
    op: z.literal('write'),
    path: z.string().describe('ZIP 内部文件路径（如 "word/media/logo.png"）'),
    source: z.string().describe('来源文件路径或 HTTP(S) URL'),
  }),
  z.object({
    op: z.literal('delete'),
    path: z.string().describe('要从 ZIP 中删除的文件路径'),
  }),
])
