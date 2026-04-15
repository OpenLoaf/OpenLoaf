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

export const excelMutateToolDef = {
  id: 'ExcelMutate',
  readonly: false,
  name: 'Mutate Excel',
  description:
    'Create or edit .xlsx/.xls files (new workbook or XPath+XML edits on existing file). See pdf-word-excel-pptx skill for usage.',
  parameters: z.object({
    action: z.enum(['create', 'edit']),
    filePath: z.string().min(1),
    sheetName: z
      .string()
      .optional()
      .describe('Initial sheet name for create. Default "Sheet1".'),
    data: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).optional(),
      )
      .describe('Initial 2D data for create, e.g. [["Name","Age"],["Alice",30]].'),
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
