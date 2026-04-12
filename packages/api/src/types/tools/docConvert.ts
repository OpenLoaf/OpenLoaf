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

export const docConvertToolDef = {
  id: 'DocConvert',
  readonly: false,
  name: 'Convert Document',
  description:
    'Convert a document between formats (docx / pdf / xlsx / csv / html / md / txt / json). See pdf-word-excel-pptx skill for usage.',
  parameters: z.object({
    filePath: z
      .string()
      .min(1)
      .describe('Source file (relative to project / global root, or absolute).'),
    outputPath: z
      .string()
      .min(1)
      .describe('Must include the target extension.'),
    outputFormat: z.enum(['pdf', 'docx', 'html', 'md', 'txt', 'csv', 'xls', 'xlsx', 'json']),
  }),
  needsApproval: true,
  component: null,
} as const
