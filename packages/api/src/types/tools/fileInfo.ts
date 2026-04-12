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

export const fileInfoToolDef = {
  id: 'FileInfo',
  readonly: true,
  name: 'File Info',
  description:
    'Return file metadata (size, MIME, timestamps, plus type-specific details like image dimensions, video duration, PDF page count). See file-ops skill for usage.',
  parameters: z.object({
    filePath: z
      .string()
      .min(1)
      .describe('Relative to project / global root, or absolute.'),
  }),
  needsApproval: false,
  component: null,
} as const
