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
  name: 'Query Pptx',
  description:
    'Read-only access to .pptx: structured slide overview, raw XML entries, or plain text. See pdf-word-excel-pptx skill for usage.',
  parameters: z.object({
    mode: z.enum(['read-structure', 'read-xml', 'read-text']),
    filePath: z
      .string()
      .min(1)
      .describe('Relative to project / global root, or absolute.'),
    xmlPath: z
      .string()
      .optional()
      .describe('ZIP internal path for read-xml; "*" lists all entries.'),
  }),
  component: null,
} as const

const slideContentSchema = z.object({
  title: z.string().optional(),
  textBlocks: z.array(z.string()).optional(),
  notes: z.string().optional().describe('Speaker notes.'),
})

export const pptxMutateToolDef = {
  id: 'PptxMutate',
  readonly: false,
  name: 'Mutate Pptx',
  description:
    'Create or edit .pptx files (new deck from structured slides or XPath+XML edits). See pdf-word-excel-pptx skill for usage.',
  parameters: z.object({
    action: z.enum(['create', 'edit']),
    filePath: z.string().min(1),
    slides: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(slideContentSchema).optional(),
      )
      .describe('Required for create.'),
    edits: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(officeEditSchema).optional(),
      )
      .describe('Required for edit.'),
  }),
  needsApproval: true,
  component: null,
} as const
