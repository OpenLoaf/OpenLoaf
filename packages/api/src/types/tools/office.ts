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
    path: z.string().describe('ZIP entry path, e.g. "word/document.xml".'),
    xpath: z.string(),
    xml: z.string(),
  }),
  z.object({
    op: z.literal('insert'),
    path: z.string().describe('ZIP entry path.'),
    xpath: z.string(),
    position: z.enum(['before', 'after']),
    xml: z.string(),
  }),
  z.object({
    op: z.literal('remove'),
    path: z.string().describe('ZIP entry path.'),
    xpath: z.string(),
  }),
  z.object({
    op: z.literal('write'),
    path: z.string().describe('ZIP entry path, e.g. "word/media/logo.png".'),
    source: z.string().describe('Source file path or HTTP(S) URL.'),
  }),
  z.object({
    op: z.literal('delete'),
    path: z.string().describe('ZIP entry path.'),
  }),
])
