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
  page: z.number().min(1).describe('1-based.'),
  x: z.number().describe('PDF points, origin at bottom-left.'),
  y: z.number().describe('PDF points, origin at bottom-left.'),
  text: z.string(),
  fontSize: z.number().optional().describe('Default 12.'),
  color: z.string().optional().describe('Hex, e.g. "#FF0000". Default black.'),
  background: z
    .object({
      color: z.string().describe('Hex, e.g. "#FFFFFF" for white masking.'),
      padding: z.number().optional().describe('Default 2.'),
      width: z.number().optional().describe('Auto from text width + padding when omitted.'),
      height: z.number().optional().describe('Auto from font size + padding when omitted.'),
    })
    .optional()
    .describe('Background rectangle to mask existing content.'),
})

export const pdfMutateToolDef = {
  id: 'PdfMutate',
  readonly: false,
  name: 'Mutate Pdf',
  description:
    'Create / fill-form / merge / add-text on PDFs. Note: create uses standard fonts and does not support CJK characters. See pdf-word-excel-pptx skill for usage.',
  parameters: z.object({
    action: z.enum(['create', 'fill-form', 'merge', 'add-text']),
    filePath: z
      .string()
      .min(1)
      .describe('New file for create/merge, existing file for fill-form/add-text.'),
    content: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(pdfContentItemSchema).optional(),
      )
      .describe('Required for create.'),
    fields: z
      .record(z.string(), z.string())
      .optional()
      .describe('Form field name to value. Required for fill-form.'),
    sourcePaths: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(z.string()).optional(),
      )
      .describe('Required for merge.'),
    overlays: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(pdfTextOverlaySchema).optional(),
      )
      .describe('Required for add-text.'),
  }),
  needsApproval: true,
  component: null,
} as const
