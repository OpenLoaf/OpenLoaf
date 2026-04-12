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

export const imageProcessToolDef = {
  id: 'ImageProcess',
  readonly: false,
  name: 'Process Image',
  description:
    'Process an existing image: get-info / resize / crop / rotate / flip / grayscale / blur / sharpen / tint / convert. See media-ops skill for usage.',
  parameters: z.object({
    action: z.enum(['get-info', 'resize', 'crop', 'rotate', 'flip', 'grayscale', 'blur', 'sharpen', 'tint', 'convert']),
    filePath: z
      .string()
      .min(1)
      .describe('Relative to project / global root, or absolute.'),
    outputPath: z
      .string()
      .optional()
      .describe('Defaults to <source>_<action>.<ext>. Required for convert.'),
    overwrite: z
      .boolean()
      .optional()
      .describe('Overwrite source in place. Default false.'),
    width: z.coerce.number().int().transform(Math.abs).pipe(z.number().positive()).optional().describe('Pixels (resize).'),
    height: z.coerce.number().int().transform(Math.abs).pipe(z.number().positive()).optional().describe('Pixels (resize).'),
    fit: z
      .enum(['cover', 'contain', 'fill', 'inside', 'outside'])
      .optional()
      .describe('Default cover.'),
    left: z.coerce.number().int().min(0).optional().describe('Pixels (crop).'),
    top: z.coerce.number().int().min(0).optional().describe('Pixels (crop).'),
    cropWidth: z.coerce.number().int().transform(Math.abs).pipe(z.number().positive()).optional().describe('Pixels.'),
    cropHeight: z.coerce.number().int().transform(Math.abs).pipe(z.number().positive()).optional().describe('Pixels.'),
    angle: z.coerce.number().optional().describe('Degrees, clockwise.'),
    direction: z.enum(['horizontal', 'vertical']).optional(),
    sigma: z.coerce.number().min(0.3).max(100).optional(),
    tintColor: z.string().optional().describe('Hex, e.g. "#FF6600".'),
    format: z
      .enum(['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'])
      .optional()
      .describe('For convert.'),
    quality: z
      .coerce.number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('For convert. Default 80.'),
  }),
  needsApproval: true,
  component: null,
} as const
