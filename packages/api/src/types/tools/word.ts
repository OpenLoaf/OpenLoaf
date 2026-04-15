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

const contentItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    text: z.string(),
    level: z.number().int().min(1).max(6).optional().describe('Default 1.'),
  }),
  z.object({
    type: z.literal('paragraph'),
    text: z.string(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
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
])

export const wordMutateToolDef = {
  id: 'WordMutate',
  readonly: false,
  name: 'Mutate Word',
  description:
    'Create or edit .docx files (new file from structured content or XPath+XML edits on existing file). See pdf-word-excel-pptx skill for usage.',
  parameters: z.object({
    action: z.enum(['create', 'edit']),
    filePath: z.string().min(1),
    content: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(contentItemSchema).optional(),
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
